"""
------------------------------------------------------------------------
File : contributions.py
Description: The visualizers and the exporter of ekg_views, for objects of
             kind "ekg". Each one first makes the object the graph in
             Memgraph (ekg's ensure_loaded), then reads it with Query
             objects only:
             - GraphVisualizer ("graph", <soup-pkg-ekg-graph>): the views
               contributed to "ekg.graph_views" by any package that draw
               the object's kind (their `kinds`); data() is
               the first drawing of the first view (200 edges, like
               getGraphDetails(200)) with the max data to show
               (getMaxDataToShow); actions "graph" {view, limit,
               relations}, "search" {view, text, kind: node|edge, offset,
               relations, label?} (incremental, pages of 50; `label` one of
               the view's node labels) and "node" {view, id}. Relations and
               labels outside the view's closed lists are a ValidationError;
               with every relationship type hidden nothing is read;
             - StatsVisualizer ("stats", <soup-pkg-ekg-stats>): the counts,
               the time range, the distinct activities, the entity types
               with the number of events with a null value (the warning of
               getEntityWarningLabel), the columns of the dataset with
               their role (dataset_columns) and the two pies of the old detail
               page (createDataPieChart, createProcessPieChart: the phase
               times from meta.process_info, in seconds like
               support.service's calculateDuration);
             - QueriesVisualizer ("queries", <soup-pkg-ekg-queries>): the
               queries contributed to "ekg.queries" by any package,
               grouped, with their fields; action "query" {key, params}
               -> {blocks};
             - GraphJsonExporter ("json", "JSON del grafo"): the parts
               contributed to "ekg.json_parts" chosen in the multiselect
               "parts", each under its own key (downloadJsonSelected).
             Grafo and Statistiche accept "ekg" objects; Interrogazioni and
             JSON del grafo accept the kinds of their contributions
             (kinds.accepted_kinds: "ekg", and "ekg_class" while
             ekg_class_graph contributes to them) and offer, for an
             object, only the contributions whose `kinds` contain its
             kind. data() of Grafo, Statistiche and Interrogazioni carries
             meta.notice of the object (e.g. an analysis that changed
             nothing), shown by the elements; Statistiche adds the
             notices contributed to "ekg.stats_notices" (StatsNotice).
             The contributions to the extension points are read again at
             every request (`contributions`, the PluginContext's), so a
             package enabled or disabled at runtime takes effect at once.
Project : soup-packages/ekg_views
------------------------------------------------------------------------
"""

from __future__ import annotations

import copy
import importlib
import json
import sys
from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
from typing import Any, Protocol, cast

from soup.core.contracts import (
    Catalog,
    Choice,
    Exporter,
    Field,
    NotFoundError,
    ObjectRef,
    ServiceUnavailableError,
    ToolAccess,
    ValidationError,
    Visualizer,
    report,
)
from soup.core.contracts.database import Database

from . import builtin_queries as builtin
from .database import Neo4jQueries, Query
from .json_parts import JsonPart
from .kinds import EKG_KIND, OCED_KIND, accepted_kinds, applies_to
from .queries import GraphQuery, count_of
from .values import as_choice, as_int, as_limit, as_list, as_text
from .views import SEARCH_KINDS, GraphView, ObjectGraphView, StandardGraphView

GRAPH_VIEWS_POINT = "ekg.graph_views"
QUERIES_POINT = "ekg.queries"
JSON_PARTS_POINT = "ekg.json_parts"
STATS_NOTICES_POINT = "ekg.stats_notices"

ekg = sys.modules.get("soup_pkg_ekg.api")

MEMGRAPH = "memgraph"
STORAGE = "storage"
TOOLS = (STORAGE,)

DEFAULT_LIMIT = 200
DEFAULT_MAX_LIMIT = 2000
SEARCH_PAGE = 50

# Reads the contributions to an extension point (PluginContext.contributions).
Contributions = Callable[[str], list[Any]]


class GraphQueries(Protocol):
    """The part of the memgraph tool the views use: they only read the graph."""

    def run(self, query: Query) -> list[dict[str, Any]]: ...


def _run(graph: GraphQueries, query: Query) -> list[dict[str, Any]]:
    return graph.run(query)


