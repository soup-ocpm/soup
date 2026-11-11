"""
------------------------------------------------------------------------
File : builder.py
Description: build_ekg - what the legacy EventLogHandler
             (soup/core/services/event_log_handler.py) did, as a function
             any importer or operation calls with the object being
             created: EventLog.from_data -> DatasetRepository (files and
             config, source_format = the caller's format) ->
             "ekg.before_reset" -> the memgraph tool's ensure_loaded,
             whose loader runs the build pipeline (EkgService) -> counts
             and process times in the config -> "ekg.built". The graph
             state of the memgraph tool becomes a new graph key (a uuid),
             returned in meta.graph_key: an operation, whose ObjectDraft
             has no id yet, gets one too, so its object does not have to
             be built again when it is first opened. If the build fails, the
             dataset just staged is removed and the error re-raised
             (compensating action, same intent as the legacy code's
             cleanup-on-failure in Services/Graph/graph_service.py's
             create_new_dataset_s); the memgraph tool then has no active
             state. The config keeps the legacy shape, so datasets built
             before and after the packages read the same; meta_from_config() is the
             object's meta built from it.
Project : soup-packages/ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from soup_pkg_tool_memgraph.api import GraphDatabase, Query, Run

from soup.core.contracts import ConflictError, ValidationError, import_phase, validate_name
from soup.core.contracts.errors import log_error

from .build import BuildContext
from .dataset_repository import DatasetRepository
from .ekg_service import EkgService
from .event_log import (
    ACTIVITY_COLUMN,
    EVENT_ID_COLUMN,
    TIMESTAMP_COLUMN,
    ColumnMapping,
    EventLog,
    EventLogData,
    _normalize_text,
    validate_mapping,
)
from .process_timer import ProcessTimer
from .runtime import current

EKG_KIND = "ekg"
MEMGRAPH = "memgraph"
STORAGE = "storage"

# Domain events of this package (re-exported by api.py).
# Before the graph is emptied or rebuilt. Payload: {"object": id of the
# object about to be loaded (None for a dispose or a draft), "active":
# the graph key the graph holds now, "reason": "build"|"load"|"dispose"}.
EKG_BEFORE_RESET = "ekg.before_reset"
# After the EKG of a dataset was built. Payload: {"object": id (None for
# a draft), "graph_key", "dataset": folder name, "counts": {event_nodes, ...}}.
EKG_BUILT = "ekg.built"

# Same keys as the legacy Models/dataset_process_info_model.py's
# DatasetProcessInformation.to_dict(): the old frontend
# (support.service.ts's parseItemToDataset) reads this key unconditionally
# for every dataset in the list, with no null check, so it must always be
# present. The class/obs/dfc phases belong to the aggregate-graph build.
PROCESS_INFO_KEYS = (
    "init_time", "finish_time",
    "init_class_time", "finish_class_time",
    "init_event_time", "finish_event_time",
    "init_entity_time", "finish_entity_time",
    "init_corr_time", "finish_corr_time",
    "init_df_time", "finish_df_time",
    "init_class_node_time", "finish_class_node_time",
    "init_obs_time", "finish_obs_time",
    "init_dfc_time", "finish_dfc_time",
)

COUNT_KEYS = ("event_nodes", "entity_nodes", "corr_rel", "df_rel")


class RunDatabase(GraphDatabase):
    """The `run` a memgraph tool loader receives, as a GraphDatabase for the build steps."""

    def __init__(self, run: Run):
        self._run = run

    def run(self, query: Query) -> list[dict[str, Any]]:
        return self._run(query)


# A trigger/target pair: [trigger, target].
PAIR_LENGTH = 2


def empty_process_info() -> dict[str, str | None]:
    return {key: None for key in PROCESS_INFO_KEYS}


def normalize_pairs(pairs: Iterable[Sequence[str]], entity_columns: Sequence[str]) -> list[dict[str, str]]:
    """
    [[trigger, target], ...] -> the legacy trigger_target_rows
    [{"trigger", "target"}], with the names normalized like the columns
    (the legacy code compared the raw names with the normalized ones).
    :raises ValidationError: a pair that is not two entity columns
    """

    rows = []
    for raw in pairs:
        pair = (raw.get("trigger"), raw.get("target")) if isinstance(raw, dict) else raw
        if not isinstance(pair, (list, tuple)) or len(pair) != PAIR_LENGTH or not all(isinstance(v, str) for v in pair):
            raise ValidationError(f"A trigger/target pair must be two column names, got {pair!r}")
        trigger, target = (_normalize_text(value) for value in pair)
        missing = [name for name in (trigger, target) if name not in entity_columns]
        if missing:
            raise ValidationError(f"Trigger/target columns must be entity columns: {missing}")
        rows.append({"trigger": trigger, "target": target})
    return rows


def build_context(repository: DatasetRepository, dataset: str, config: dict[str, Any]) -> BuildContext:
    """The BuildContext of a staged dataset, from its config (the canonical CSV headers)."""

    return BuildContext(
        dataset_name=dataset,
        mapping=ColumnMapping(
            event_id=EVENT_ID_COLUMN,
            timestamp=TIMESTAMP_COLUMN,
            activity=ACTIVITY_COLUMN,
            entity_columns=tuple(config.get("filtered_columns") or ()),
            value_columns=tuple(config.get("values_columns") or ()),
        ),
        events_csv_path=repository.events_csv_load_path(dataset),
        entities_csv_path=repository.entities_csv_load_path(dataset),
        trigger_target_rows=tuple(config.get("trigger_target_rows") or ()),
        extra_files={
            file: repository.extra_file_load_path(dataset, file)
            for file in config.get("extra_files") or ()
            if repository.has_extra_file(dataset, file)
        },
    )


def new_graph_key() -> str:
    return str(uuid.uuid4())


def meta_from_config(
    dataset: str, config: dict[str, Any], mapping: ColumnMapping | None = None, graph_key: str | None = None
) -> dict[str, Any]:
    """
    The meta of the "ekg" object of a dataset. `mapping` is the one the
    user chose; without it (a legacy dataset) the canonical names the
    config stores are used. `graph_key` is the memgraph tool state of its
    graph (a new one if None).
    """

    standard = list(config.get("standard_columns") or (EVENT_ID_COLUMN, TIMESTAMP_COLUMN, ACTIVITY_COLUMN))
    event_id, timestamp, activity = (mapping.event_id, mapping.timestamp, mapping.activity) if mapping else standard[:3]
    return {
        "dataset": dataset,
        "graph_key": graph_key or new_graph_key(),
        "columns": list(config.get("all_columns") or []),
        "mapping": {
            "event_id": event_id,
            "timestamp": timestamp,
            "activity": activity,
            "entities": list(config.get("filtered_columns") or []),
            "values": list(config.get("values_columns") or []),
        },
        "trigger_target": [[row["trigger"], row["target"]] for row in config.get("trigger_target_rows") or []],
        "counts": {key: config.get(key, 0) for key in COUNT_KEYS},
        "process_info": {**empty_process_info(), **(config.get("process_info") or {})},
        "date_created": config.get("date_created"),
        "source_format": config.get("source_format"),
    }


def _dataset_name(repository: DatasetRepository, obj: Any, dataset: str | None) -> str:
    if dataset is not None:
        validate_name(dataset, label="Dataset")
        if repository.exists(dataset):
            raise ConflictError(f"Dataset '{dataset}' already exists")
        return dataset
    return repository.free_name(validate_name(obj.name))


def build_ekg(  # noqa: PLR0913 - public API (soup_pkg_ekg.api.build_ekg)
    obj: Any,
    data: EventLogData,
    mapping: ColumnMapping,
    tools: Any,
    *,
    dataset: str | None = None,
    description: str | None = None,
    all_columns: Sequence[str] | None = None,
    trigger_target: Iterable[Sequence[str]] = (),
    source_format: str = "",
    save_process_times: bool = False,
    extra_files: Mapping[str, bytes] | None = None,
) -> dict[str, Any]:
    """
    Stage `data` as a dataset and build its EKG on Memgraph; return the
    object's meta. `obj` is the ObjectRef being imported (its id becomes
    the graph is built for) or, from an operation, the ObjectDraft (no id
    yet); either way the graph state is a new key, meta.graph_key, which
    ensure_loaded of the registered object finds already active.
    `dataset` is the folder name (default: the object's name, made unique
    with _2, _3...); an explicit one that exists is a 409. `tools` must
    give the "memgraph" and "storage" tools (the caller declares them).
    `extra_files` ({name: content}) are staged with the dataset and
    listed in its config, for the build steps of the caller's package
    (BuildContext.extra_files); without them the dataset is as before.

    :raises ValidationError: invalid mapping (e.g. one column for two
        standard roles), columns or pairs
    :raises ConflictError: `dataset` already exists
    """

    with import_phase("column mapping"):
        validate_mapping(mapping.event_id, mapping.timestamp, mapping.activity)
    runtime = current()
    memgraph = tools.get(MEMGRAPH)
    repository = DatasetRepository(tools.get(STORAGE))

    with import_phase("event normalization"):
        log = EventLog.from_data(data, mapping)
    trigger_target_rows = normalize_pairs(trigger_target, log.mapping.entity_columns)
    name = _dataset_name(repository, obj, dataset)
    columns = data.events.columns if all_columns is None else all_columns

    with import_phase("CSV preparation"):
        events_csv = log.events_csv()
    with import_phase("entity preparation"):
        entities_csv = log.entities_csv()
    with import_phase("dataset staging"):
        repository.save_event_log(name, events_csv, entities_csv)
    if extra_files:
        repository.save_extra_files(name, extra_files)

    # filtered_columns/values_columns must match what the graph was
    # actually built with (log.mapping, already normalized by
    # EventLog.from_data), not the raw names the request came in with -
    # the legacy code that still reads this config (filters) looks these
    # columns up by their normalized form.
    #
    # standard_columns is different: the legacy /complete-graph/build
    # used these three values as literal Cypher property names against
    # the canonical events CSV - and that CSV always writes the fixed
    # "event_id"/"timestamp"/"activity_name" headers for the standard
    # roles (EventLog.events_csv), never the original mapping names.
    config: dict[str, Any] = {
        "dataset_name": name,
        "dataset_description": obj.description if description is None else description,
        "all_columns": [_normalize_text(column) for column in columns],
        "standard_columns": [EVENT_ID_COLUMN, TIMESTAMP_COLUMN, ACTIVITY_COLUMN],
        "filtered_columns": list(log.mapping.entity_columns),
        "values_columns": list(log.mapping.value_columns),
        "trigger_target_rows": trigger_target_rows,
        "source_format": source_format,
        **({"extra_files": sorted(extra_files)} if extra_files else {}),
        **{key: 0 for key in COUNT_KEYS},
        "date_created": None,
        "date_modified": None,
        "process_info": empty_process_info(),
    }
    repository.save_config(name, config)

    ctx = build_context(repository, name, config)
    object_id = getattr(obj, "id", None)
    graph_key = new_graph_key()
    counts: dict[str, int] = {}
    times: dict[str, str] = {}

    def loader(run: Run) -> None:
        service = EkgService(RunDatabase(run), runtime.build_steps)
        service.build(ctx, times if save_process_times else None)
        with import_phase("graph counts"):
            counts.update(service.counts())

    runtime.publish(EKG_BEFORE_RESET, {"object": object_id, "active": memgraph.current_state(), "reason": "build"})
    try:
        with ProcessTimer() as timer, import_phase(
            "Memgraph graph initialization", hint="Check Memgraph connectivity and privileges."
        ):
            memgraph.ensure_loaded(graph_key, loader, force=True)
    except Exception:
        # Compensating action: a dataset is never left half-built -
        # either both the staged files AND the graph exist, or neither.
        try:
            repository.delete(name)
        except Exception as cleanup:
            log_error(cleanup, {"phase": "failed dataset cleanup", "dataset": name})
        raise

    config.update(counts)
    config["date_created"] = timer.started_at
    config["date_modified"] = timer.finished_at
    config["process_info"].update(times)
    config["process_info"]["init_time"] = timer.started_at
    config["process_info"]["finish_time"] = timer.finished_at
    repository.save_config(name, config)

    runtime.publish(EKG_BUILT, {"object": object_id, "graph_key": graph_key, "dataset": name, "counts": dict(counts)})
    return meta_from_config(name, config, log.mapping, graph_key)
