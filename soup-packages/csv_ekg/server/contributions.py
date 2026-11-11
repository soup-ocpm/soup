"""
------------------------------------------------------------------------
File : contributions.py
Description: The contributions of csv_ekg, which replaces the csv_reader
             package and the old "New dataset" form:
             - CsvEkgImporter ("csv", "CSV come event log (EKG su
               Memgraph)"): a .csv read with pandas (dtype=str) becomes an
               "ekg" object. inspect() shows the first rows and the fields
               of the old NewDatasetComponent form: event_id, timestamp,
               activity (one column each, three different ones,
               required), entities and values (columns), trigger_target
               (pairs of entity columns, for
               causal_df) and save_process_times (the old
               process_execution). preview() adds, with at least two
               entity columns, the graph of their multiplicities (the old
               UML diagram). import_() hands the log to the ekg package's
               build_ekg, which stages the dataset on the volume and
               builds the EKG on Memgraph.
             - TableToEkg ("to_ekg", "Converti in EKG"): the same fields
               for a "table" object of csv_table (read with its
               read_table), producing an "ekg" child of the table.
             Both dispose of their objects through the ekg package. inspect
             and preview only read the file: they work without a running
             Memgraph (the tool connects on first use).
Project : soup-packages/csv_ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, cast

from soup_pkg_csv_table.api import KIND as TABLE_KIND
from soup_pkg_csv_table.api import read_table
from soup_pkg_ekg.api import EKG_KIND, ColumnMapping, EventLogData, Table, build_ekg, dispose, validate_mapping

from soup.core.contracts import (
    Choice,
    Field,
    Importer,
    Inspection,
    ObjectDraft,
    ObjectRef,
    Operation,
    OperationInput,
    ToolAccess,
    Upload,
    ValidationError,
    import_phase,
    report,
)

from .multiplicity import multiplicity_block
from .reader import FORMAT_ID, read_csv

MEMGRAPH = "memgraph"
STORAGE = "storage"
PREVIEW_ROWS = 20
PAIR_LENGTH = 2  # [trigger, target]

STANDARD_FIELDS = ("event_id", "timestamp", "activity")

# Guesses for the defaults of the three standard columns: names compared
# lower-case without spaces, "_" and "-"; an exact match wins.
_GUESSES = {
    "event_id": ("eventid", "id"),
    "timestamp": ("timestamp", "time", "date"),
    "activity": ("activity", "activityname", "action"),
}


def _key(name: str) -> str:
    return re.sub(r"[\s_\-]+", "", name).lower()


def _guess(columns: Sequence[str], field: str) -> str | None:
    keys = {column: _key(column) for column in columns}
    for keyword in _GUESSES[field]:
        for column, key in keys.items():
            if key == keyword:
                return column
    for keyword in _GUESSES[field]:
        for column, key in keys.items():
            if keyword in key:
                return column
    return None


def mapping_fields(columns: Sequence[str]) -> list[Field]:
    """The fields of the old import form, with these columns as choices."""

    columns = [str(column) for column in columns]
    choices = cast("tuple[Choice, ...]", columns or None)
    return [
        Field("event_id", "Event ID", type="column", required=True, choices=choices,
              default=_guess(columns, "event_id")),
        Field("timestamp", "Timestamp", type="column", required=True, choices=choices,
              default=_guess(columns, "timestamp")),
        Field("activity", "Activity", type="column", required=True, choices=choices,
              default=_guess(columns, "activity")),
        Field("entities", "Entity columns", type="columns", choices=choices,
              help="Create :Entity nodes linked to events through :CORR and :DF. "
                   "With at least two, the preview shows their multiplicities."),
        Field("values", "Property columns", type="columns", choices=choices,
              help="Keep as properties of :Event nodes."),
        Field("trigger_target", "Trigger/target pairs", type="pairs", choices=choices,
              help="Entity-column pairs for causal :DF (causal_df package)."),

    ]


@dataclass(frozen=True)
class Options:
    mapping: ColumnMapping
    trigger_target: tuple[tuple[str, str], ...]
    save_process_times: bool


def _column(options: Mapping[str, Any], name: str, columns: Sequence[str]) -> str:
    value = options.get(name)
    if value is None or value == "":
        raise ValidationError(f"'{name}' is required", details={"phase": "column mapping", "field": name})
    if not isinstance(value, str):
        raise ValidationError(
            f"'{name}' must select one column name, not a {type(value).__name__}. "
            "Choose a single column for this role; use entity/value selections for multiple columns.",
            details={"phase": "column mapping", "field": name, "value_type": type(value).__name__},
        )
    if not isinstance(value, str) or value not in columns:
        raise ValidationError(f"'{name}' must be one of the columns {list(columns)}, got {value!r}")
    return value


def _columns(options: Mapping[str, Any], name: str, columns: Sequence[str]) -> tuple[str, ...]:
    value = options.get(name)
    if value is None or value == "":
        return ()
    if not isinstance(value, (list, tuple)) or not all(isinstance(item, str) for item in value):
        raise ValidationError(f"'{name}' must be a list of column names")
    unknown = [item for item in value if item not in columns]
    if unknown:
        raise ValidationError(f"'{name}' refers to unknown columns {unknown}")
    return tuple(dict.fromkeys(value))


def _pairs(options: Mapping[str, Any], entities: Sequence[str]) -> tuple[tuple[str, str], ...]:
    value = options.get("trigger_target")
    if value is None or value == "":
        return ()
    if not isinstance(value, (list, tuple)):
        raise ValidationError("'trigger_target' must be a list of [trigger, target] pairs")
    pairs = []
    for pair in value:
        if (
            not isinstance(pair, (list, tuple))
            or len(pair) != PAIR_LENGTH
            or not all(isinstance(item, str) for item in pair)
        ):
            raise ValidationError(f"Each trigger/target pair must be two column names, got {pair!r}")
        missing = [item for item in pair if item not in entities]
        if missing:
            raise ValidationError(f"Trigger/target columns must be among the entity columns: {missing}")
        pairs.append((pair[0], pair[1]))
    return tuple(pairs)


def _bool(value: Any, name: str) -> bool:
    if value is None or value == "":
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in ("true", "false", "1", "0"):
        return value.strip().lower() in ("true", "1")
    raise ValidationError(f"'{name}' must be true or false, got {value!r}")


def parse_options(options: Mapping[str, Any], columns: Sequence[str]) -> Options:
    """
    The import options (not checked by the core: the importer does it).
    :raises ValidationError: a missing standard column, one column for two
        standard roles, unknown columns, bad pairs
    """

    entities = _columns(options, "entities", columns)
    mapping = ColumnMapping(
        event_id=_column(options, "event_id", columns),
        timestamp=_column(options, "timestamp", columns),
        activity=_column(options, "activity", columns),
        entity_columns=entities,
        value_columns=_columns(options, "values", columns),
    )
    validate_mapping(mapping.event_id, mapping.timestamp, mapping.activity, columns=columns)
    return Options(mapping, _pairs(options, entities), _bool(options.get("save_process_times"), "save_process_times"))


def _preview_table(table: Table) -> dict[str, Any]:
    rows = [["" if cell is None else cell for cell in row] for row in table.rows[:PREVIEW_ROWS]]
    return report.table(list(table.columns), rows, total=len(table), title=f"First {PREVIEW_ROWS} rows")


def _optional_list(options: Mapping[str, Any], name: str) -> list[str] | None:
    value = options.get(name)
    if value is None:
        return None
    if not isinstance(value, (list, tuple)) or not all(isinstance(item, str) for item in value):
        raise ValidationError(f"'{name}' must be a list of strings")
    return list(value)


class CsvEkgImporter(Importer):
    id = "csv"
    label = "CSV as event log (EKG on Memgraph)"
    description = (
        "Reads the file as an event log (one row per event), normalizes it and builds its event knowledge graph"
        " on Memgraph."
    )
    extensions = (".csv",)
    produces = EKG_KIND
    requires_tools = (MEMGRAPH, STORAGE)

    def inspect(self, upload: Upload, tools: ToolAccess) -> Inspection:
        table = read_csv(upload.stream).events
        return Inspection(preview=(_preview_table(table),), fields=tuple(mapping_fields(table.columns)))

    def preview(self, upload: Upload, options: Mapping[str, Any], tools: ToolAccess) -> list[dict[str, Any]]:
        table = read_csv(upload.stream).events
        blocks = [_preview_table(table)]
        with import_phase("column mapping"):
            standard = {_column(options, name, table.columns) for name in STANDARD_FIELDS
                        if options.get(name) is not None and options.get(name) != ""}
        entities = [column for column in _columns(options, "entities", table.columns) if column not in standard]
        graph = multiplicity_block(table, entities)
        if graph is not None:
            blocks.append(graph)
        return blocks

    def import_(self, upload: Upload, obj: ObjectRef, options: Mapping[str, Any], tools: ToolAccess) -> dict[str, Any]:
        data = read_csv(upload.stream)
        with import_phase("column mapping"):
            parsed = parse_options(options, data.events.columns)
        # Optional: "dataset" names the folder (default: the object name),
        # "all_columns" the columns recorded in the config (default: the header).
        dataset = options.get("dataset")
        if dataset is not None and not isinstance(dataset, str):
            raise ValidationError("'dataset' must be a string")
        return build_ekg(
            obj,
            data,
            parsed.mapping,
            tools,
            dataset=dataset or None,
            all_columns=_optional_list(options, "all_columns"),
            trigger_target=parsed.trigger_target,
            source_format=FORMAT_ID,
            save_process_times=parsed.save_process_times,
        )

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        dispose(obj, tools)


def _child_name(source: ObjectRef) -> str:
    return f"{source.name[:120].rstrip()} (EKG)"


class TableToEkg(Operation):
    id = "to_ekg"
    label = "Convert to EKG"
    description = "Reads the table as an event log and builds its event knowledge graph on Memgraph."
    group = "EKG"
    inputs = (OperationInput("table", (TABLE_KIND,)),)
    produces = (EKG_KIND,)
    requires_tools = (MEMGRAPH, STORAGE)

    def fields(self, inputs: Mapping[str, ObjectRef], tools: ToolAccess) -> list[Field]:
        return mapping_fields(inputs["table"].meta.get("columns") or [])

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:
        source = inputs["table"]
        columns, rows = read_table(source, tools)
        # The stored table keeps empty cells as "": as None, like pandas reads them.
        table = Table(tuple(columns), tuple(tuple(cell or None for cell in row) for row in rows))
        parsed = parse_options(params, table.columns)
        draft = ObjectDraft(name=_child_name(source), kind=EKG_KIND, description=source.description)
        draft.meta = build_ekg(
            draft,
            EventLogData(events=table),
            parsed.mapping,
            tools,
            trigger_target=parsed.trigger_target,
            source_format="csv_table",
            save_process_times=parsed.save_process_times,
        )
        return [draft]

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        dispose(obj, tools)
