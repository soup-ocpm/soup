"""Closed, bounded read queries only. Scenes live in application storage, never in Cypher."""
from __future__ import annotations

import hashlib
import importlib
import json
import math
import re
import threading
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from typing import Any
from uuid import uuid4

from soup_pkg_tool_storage.api import StorageTool

from soup.core.contracts import NotFoundError, ObjectRef, ToolAccess, ValidationError, Visualizer
from soup.core.contracts.database import Database

MAX_NODES = 1000
MAX_EDGES = 2000
PAGE = 200
MAX_DEPTH = 6
MAX_SCENES = 50
MAX_SCENE_BYTES = 2_000_000
MAX_TEXT = 256
MAX_ID_TEXT = 512
MAX_NAME = 120
MAX_SEEDS = 50
MAX_FILTERS = 10
MAX_TYPES = 100
SCHEMA_ROWS = 1000
EDGE_ROWS = MAX_NODES // 2
PATH_ENDPOINTS = 2

CLASS = "Class"
CLASS_KEYS = ("Event_Id", "Type", "Count")
CAPTION_KEYS = ("eventName", "ActivityName", "name", "Name", "Value", "wyId", "id", "Event_Id")
TYPED_EDGES = {"DF": "Type", "DF_C": "Type", "REL": "qualifier"}