def _keyed(items: Sequence[Any], what: str, kind: str) -> dict[str, Any]:
    """The contributions that apply to objects of `kind`, by key (the first one of each key)."""

    found: dict[str, Any] = {}
    for item in items:
        key = getattr(item, "key", "")
        if key and key not in found and applies_to(item, kind):
            found[key] = item
    if not found:
        raise NotFoundError(f"No active package contributes {what} for '{kind}' objects")
    return found


class StatsNotice(ABC):
    """
    A notice the Statistiche of an object show above its data, contributed
    to "ekg.stats_notices" by the package that knows about it (e.g. ocel:
    an EKG built before its relationships entered the graph).
    """

    key: str = ""

    @abstractmethod
    def notice(self, obj: ObjectRef, tools: ToolAccess) -> str | None:
        raise NotImplementedError


def notice_of(obj: ObjectRef) -> str | None:
    """meta.notice: a message the elements show above the data (e.g. an analysis that changed nothing)."""

    notice = obj.meta.get("notice")
    return notice if isinstance(notice, str) and notice else None


class _EkgContribution:
    accepts: Any = (EKG_KIND,)
    requires_tools: Sequence[str] = TOOLS

    def __init__(self, contributions: Contributions, database: Database | None = None):
        self._contributions = contributions
        self._database = database

    def _accepted(self, items: Sequence[Any]) -> tuple[str, ...]:
        if self._database is not None and self._database.backend == "neo4j":
            return (OCED_KIND,)
        return tuple(kind for kind in accepted_kinds(items) if kind != OCED_KIND)

    @staticmethod
    def _ekg() -> Any:
        # The Memgraph lifecycle is optional on Neo4j; importing it at module
        # load would make this package depend on the Memgraph-only EKG builder.
        global ekg  # noqa: PLW0603 - preserve the optional API binding across package reloads
        try:
            ekg = importlib.import_module("soup_pkg_ekg.api")
            return ekg
        except ImportError as exc:
            raise ServiceUnavailableError("Memgraph EKG views require the active ekg package") from exc

    def _loaded(self, obj: ObjectRef, tools: ToolAccess) -> GraphQueries:
        if self._database is not None and self._database.backend == "neo4j":
            if obj.kind != OCED_KIND:
                raise ValidationError("Neo4j EKG views require an OCED-imported graph")
            database = self._database.for_dataset(obj.id)
            if obj.meta.get("import_status", "complete") != "complete":
                raise ValidationError(
                    "This dataset import did not complete; inspect its import summary before retrying."
                )
            rows = database.execute(
                "MATCH (n) WHERE n:Event OR n:Entity "
                "RETURN count(n) AS total, count(CASE WHEN n.Log = $log THEN 1 END) AS matching",
                {"log": obj.id},
            )
            if not rows or not rows[0]["total"] or rows[0]["total"] != rows[0]["matching"]:
                raise ValidationError("The configured Neo4j database does not exclusively contain this OCED log")
            return Neo4jQueries(database, obj)
        ekg = self._ekg()
        graph_tools = ekg.graph_tools()
        ekg.ensure_loaded(obj, graph_tools)
        return cast(GraphQueries, graph_tools.get(MEMGRAPH))


