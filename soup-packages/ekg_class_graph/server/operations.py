"""
------------------------------------------------------------------------
File : operations.py
Description: BuildClassGraph ("build", "Costruisci grafo aggregato"; the
             legacy POST /api/v2/graph/class and buildClassGraph of the
             detail and graph pages): from an "ekg" object, with the
             entity types to aggregate on (multiselect of the types of the
             graph, the legacy filtered_columns; a type whose events have
             null values carries the warning of the old entity selection,
             from ekg_views' NullEntities), an "ekg_class" object
             derived from it - meta.state {provider:
             "ekg_class_graph.classes", spec: {entity_types}}, meta.graph_key
             (ekg's derive_state: the classes are built on the loaded
             parent, which then is the aggregate graph; if the build fails
             the parent is rebuilt and no object is created), the counts
             (class nodes, OBSERVED, DF_C, like create_class_graph_s) and
             the times of the phases in meta.process_info.
Project : soup-packages/ekg_class_graph
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, cast

import soup_pkg_ekg.api as ekg
import soup_pkg_ekg_views.api as views_api

from soup.core.contracts import (
    Choice,
    Field,
    ObjectDraft,
    ObjectRef,
    Operation,
    OperationInput,
    ToolAccess,
    ValidationError,
)

from .classes import Run, build_classes, class_counts, entity_types_query
from .provider import CLASSES_PROVIDER
from .views import CLASS_KIND

MEMGRAPH = "memgraph"


def _db(tools: ToolAccess) -> ekg.GraphDatabase:
    return cast(ekg.GraphDatabase, tools.get(MEMGRAPH))


def graph_entity_types(obj: ObjectRef, tools: ToolAccess) -> list[str]:
    ekg.ensure_loaded(obj, tools)
    return [str(row["entity_type"]) for row in _db(tools).run(entity_types_query())
            if row.get("entity_type") is not None]


def entity_type_choices(types: list[str], tools: ToolAccess) -> tuple[Choice, ...]:
    """The entity types, labelled with the warning of the ones with null values (the graph is loaded)."""

    nulls = views_api.NullEntities()
    counts = nulls.rows(_db(tools).run(nulls.build({})))
    return tuple(
        Choice(name, f"{name} ({views_api.warning_label(counts[name])})"
            if counts.get(name) else name) for name in types
    )


class BuildClassGraph(Operation):
    id = "build"
    label = "Build aggregated graph"
    description = (
        "Group events into classes using the selected entity types (Class nodes, OBSERVED and DF_C "
        "relationships)."
    )
    group = "EKG"
    inputs = (OperationInput("ekg", (ekg.EKG_KIND,)),)
    produces = (CLASS_KIND,)
    requires_tools = (MEMGRAPH,)

    def fields(self, inputs: Mapping[str, ObjectRef], tools: ToolAccess) -> list[Field]:
        obj = inputs["ekg"]
        types = graph_entity_types(obj, tools)
        entity = (Field("entity_types", "Entity types", type="multiselect", required=True,
                        choices=entity_type_choices(types, tools),
                        help="One class for each distinct combination of their values across events.")
                  if types else
                  Field("entity_types", "Entity types", type="columns", required=True,
                      help="The graph has no entities."))
        return [Field("name", "Name", required=True, default=f"{obj.name} aggregated"), entity]

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:
        parent = inputs["ekg"]
        chosen = list(params["entity_types"])
        types = graph_entity_types(parent, tools)
        unknown = [name for name in chosen if name not in types]
        if unknown:
            raise ValidationError(f"Entity types not in the graph: {unknown}; expected some of {types}")

        result: dict[str, Any] = {}

        def build(run: Run) -> None:
            result["process_info"] = build_classes(run, chosen)
            result["counts"] = class_counts(run)

        graph_key = ekg.derive_state(parent, build, tools)
        meta = {
            "state": {"provider": CLASSES_PROVIDER, "spec": {"entity_types": chosen}},
            "graph_key": graph_key,
            "entity_types": chosen,
            "counts": result["counts"],
            "process_info": result["process_info"],
        }
        return [ObjectDraft(params["name"], CLASS_KIND, meta)]

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        ekg.dispose(obj, tools)