TEXT_OPS = {"contains": "CONTAINS", "starts": "STARTS WITH", "ends": "ENDS WITH"}
RANGE_OPS = {"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
FILTER_OPS = frozenset({"exists", "eq", "ne", *TEXT_OPS, *RANGE_OPS})
FILTER_KEYS = frozenset({"target", "label", "property", "op", "value"})
TARGETS = ("nodes", "edges")
LABEL_CLAUSE = "(size($labels) = 0 OR any(label IN labels({v}) WHERE label IN $labels))"
TYPE_CLAUSE = "(size($types) = 0 OR type(r) IN $types)"


def integer(value: Any, default: int, maximum: int) -> int:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= maximum:
        raise ValidationError(f"Expected an integer between 1 and {maximum}")
    return value


def clean(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    return str(value)


def strings(value: Any, maximum: int = MAX_SEEDS) -> list[str]:
    if not isinstance(value, list) or len(value) > maximum or any(
        not isinstance(item, str) or not item or len(item) > MAX_ID_TEXT for item in value
    ):
        raise ValidationError(f"Expected at most {maximum} non-empty text values")
    return list(dict.fromkeys(value))


def caption_of(labels: list[str], props: Mapping[str, Any], fallback: str) -> str:
    """Class nodes are named by what they aggregate, never by their generated identifier."""
    if CLASS in labels:
        if props.get("Name") is not None:
            return str(props["Name"])
        values = [str(value) for key, value in sorted(props.items()) if key not in CLASS_KEYS and value is not None]
        if values:
            return " / ".join(values)
    return next((str(props[key]) for key in CAPTION_KEYS if props.get(key) is not None), fallback)


def edge_label(rel_type: str, props: Mapping[str, Any]) -> str:
    """DF / DF_C / REL are told apart by the entity type or qualifier they carry."""
    key = TYPED_EDGES.get(rel_type)
    title = str(props[key]) if key and props.get(key) is not None else rel_type
    if rel_type == "DF_C":
        frequency = next((props[k] for k in ("Count", "count", "freq", "frequency")
                          if props.get(k) is not None), None)
        if frequency is not None:
            return f"{title} · {frequency}"
    return title


def filter_value(op: str, value: Any) -> Any:
    if isinstance(value, bool) or value is None:
        raise ValidationError("Filter values must be text or numbers")
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise ValidationError("Filter numbers must be finite")
        return str(value) if op in TEXT_OPS else value
    if isinstance(value, str) and len(value) <= MAX_TEXT:
        return value
    raise ValidationError(f"Filter values must be text or numbers of at most {MAX_TEXT} characters")


def filter_spec(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict) or set(item) - FILTER_KEYS:
        raise ValidationError("Invalid filter")
    target, op, prop, label = item.get("target", "nodes"), item.get("op"), item.get("property"), item.get("label", "")
    if target not in TARGETS or not isinstance(op, str) or op not in FILTER_OPS:
        raise ValidationError("A filter needs a target (nodes or edges) and a supported operator")
    if not isinstance(prop, str) or not prop or len(prop) > MAX_TEXT or not isinstance(label, str) or len(label) > MAX_TEXT:
        raise ValidationError(f"A filter needs a property and a label of at most {MAX_TEXT} characters")
    return {"target": target, "label": label, "property": prop, "op": op,
            "value": None if op == "exists" else filter_value(op, item.get("value"))}


def filter_specs(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > MAX_FILTERS:
        raise ValidationError(f"Expected at most {MAX_FILTERS} filters")
    return [filter_spec(item) for item in value]


def filter_parameters(specs: list[dict[str, Any]]) -> dict[str, Any]:
    """Property names and values are always parameters; only fixed operator templates reach the text."""
    params: dict[str, Any] = {}
    for index, spec in enumerate(specs):
        params[f"f{index}p"] = spec["property"]
        if spec["op"] != "exists":
            params[f"f{index}v"] = spec["value"]
        if spec["label"] and spec["target"] == "nodes":
            params[f"f{index}l"] = spec["label"]
    return params


def comparison(spec: dict[str, Any], prop: str, value: str) -> str:
    op = spec["op"]
    if op == "exists":
        return f"{prop} IS NOT NULL"
    if op == "eq":
        return f"toString({prop}) = toString({value})"
    if op == "ne":
        return f"NOT (toString({prop}) = toString({value}))"
    if op in TEXT_OPS:
        return f"toLower(toString({prop})) {TEXT_OPS[op]} toLower({value})"
    # Numbers compare as numbers; text (e.g. ISO datetimes) compares as text.
    left = f"toString({prop})" if isinstance(spec["value"], str) else f"toFloat(toString({prop}))"
    return f"{left} {RANGE_OPS[op]} {value}"


def filter_clauses(specs: list[dict[str, Any]], target: str, variables: tuple[str, ...]) -> list[str]:
    clauses: list[str] = []
    for index, spec in enumerate(specs):
        if spec["target"] != target:
            continue
        for variable in variables:
            clause = comparison(spec, f"properties({variable})[$f{index}p]", f"$f{index}v")
            if spec["label"] and target == "nodes":
                clause = f"(NOT ($f{index}l IN labels({variable})) OR ({clause}))"
            clauses.append(clause)
    return clauses


def tally(table: dict[str, dict[str, Any]], name: str, row: Mapping[str, Any]) -> None:
    entry = table.setdefault(name, {"name": name, "count": 0, "properties": set()})
    entry["count"] += row["count"]
    entry["properties"].update(row["keys"])


def ordered(table: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    entries = [{**entry, "properties": sorted(entry["properties"])} for entry in table.values()]
    return sorted(entries, key=lambda entry: (-entry["count"], entry["name"]))


def schema_summary(node_rows: list[Mapping[str, Any]], edge_rows: list[Mapping[str, Any]]) -> dict[str, Any]:
    labels: dict[str, dict[str, Any]] = {}
    types: dict[str, dict[str, Any]] = {}
    for row in node_rows:
        for label in row["labels"]:
            tally(labels, str(label), row)
    for row in edge_rows:
        tally(types, str(row["type"]), row)
    return {"labels": ordered(labels), "types": ordered(types),
            "truncated": max(len(node_rows), len(edge_rows)) >= SCHEMA_ROWS}


def advance(frontier: list[str], edges: list[dict[str, Any]], visited: set[str],
            parents: dict[str, tuple[str, str]]) -> list[str]:
    following = []
    for edge in edges:
        source, dest = edge["source"], edge["target"]
        if dest in frontier:
            source, dest = dest, source
        if source in frontier and dest not in visited:
            parents[dest] = source, edge["id"]
            visited.add(dest)
            following.append(dest)
    return following


def scene_payload(obj: ObjectRef, scene_id: str, scene: Any) -> tuple[dict[str, Any], bytes]:
    if not isinstance(scene, dict) or not isinstance(scene.get("name"), str) or not scene["name"].strip():
        raise ValidationError("A scene requires a name and visualization state")
    graph = scene.get("graph", {})
    if (not isinstance(graph, dict) or not isinstance(graph.get("nodes"), list)
            or not isinstance(graph.get("edges"), list)):
        raise ValidationError("A scene requires graph nodes and edges")
    if len(graph["nodes"]) > MAX_NODES or len(graph["edges"]) > MAX_EDGES:
        raise ValidationError("Scene graph exceeds the display limit")
    document = {"id": scene_id, "dataset": obj.id, "version": 1, "scene": scene}
    try:
        payload = json.dumps(document, allow_nan=False).encode()
    except (ValueError, TypeError):
        raise ValidationError("Scene must contain valid JSON values") from None
    if len(payload) > MAX_SCENE_BYTES or len(scene["name"]) > MAX_NAME:
        raise ValidationError("Scene exceeds the 2 MB or 120-character name limit")
    return document, payload


class Explorer(Visualizer):
    id = "explore"
    label = "Graph Explorer"
    element = "soup-pkg-graph-explorer"
    accepts = ("ekg", "ekg_class", "oced_importer.log", "ocean_aggregation.graph")
    requires_tools = ("storage",)

    def __init__(self, database: Database):
        self.database = database
        self._scene_lock = threading.RLock()

    @staticmethod
    @contextmanager
    def _read_context(db: Database, obj: ObjectRef) -> Iterator[None]:
        if db.backend == "neo4j":
            yield
            return
        # The generic Memgraph adapter can rebuild a dataset on demand. Refuse
        # that implicit write here; only the existing EKG workflow may load it.
        try:
            ekg = importlib.import_module("soup_pkg_ekg.api")
            memgraph = ekg.graph_tools().get("memgraph")
        except (ImportError, RuntimeError) as exc:
            raise ValidationError("Load this Memgraph dataset with the EKG workflow before exploring it.") from exc
        with memgraph.session():
            if not memgraph.is_loaded(ekg.graph_key_of(obj)):
                raise ValidationError("Load this dataset using Load EKG first. Graph Explorer never rebuilds graphs.")
            yield

    @staticmethod
    def _identity(db: Database, variable: str) -> str:
        return f"elementId({variable})" if db.backend == "neo4j" else f"id({variable})"

    def _columns(self, db: Database, variable: str) -> str:
        return (f"{self._identity(db, variable)} AS {variable}_id, labels({variable}) AS {variable}_labels, "
                f"properties({variable}) AS {variable}_props")

    @staticmethod
    def _node(row: Mapping[str, Any], variable: str, obj: ObjectRef) -> dict[str, Any]:
        props = clean(row[f"{variable}_props"])
        labels = sorted(row[f"{variable}_labels"])
        signature = hashlib.sha256(json.dumps([obj.id, labels, props], sort_keys=True).encode()).hexdigest()[:16]
        identity = f"{row[f'{variable}_id']}~{signature}"
        return {"id": identity, "label": caption_of(labels, props, identity), "group": ":".join(labels),
                "props": props}

    @staticmethod
    def _edge(row: Mapping[str, Any], source: Mapping[str, Any], target: Mapping[str, Any]) -> dict[str, Any]:
        props = clean(row["r_props"])
        return {"id": str(row["r_id"]), "source": source["id"], "target": target["id"],
                "label": edge_label(str(row["r_type"]), props), "group": row["r_type"], "props": props}

    @staticmethod
    def _raw(db: Database, refs: list[str]) -> list[Any]:
        raw: list[Any] = []
        for ref in refs:
            value, separator, signature = ref.rpartition("~")
            if not separator or not re.fullmatch(r"[0-9a-f]{16}", signature):
                raise ValidationError("Invalid graph identity; refresh the scene")
            if db.backend == "memgraph":
                if not re.fullmatch(r"\d{1,20}", value):
                    raise ValidationError("Invalid Memgraph node identity")
                raw.append(int(value))
            else:
                raw.append(value)
        return raw

    def _validate_refs(self, db: Database, obj: ObjectRef, refs: list[str]) -> None:
        rows = db.execute(f"MATCH (n) WHERE {self._identity(db, 'n')} IN $ids "
                          f"RETURN {self._columns(db, 'n')} LIMIT $limit",
                          {"ids": self._raw(db, refs), "limit": len(refs) + 1})
        if {self._node(row, "n", obj)["id"] for row in rows} != set(refs):
            raise ValidationError("Scene identities are stale or belong to another dataset. Refresh the scene.")

    def _schema(self, db: Database) -> dict[str, Any]:
        """Every label and relationship type with its property keys, in one aggregate read per kind."""
        nodes = db.execute("MATCH (n) RETURN labels(n) AS labels, keys(n) AS keys, count(*) AS count LIMIT $limit",
                           {"limit": SCHEMA_ROWS})
        edges = db.execute("MATCH ()-[r]->() RETURN type(r) AS type, keys(r) AS keys, count(*) AS count LIMIT $limit",
                           {"limit": SCHEMA_ROWS})
        return schema_summary(nodes, edges)

    def _pattern_rows(self, db: Database, where: list[str], binds: Mapping[str, Any], limit: int) -> list[Any]:
        return db.execute(
            f"MATCH (n)-[r]->(m) WHERE {' AND '.join(where)} "
            f"RETURN {self._columns(db, 'n')}, {self._columns(db, 'm')}, "
            f"{self._identity(db, 'r')} AS r_id, type(r) AS r_type, properties(r) AS r_props LIMIT $limit",
            {**binds, "limit": limit})

    def _incident_types(self, db: Database, pattern: str, refs: list[str]) -> list[str]:
        rows = db.execute(f"MATCH {pattern} WHERE {self._identity(db, 'n')} IN $ids "
                          "RETURN type(r) AS type, count(r) AS count LIMIT $limit",
                          {"ids": self._raw(db, refs), "limit": MAX_TYPES})
        return sorted({str(row["type"]) for row in rows})

    def _neighbors(self, db: Database, obj: ObjectRef, refs: list[str], params: Mapping[str, Any],
                   limit: int) -> dict[str, Any]:
        direction = params.get("direction", "both")
        patterns = {"both": "(n)-[r]-(m)", "out": "(n)-[r]->(m)", "in": "(n)<-[r]-(m)"}
        if not isinstance(direction, str) or direction not in patterns:
            raise ValidationError("Direction must be both, out or in")
        # Each relationship type gets its own share of the limit, so a few
        # rare types (e.g. DF_C) are not crowded out by thousands of others (e.g. OBSERVED).
        chosen = strings(params.get("types", [])) or self._incident_types(db, patterns[direction], refs)
        share = max(1, -(-limit // max(1, len(chosen))))
        rows: list[Any] = []
        truncated = False
        for kind in chosen:
            part = db.execute(
                f"MATCH {patterns[direction]} WHERE {self._identity(db, 'n')} IN $ids AND type(r) = $kind "
                f"RETURN {self._columns(db, 'n')}, {self._columns(db, 'm')}, "
                f"{self._identity(db, 'r')} AS r_id, type(r) AS r_type, properties(r) AS r_props, "
                f"{self._identity(db, 'startNode(r)')} AS source LIMIT $limit",
                {"ids": self._raw(db, refs), "kind": kind, "limit": share + 1})
            truncated |= len(part) > share
            rows.extend(part[:share])
        nodes: dict[str, Any] = {}
        edges: dict[str, Any] = {}
        for row in rows:
            n, m = self._node(row, "n", obj), self._node(row, "m", obj)
            if n["id"] not in refs:
                raise ValidationError("Graph identities changed during exploration. Refresh the scene.")
            nodes[n["id"]], nodes[m["id"]] = n, m
            source, target = (n, m) if str(row["source"]) == str(row["n_id"]) else (m, n)
            edges[str(row["r_id"])] = self._edge(row, source, target)
        return {"nodes": list(nodes.values()), "edges": list(edges.values()), "directed": True,
                "truncated": truncated}

    def _sample(self, db: Database, obj: ObjectRef, params: Mapping[str, Any]) -> dict[str, Any]:
        limit = integer(params.get("limit"), PAGE, MAX_NODES)
        labels = strings(params.get("labels", []))
        text, prop = params.get("text", ""), params.get("property", "")
        if not isinstance(text, str) or len(text) > MAX_TEXT or not isinstance(prop, str) or len(prop) > MAX_TEXT:
            raise ValidationError("Search text and property must be text of at most 256 characters")
        scan = MAX_NODES if text else limit
        rows = db.execute("MATCH (n) WHERE size($labels) = 0 OR any(label IN labels(n) WHERE label IN $labels) "
                          f"RETURN {self._columns(db, 'n')} LIMIT $limit", {"labels": labels, "limit": scan + 1})
        nodes = [self._node(row, "n", obj) for row in rows[:scan]]
        if text:
            nodes = [node for node in nodes if text.casefold() in
                     json.dumps(node["props"].get(prop) if prop else node["props"], ensure_ascii=False).casefold()]
        return {"nodes": nodes[:limit], "edges": [], "directed": True,
                "truncated": len(rows) > scan or len(nodes) > limit, "scanned": min(len(rows), scan)}

    def _query(self, db: Database, obj: ObjectRef, params: Mapping[str, Any]) -> dict[str, Any]:
        """Read-only graph search. A selected label matches either relationship endpoint."""
        limit = integer(params.get("limit"), PAGE, MAX_NODES)
        specs = filter_specs(params.get("filters"))
        binds = {"labels": strings(params.get("labels", [])), "types": strings(params.get("types", [])),
                 **filter_parameters(specs)}
        if binds["types"] or any(spec["target"] == "edges" for spec in specs):
            return self._relationship_query(db, obj, binds, specs, min(limit, EDGE_ROWS))
        return self._node_query(db, obj, binds, specs, limit)

    def _node_query(self, db: Database, obj: ObjectRef, binds: Mapping[str, Any], specs: list[dict[str, Any]],
                    limit: int) -> dict[str, Any]:
        where = " AND ".join([LABEL_CLAUSE.format(v="n"), *filter_clauses(specs, "nodes", ("n",))])
        rows = db.execute(f"MATCH (n) WHERE {where} RETURN {self._columns(db, 'n')} LIMIT $limit",
                          {**binds, "limit": limit + 1})
        chosen = rows[:limit]
        nodes = {node["id"]: node for node in (self._node(row, "n", obj) for row in chosen)}
        edges: dict[str, Any] = {}
        edge_rows: list[Any] = []
        if chosen:
            ident = self._identity
            edge_rows = self._pattern_rows(
                db, [f"{ident(db, 'n')} IN $ids", f"{ident(db, 'm')} IN $ids", TYPE_CLAUSE],
                {"ids": [row["n_id"] for row in chosen], "types": []}, MAX_EDGES + 1)
        for row in edge_rows[:MAX_EDGES]:
            n, m = self._node(row, "n", obj), self._node(row, "m", obj)
            if n["id"] in nodes and m["id"] in nodes:
                edges[str(row["r_id"])] = self._edge(row, n, m)
        return self._result(nodes, edges, len(rows) > limit or len(edge_rows) > MAX_EDGES)

    def _relationship_query(self, db: Database, obj: ObjectRef, binds: Mapping[str, Any],
                            specs: list[dict[str, Any]], limit: int) -> dict[str, Any]:
        where = [TYPE_CLAUSE, "(size($labels) = 0 OR any(label IN labels(n) WHERE label IN $labels) OR any(label IN labels(m) WHERE label IN $labels))",
                 *filter_clauses(specs, "nodes", ("n", "m")), *filter_clauses(specs, "edges", ("r",))]
        rows = self._pattern_rows(db, where, binds, limit + 1)
        nodes: dict[str, Any] = {}
        edges: dict[str, Any] = {}
        for row in rows[:limit]:
            n, m = self._node(row, "n", obj), self._node(row, "m", obj)
            nodes[n["id"]], nodes[m["id"]] = n, m
            edges[str(row["r_id"])] = self._edge(row, n, m)
        return self._result(nodes, edges, len(rows) > limit)

    @staticmethod
    def _result(nodes: Mapping[str, Any], edges: Mapping[str, Any], truncated: bool) -> dict[str, Any]:
        result: dict[str, Any] = {"nodes": list(nodes.values()), "edges": list(edges.values()), "directed": True,
                                  "truncated": truncated}
        if not nodes:
            result["message"] = "No nodes or relationships match this query."
        return result

    def _explore(self, db: Database, obj: ObjectRef, name: str, params: Mapping[str, Any]) -> dict[str, Any]:
        refs = strings(params.get("ids", []))
        if not refs:
            raise ValidationError("Select at least one node")
        self._validate_refs(db, obj, refs)
        limit = integer(params.get("limit"), PAGE, MAX_NODES)
        depth = integer(params.get("depth"), 1, MAX_DEPTH)
        nodes: dict[str, Any] = {}
        edges: dict[str, Any] = {}
        frontier, visited, truncated = refs[:], set(refs), False
        target = refs[1] if name == "path" and len(refs) == PATH_ENDPOINTS else None
        if name == "path" and target is None:
            raise ValidationError("Select exactly two nodes to find a path")
        parents: dict[str, tuple[str, str]] = {}
        if target:
            frontier, visited = refs[:1], {refs[0]}
        for _ in range(depth):
            if not frontier or len(nodes) >= limit or len(edges) >= MAX_EDGES:
                break
            result = self._neighbors(db, obj, frontier[:MAX_SEEDS], params, min(limit, MAX_EDGES - len(edges)))
            truncated |= result["truncated"] or len(frontier) > MAX_SEEDS
            nodes.update((node["id"], node) for node in result["nodes"])
            edges.update((edge["id"], edge) for edge in result["edges"])
            next_frontier = advance(frontier, result["edges"], visited, parents)
            if target in parents:
                path_edges, path_nodes, cursor = [], {target}, target
                while cursor != refs[0]:
                    cursor, edge_id = parents[cursor]
                    path_nodes.add(cursor)
                    path_edges.append(edges[edge_id])
                return {"nodes": [nodes[key] for key in path_nodes], "edges": path_edges,
                        "directed": True, "truncated": truncated, "found": True}
            frontier = next_frontier
        if name == "reveal":
            allowed = set(refs)
            edges = {key: edge for key, edge in edges.items()
                     if edge["source"] in allowed and edge["target"] in allowed}
            nodes = {key: node for key, node in nodes.items() if key in allowed}
        if target:
            return {"nodes": [], "edges": [], "directed": True, "found": False, "truncated": truncated,
                    "message": "No path in the bounded search. Increase depth or narrow relationship types."}
        chosen = list(nodes.values())[:limit]
        allowed = {node["id"] for node in chosen}
        return {"nodes": chosen, "edges": [edge for edge in edges.values()
                if edge["source"] in allowed and edge["target"] in allowed][:MAX_EDGES],
                "directed": True, "truncated": truncated or len(nodes) > limit}

    @staticmethod
    def _scene(obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        space = tools.typed("storage", StorageTool).space("graph-explorer").subspace(obj.id)
        if name == "scenes":
            return [{"id": document["id"], "name": document["scene"]["name"]}
                    for file in space.list() if file.endswith(".json")
                    for document in [json.loads(space.read(file))]]
        scene_id = params.get("id", str(uuid4()))
        if not isinstance(scene_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", scene_id):
            raise ValidationError("Invalid scene identity")
        filename = scene_id + ".json"
        if name == "load_scene":
            return json.loads(space.read(filename))
        if name == "delete_scene":
            space.delete(filename)
            return {"deleted": scene_id}
        document, payload = scene_payload(obj, scene_id, params.get("scene"))
        if not space.exists(filename) and len(space.list()) >= MAX_SCENES:
            raise ValidationError("Delete a saved scene before adding more (maximum 50 per dataset)")
        space.write(filename, payload)
        return document

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        db = self.database.for_dataset(obj.id)
        with self._read_context(db, obj):
            schema = self._schema(db)
        # Nothing is drawn until the person runs a query: an arbitrary first page of nodes
        # would almost never contain rare kinds such as Class nodes.
        return {"backend": db.backend, "graph": {"nodes": [], "edges": [], "directed": True}, "schema": schema,
                "limits": {"nodes": MAX_NODES, "edges": MAX_EDGES, "depth": MAX_DEPTH},
                "capabilities": {"analytics": "loaded-scene", "search_scan": MAX_NODES, "query": True}}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        allowed = {
            "sample": {"limit", "labels", "text", "property"},
            "query": {"labels", "types", "filters", "limit"},
            "schema": set(),
            "expand": {"ids", "direction", "types", "depth", "limit"},
            "reveal": {"ids", "direction", "types", "limit"},
            "path": {"ids", "direction", "types", "depth", "limit"},
            "scenes": set(), "load_scene": {"id"}, "save_scene": {"id", "scene"}, "delete_scene": {"id"},
        }
        if name not in allowed:
            raise NotFoundError("Unknown Graph Explorer action")
        if set(params) - allowed[name]:
            raise ValidationError("Unsupported action parameters; arbitrary Cypher is not accepted")
        db = self.database.for_dataset(obj.id)
        if name in {"scenes", "load_scene", "save_scene", "delete_scene"}:
            with self._scene_lock:
                return self._scene(obj, name, params, tools)
        with self._read_context(db, obj):
            if name == "sample":
                return self._sample(db, obj, params)
            if name == "query":
                return self._query(db, obj, params)
            if name == "schema":
                return self._schema(db)
            return self._explore(db, obj, name, params)