# ---------------------------------------------------------------------- #
# Grafo
# ---------------------------------------------------------------------- #
class GraphVisualizer(_EkgContribution, Visualizer):
    id = "graph"
    label = "Graph"
    element = "soup-pkg-ekg-graph"

    def __init__(self, contributions: Contributions, max_limit: int = DEFAULT_MAX_LIMIT,
                 database: Database | None = None):
        super().__init__(contributions, database)
        self.max_limit = max_limit

    def views(self, kind: str = EKG_KIND) -> dict[str, GraphView]:
        return _keyed(self._contributions(GRAPH_VIEWS_POINT), "graph views", kind)

    def _view(self, params: Mapping[str, Any], kind: str) -> GraphView:
        views = self.views(kind)
        key = as_choice(params.get("view"), "view", list(views), next(iter(views)))
        return views[key]

    def _configured_view(self, params: Mapping[str, Any], obj: ObjectRef, graph: GraphQueries) -> GraphView:
        view = self._view(params, obj.kind)
        if isinstance(graph, Neo4jQueries):
            view = copy.copy(view)
            if isinstance(view, StandardGraphView):
                view.activity_property = graph.activity
                view.entity_id_property = graph.entity_id
            if isinstance(view, ObjectGraphView):
                view.default_relations = ("CORR",)
        return view

    @staticmethod
    def _relations(view: GraphView, params: Mapping[str, Any]) -> list[str]:
        return as_list(params.get("relations"), "relations", view.relationship_types,
            view.default_relations or view.relationship_types)

    def _graph(self, view: GraphView, params: Mapping[str, Any], tools: GraphQueries) -> dict[str, Any]:
        limit = as_limit(params.get("limit"), DEFAULT_LIMIT, self.max_limit)
        relations = self._relations(view, params)
        if not relations:
            # Every relationship type hidden: nothing to read.
            return {"view": view.key, "limit": limit, "relations": [], "max_data": 0,
                    "graph": {"nodes": [], "edges": [], "directed": True}}
        graph = view.to_graph(_run(tools, view.edges_query(limit, relations)))
        max_query = view.max_data_query(relations)
        max_data = None
        if max_query is not None:
            rows = _run(tools, max_query)
            max_data = count_of(rows, "total_nodes") + count_of(rows, "total_rels")
        return {"view": view.key, "limit": limit, "relations": relations, "max_data": max_data, "graph": graph}

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        graph = self._loaded(obj, tools)
        configured = [self._configured_view({"view": key}, obj, graph) for key in self.views(obj.kind)]
        views = [
            {"key": view.key, "label": view.label or view.key,
             "relationship_types": list(view.relationship_types), "default_relations": list(view.default_relations),
             "node_labels": list(view.node_labels)}
            for view in configured
        ]
        return {"views": views, "max_limit": self.max_limit, "notice": notice_of(obj),
                **self._graph(self._configured_view(params, obj, graph), params, graph)}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name not in ("graph", "search", "node"):
            raise NotFoundError(f"Visualizer '{self.id}' has no action '{name}'")
        graph = self._loaded(obj, tools)
        view = self._configured_view(params, obj, graph)
        if name == "graph":
            return self._graph(view, params, graph)
        if name == "search":
            return self._search(view, params, graph)
        query = view.node_query(as_int(params.get("id"), "id", -1, -1))
        node = view.to_node(_run(graph, query)) if query is not None else None
        if node is None:
            raise NotFoundError(f"Node {params.get('id')!r} not found in the view '{view.key}'")
        return node

    def _search(self, view: GraphView, params: Mapping[str, Any], tools: GraphQueries) -> dict[str, Any]:
        text = as_text(params.get("text"), "text").strip()
        kind = as_choice(params.get("kind"), "kind", SEARCH_KINDS, "node")
        offset = as_int(params.get("offset"), "offset", 0, 0)
        relations = self._relations(view, params)
        label = params.get("label")
        if label not in (None, ""):
            label = as_choice(label, "label", list(view.node_labels))
        if kind == "edge" and not relations:
            return {"items": [], "total": 0}
        query = view.search_query(text, kind, offset, SEARCH_PAGE, relations, label or None)
        count = view.search_count_query(text, kind, relations, label or None)
        if query is None or count is None:
            return {"items": [], "total": 0}
        return {"items": view.search_items(_run(tools, query), kind), "total": count_of(_run(tools, count))}


# ---------------------------------------------------------------------- #
# Statistiche
# ---------------------------------------------------------------------- #
PHASES = (("Event", "event"), ("Entity", "entity"), ("CORR", "corr"), ("DF", "df"))


def _seconds(start: Any, finish: Any) -> float | None:
    """Like support.service's calculateDuration: finish - start, in seconds."""

    if not start or not finish:
        return None
    try:
        delta = datetime.fromisoformat(str(finish)) - datetime.fromisoformat(str(start))
    except ValueError:
        return None
    return delta.total_seconds()


def construction_seconds(process_info: Any, phase: str = "total") -> float | None:
    info = process_info if isinstance(process_info, Mapping) else {}
    measured = info.get("duration_seconds", {}).get(phase)
    if isinstance(measured, (int, float)):
        return float(measured)
    prefix = "" if phase == "total" else f"{phase}_"
    return _seconds(info.get(f"init_{prefix}time"), info.get(f"finish_{prefix}time"))


