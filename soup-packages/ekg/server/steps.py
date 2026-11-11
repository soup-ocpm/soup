"""
------------------------------------------------------------------------
File : steps.py
Description: The EKG build steps of this package (moved here from
             soup/core/ekg/steps.py), reproducing the pipeline
             Services/generic_graph_service.py's create_complete_graphs_s
             runs, split into ordered, independently testable
             EkgBuildStep units:

                  50  CreateIndexesStep     missing lookup indexes, before MERGE
                 100  LoadEventsStep        LOAD CSV -> :Event
                 200  LoadEntitiesStep      LOAD CSV -> :Entity
                 400  CorrelationStep       :CORR per entity column
                 500  DirectlyFollowsStep   :DF per entity column,
                                            skipping types a contributed
                                            step (order 450, see
                                            soup-packages/causal_df) has
                                            already handled via
                                            ctx.df_handled_types
Project : soup-packages/ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

from soup_pkg_tool_memgraph.api import GraphDatabase, Query

from soup.core.contracts import DomainError, import_phase

from . import schema
from .build import BuildContext, EkgBuildStep


def _entity_types(ctx: BuildContext) -> list[str]:
    """
    Entity/object-type columns to correlate/directly-follow, in mapping
    order, excluding the 3 standard roles - mirrors the legacy guard in
    Services/generic_graph_service.py
    (`if key not in ['event_id', 'timestamp', 'activity_name']` /
    `if key not in standard_columns`).
    """

    mapping = ctx.mapping
    standard = {mapping.event_id, mapping.timestamp, mapping.activity}
    seen: set[str] = set()
    result: list[str] = []
    for column in mapping.entity_columns:
        if column in standard or column in seen:
            continue
        seen.add(column)
        result.append(column)
    return result


def _extra_event_properties(ctx: BuildContext) -> list[str]:
    """Columns (entity and/or value) staged as plain Event properties, in mapping order."""

    mapping = ctx.mapping
    standard = {mapping.event_id, mapping.timestamp, mapping.activity}
    seen: set[str] = set()
    result: list[str] = []
    for column in (*mapping.entity_columns, *mapping.value_columns):
        if column in standard or column in seen:
            continue
        seen.add(column)
        result.append(column)
    return result


class LoadEventsStep(EkgBuildStep):
    key = "load_events"
    order = 100
    phase = "event"

    def execute(self, ctx: BuildContext, db: GraphDatabase) -> None:
        db.run(schema.load_events_query(ctx.events_csv_path, _extra_event_properties(ctx)))


class LoadEntitiesStep(EkgBuildStep):
    key = "load_entities"
    order = 200
    phase = "entity"

    def execute(self, ctx: BuildContext, db: GraphDatabase) -> None:
        db.run(schema.load_entities_query(ctx.entities_csv_path))


def index_keys(db: GraphDatabase) -> set[tuple[str, tuple[str, ...]]]:
    """Normalize old scalar and current list-valued Memgraph index metadata."""

    existing: set[tuple[str, tuple[str, ...]]] = set()
    for record, row in enumerate(db.run(Query("SHOW INDEX INFO")), start=1):
        if row.get("index type") not in ("label", "label+property"):
            continue
        label, properties = row.get("label"), row.get("property")
        if row.get("index type") == "label":
            properties = ()
        elif isinstance(properties, str):
            properties = (properties,)
        if not isinstance(label, str) or not isinstance(properties, (list, tuple)) or not all(
            isinstance(prop, str) for prop in properties
        ) or (row.get("index type") == "label+property" and not properties):
            raise DomainError(
                "Memgraph returned unsupported index metadata; check the server version and backend logs. "
                "This is a database metadata error, not a CSV validation error.",
                details={"phase": "index setup", "field": f"index metadata record {record}",
                         "value_type": type(properties).__name__},
            )
        existing.add((label, tuple(properties)))
    return existing


class CreateIndexesStep(EkgBuildStep):
    key = "create_indexes"
    order = 50
    phase = "index"

    def execute(self, ctx: BuildContext, db: GraphDatabase) -> None:
        existing = index_keys(db)
        for (label, prop), factory in schema.INDEXES.items():
            if (label, (prop,)) not in existing:
                db.run(factory())


class CorrelationStep(EkgBuildStep):
    key = "correlation"
    order = 400
    phase = "corr"

    def execute(self, ctx: BuildContext, db: GraphDatabase) -> None:
        for entity_type in _entity_types(ctx):
            with import_phase("CORR", column=entity_type):
                db.run(schema.create_corr_relationships_query(entity_type))


class DirectlyFollowsStep(EkgBuildStep):
    key = "directly_follows"
    order = 500
    phase = "df"

    def execute(self, ctx: BuildContext, db: GraphDatabase) -> None:
        for entity_type in _entity_types(ctx):
            if entity_type in ctx.df_handled_types:
                continue
            with import_phase("DF", column=entity_type):
                db.run(schema.create_df_relationships_query(entity_type))


def core_steps() -> list[EkgBuildStep]:
    """Fresh instances of this package's build steps, unordered (the caller sorts by .order)."""

    return [LoadEventsStep(), LoadEntitiesStep(), CreateIndexesStep(), CorrelationStep(), DirectlyFollowsStep()]
