"""Dataset-scoped configuration and read-only Class graph adapters."""
from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from soup.core.contracts import NotFoundError, ObjectRef, ToolAccess, ValidationError, Visualizer
from soup.core.contracts.database import Database

from .compat import UNSUPPORTED_FUNCTIONS
from .contributions import RESULT_KIND, SOURCE_KINDS, _configs, _entity_types, _properties, _source_db
from .ocean_lib.aggregation.grammar import AggregationFunction

MAX_ID_LENGTH = 512


def _clean(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): _clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if callable(getattr(value, "iso_format", None)):
        return value.iso_format()
    return value if value is None or isinstance(value, (str, int, float, bool)) else str(value)


def _node(row: Mapping[str, Any]) -> dict[str, Any]:
    props = _clean(row["props"])
    name = str(props.get("Name") or props.get("Agg") or "Class")
    count = props.get("Count")
    return {"id": row["id"], "label": f"{name} ({count})" if count is not None else name,
            "group": str(props.get("Origin") or "Class"), "props": props}


def _identity(db: Database, variable: str) -> str:
    return f"elementId({variable})" if db.backend == "neo4j" else f"toString(id({variable}))"


class OceanStudio(Visualizer):
    id = "studio"
    label = "Ocean aggregation studio"
    accepts = SOURCE_KINDS
    element = "soup-ocean-studio"

    def __init__(self, database: Database):
        self.database = database

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if obj.meta.get("import_status", "complete") != "complete":
            raise ValidationError("Complete the OCED import before configuring aggregation")
        _, ekg = _configs(obj)
        db = _source_db(self.database, obj)
        return {"event_properties": _properties(db, "Event"),
                "entity_types": _entity_types(db, ekg.type_tag),
                "functions": [fn.value for fn in AggregationFunction if fn.value not in UNSUPPORTED_FUNCTIONS],
                "backend": db.backend}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name == "replacement":
            db = _source_db(self.database, obj)
            return {"classes": db.execute("MATCH (c:Class) RETURN count(c) AS classes")[0]["classes"]}
        if name != "schema":
            raise NotFoundError(f"Unknown studio action: {name}")
        _, ekg = _configs(obj)
        db = _source_db(self.database, obj)
        kind = params.get("entity_type")
        if not isinstance(kind, str) or kind not in _entity_types(db, ekg.type_tag):
            raise ValidationError("Select an existing entity type in this dataset")
        return {"properties": _properties(db, "Entity", ekg.type_tag, kind)}


class OceanVisualizer(Visualizer):
    id = "class_graph"
    label = "Ocean class graph"
    accepts = (RESULT_KIND,)
    element = "soup-ocean-class-graph"

    def __init__(self, database: Database):
        self.database = database

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess,
    ) -> Any:
        db = _source_db(self.database, obj)

        node_identity = _identity(db, "c")
        source_identity = _identity(db, "a")
        target_identity = _identity(db, "b")
        rel_identity = _identity(db, "r")

        node_limit = 300
        edge_limit = 700

        # Retrieve DF_C relationships first.
        rows = db.execute(
            "MATCH (a:Class)-[r:DF_C]->(b:Class) "
            f"RETURN {rel_identity} AS id, "
            f"{source_identity} AS source, "
            f"{target_identity} AS target, "
            "properties(r) AS props "
            "LIMIT $limit",
            {"limit": edge_limit},
        )

        edges = [
            {
                "id": row["id"],
                "source": row["source"],
                "target": row["target"],
                "label": "DF_C",
                "group": "DF_C",
                "props": _clean(row["props"]),
            }
            for row in rows
        ]

        # Only include nodes participating in retrieved relationships.
        connected_ids = {
            node_id
            for edge in edges
            for node_id in (edge["source"], edge["target"])
        }

        # Respect node limit without creating dangling relationships.
        selected_ids = set(sorted(connected_ids)[:node_limit])

        edges = [
            edge
            for edge in edges
            if edge["source"] in selected_ids
            and edge["target"] in selected_ids
        ]

        # Remove nodes that became isolated after limiting.
        selected_ids = {
            node_id
            for edge in edges
            for node_id in (edge["source"], edge["target"])
        }

        nodes = []
        if selected_ids:
            nodes = [
                _node(row)
                for row in db.execute(
                    "MATCH (c:Class) "
                    f"WHERE {node_identity} IN $ids "
                    f"RETURN {node_identity} AS id, "
                    "properties(c) AS props",
                    {"ids": list(selected_ids)},
                )
            ]

        # Count only Class nodes participating in DF_C relationships.
        total = db.execute(
            "MATCH (c:Class)-[:DF_C]-(other:Class) "
            "RETURN count(DISTINCT c) AS total"
        )[0]["total"]

        return {
            "graph": {
                "nodes": nodes,
                "edges": edges,
                "directed": True,
            },
            "total": total,
            "limit": node_limit,
            "edge_limit": edge_limit,
            "backend": db.backend,
            "benchmark": obj.meta.get("benchmark", {}),
        }
    
    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name == "graph":
            return self.data(obj, params, tools)
        if name != "node":
            raise NotFoundError(f"Unknown Class graph action: {name}")
        node_id = params.get("id")
        if not isinstance(node_id, str) or not node_id or len(node_id) > MAX_ID_LENGTH:
            raise ValidationError("Provide a valid Class node identity")
        db = _source_db(self.database, obj)
        identity = _identity(db, "c")
        rows = db.execute(
            f"MATCH (c:Class) WHERE {identity} = $id "
            f"RETURN {identity} AS id, properties(c) AS props LIMIT 1", {"id": node_id})
        return _node(rows[0]) if rows else None