def phase_times(process_info: Any) -> dict[str, Any] | None:
    """The "pie" chart of the build phases, or None if no phase has both times."""

    info = process_info if isinstance(process_info, Mapping) else {}
    durations = [construction_seconds(info, phase) for _, phase in PHASES]
    if all(value is None for value in durations):
        return None
    return {"chart": "pie", "labels": [label for label, _ in PHASES],
            "datasets": [{"label": "seconds", "data": [value or 0 for value in durations]}]}


# The roles of the mapping in meta.mapping, in the order they are shown.
COLUMN_ROLES = (("event_id", "event_id"), ("timestamp", "timestamp"), ("activity", "activity"))


def dataset_columns(meta: Mapping[str, Any]) -> list[dict[str, str]]:
    """
    The columns of the CSV of a dataset (meta.columns) with the role the
    import gave them (meta.mapping): event_id, timestamp, activity,
    entity, value, or "" for a column left out - the old "CSV Columns"
    panel of the datasets page.
    """

    log = meta.get("log_config")
    if isinstance(log, Mapping) and not meta.get("columns"):
        meta = {"columns": log.get("events", {}).get("attr", []), "mapping": {
            "event_id": log.get("event_id"), "activity": log.get("event_activity"),
            "timestamp": log.get("event_timestamp"), "entities": list(log.get("entities", {})),
        }}
    mapping = cast("Mapping[str, Any]", meta.get("mapping")) if isinstance(meta.get("mapping"), Mapping) else {}
    roles: dict[str, str] = {}
    for column in mapping.get("values") or ():
        roles[str(column)] = "value"
    for column in mapping.get("entities") or ():
        roles[str(column)] = "entity"
    for key, role in COLUMN_ROLES:
        if mapping.get(key):
            roles[str(mapping[key])] = role
    columns = [str(column) for column in meta.get("columns") or ()]
    return [{"name": column, "role": roles.get(column, "")} for column in columns]


def warning_label(count: int) -> str:
    """getEntityWarningLabel."""

    return f"{count} nodes have NaN values."


class StatsVisualizer(_EkgContribution, Visualizer):
    id = "stats"
    label = "Statistics"
    element = "soup-pkg-ekg-stats"

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        problem = None if obj.kind == OCED_KIND else self._ekg().buildable_problem(obj)
        if problem:
            return self._metadata_only(obj, problem)
        graph = self._loaded(obj, tools)
        if obj.kind != OCED_KIND:
            obj = self._ekg().graph_tools().typed("catalog", Catalog).get(obj.id) or obj

        def rows(query: GraphQuery) -> list[dict[str, Any]]:
            return _run(graph, query.build({}))

        counts = {
            "event_nodes": builtin.COUNT_EVENTS.count(rows(builtin.COUNT_EVENTS)),
            "entity_nodes": builtin.COUNT_ENTITIES.count(rows(builtin.COUNT_ENTITIES)),
            "corr_rel": builtin.COUNT_CORR.count(rows(builtin.COUNT_CORR)),
            "df_rel": builtin.COUNT_DF.count(rows(builtin.COUNT_DF)),
        }
        timestamps, activities = builtin.Timestamps(), builtin.Activities()
        keys, nulls = builtin.EntityKeys(), builtin.NullEntities()
        null_counts = nulls.rows(rows(nulls))
        entities = []
        for name in keys.rows(rows(keys)):
            nan_nodes = null_counts.get(name, 0)
            entities.append({"name": name, "nan_nodes": nan_nodes,
                "warning": warning_label(nan_nodes) if nan_nodes else None})
        # A derived object (an analysis) has the columns of its dataset.
        source = obj if obj.kind == OCED_KIND or obj.meta.get("columns") else self._ekg().root_of(obj)
        composition = {"chart": "pie", "labels": ["Event", "Entity", "CORR", "DF"],
                       "datasets": [{"label": "count", "data": list(counts.values())}]}
        return {
            "counts": counts,
            "timestamps": timestamps.rows(rows(timestamps)),
            "activities": activities.rows(rows(activities)),
            "entities": entities,
            "columns": dataset_columns(source.meta),
            "construction_seconds": construction_seconds(obj.meta.get("process_info")),
            "charts": {"data": composition, "process": phase_times(obj.meta.get("process_info"))},
            "notice": self._notice(obj, tools),
        }

    def _notice(self, obj: ObjectRef, tools: ToolAccess) -> str | None:
        """meta.notice, then the notices contributed to ekg.stats_notices, in one text."""

        notices = [notice_of(obj)]
        notices += [item.notice(obj, tools) for item in self._contributions(STATS_NOTICES_POINT)]
        return " ".join(notice for notice in notices if notice) or None

    def _metadata_only(self, obj: ObjectRef, problem: str) -> dict[str, Any]:
        """A graph that cannot be built: the metadata of the dataset and why, with no query."""

        source = obj if obj.kind == OCED_KIND or obj.meta.get("columns") else self._ekg().root_of(obj)
        meta_counts = source.meta.get("counts")
        stored: Mapping[str, Any] = meta_counts if isinstance(meta_counts, Mapping) else {}
        counts = {key: count_of([stored], key) for key in ("event_nodes", "entity_nodes", "corr_rel", "df_rel")}
        composition = {"chart": "pie", "labels": ["Event", "Entity", "CORR", "DF"],
                       "datasets": [{"label": "count", "data": list(counts.values())}]}
        return {
            "counts": counts,
            "timestamps": {"min": None, "max": None},
            "activities": [],
            "entities": [],
            "columns": dataset_columns(source.meta),
            "construction_seconds": construction_seconds(source.meta.get("process_info")),
            "charts": {"data": composition, "process": phase_times(source.meta.get("process_info"))},
            "notice": problem,
        }


# ---------------------------------------------------------------------- #
# Interrogazioni
# ---------------------------------------------------------------------- #
class QueriesVisualizer(_EkgContribution, Visualizer):
    id = "queries"
    label = "Queries"
    element = "soup-pkg-ekg-queries"

    @property
    def accepts(self) -> tuple[str, ...]:  # type: ignore[override]  # computed from the active contributions instead of declared
        return self._accepted(self._contributions(QUERIES_POINT))

    def queries(self, kind: str = EKG_KIND) -> dict[str, GraphQuery]:
        return _keyed(self._contributions(QUERIES_POINT), "queries", kind)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        groups: dict[str, list[dict[str, Any]]] = {}
        for query in self.queries(obj.kind).values():
            groups.setdefault(query.group or "Other", []).append(query.describe())
        return {"groups": [{"group": group, "queries": items} for group, items in groups.items()],
                "notice": notice_of(obj)}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name != "query":
            raise NotFoundError(f"Visualizer '{self.id}' has no action '{name}'")
        queries = self.queries(obj.kind)
        key = params.get("key")
        if key not in queries:
            raise NotFoundError(f"No active package contributes the query {key!r}")
        query = queries[key]
        values = query.values(params.get("params"))
        graph = self._loaded(obj, tools)
        rows = _run(graph, query.build(values))
        if isinstance(graph, Neo4jQueries):
            values = {**values, "activity_property": graph.activity,
                      "entity_id_property": graph.entity_id, "event_id_property": graph.event_id}
        blocks = query.transform(rows, values)
        return {"key": key, "label": query.label, "blocks": report.validate_blocks(blocks)}


# ---------------------------------------------------------------------- #
# JSON del grafo
# ---------------------------------------------------------------------- #
class GraphJsonExporter(_EkgContribution, Exporter):
    id = "json"
    label = "Graph JSON"
    extension = ".json"
    mime = "application/json"

    @property
    def accepts(self) -> tuple[str, ...]:  # type: ignore[override]  # computed from the active contributions instead of declared
        return self._accepted(self._contributions(JSON_PARTS_POINT))

    def parts(self, kind: str = EKG_KIND) -> dict[str, JsonPart]:
        return _keyed(self._contributions(JSON_PARTS_POINT), "JSON parts", kind)

    def fields(self, obj: ObjectRef, tools: ToolAccess) -> list[Field]:
        parts = self.parts(obj.kind)
        return [Field("parts", "Content", type="multiselect", required=True,
                      choices=tuple(Choice(key, part.label or key) for key, part in parts.items()),
                      default=list(parts), help="Select the graph parts to export, each under its own key.")]

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> bytes:
        parts = self.parts(obj.kind)
        chosen = as_list(params.get("parts"), "parts", parts, list(parts))
        if not chosen:
            raise ValidationError("Choose at least one part of the graph")
        graph = self._loaded(obj, tools)
        content = {}
        for key in chosen:
            part = parts[key]
            content[part.label or key] = part.transform(_run(graph, part.query()))
        return json.dumps(content, ensure_ascii=False, indent=2, default=str).encode("utf-8")
