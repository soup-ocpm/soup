"""
------------------------------------------------------------------------
File : visualizers.py
Description: The visualizers of "ekg_class" objects. Both first load the
             object with ekg's ensure_loaded (the parent rebuilt and the
             classes applied by ClassStateProvider, only if another graph
             is active):
             - ClassGraphVisualizer ("graph", "Grafo aggregato",
               <soup-pkg-ekg-class-graph>): ekg_views' GraphVisualizer on
               the views of "ekg.graph_views" that draw "ekg_class"
               objects - the "class" view of this package first (the
               default), then the standard ones of ekg_views - with the
               same actions "graph", "search" and "node";
             - ClassStatsVisualizer ("stats", "Statistiche del grafo
               aggregato", <soup-pkg-ekg-class-stats>): the counts of the
               aggregate graph, its entity types and the two pies of the
               old detail page (createAggregateDataPieChart: Class nodes,
               OBS, DF_C; createAggregateProcessPieChart: the seconds of
               the class, OBS and DF_C phases, from meta.process_info).
Project : soup-packages/ekg_class_graph
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any, cast

import soup_pkg_ekg.api as ekg
from soup_pkg_ekg_views.api import GraphView, GraphVisualizer, notice_of

from soup.core.contracts import ObjectRef, ToolAccess, Visualizer

from .classes import class_counts
from .views import CLASS_KIND

MEMGRAPH = "memgraph"

# (label of the pie, phase of process_info).
PHASES = (("Class queries", "class"), ("OBS queries", "obs"), ("DF_C queries", "dfc"))


class ClassGraphVisualizer(GraphVisualizer):
    id = "graph"
    label = "Aggregated graph"
    element = "soup-pkg-ekg-class-graph"
    accepts = (CLASS_KIND,)
    requires_tools = (MEMGRAPH,)

    def views(self, kind: str = CLASS_KIND) -> dict[str, GraphView]:
        # The views dedicated to the aggregate graph first (the default
        # one is the first), then the standard ones: its graph holds the
        # EKG of the parent too.
        views = super().views(kind)
        dedicated = {key: view for key, view in views.items() if ekg.EKG_KIND not in tuple(getattr(view, "kinds", ()))}
        return {**dedicated, **views}


def _seconds(start: Any, finish: Any) -> float | None:
    """support.service's calculateDuration: finish - start, in seconds."""

    if not start or not finish:
        return None
    try:
        return (datetime.fromisoformat(str(finish)) - datetime.fromisoformat(str(start))).total_seconds()
    except ValueError:
        return None


def process_chart(process_info: Any) -> dict[str, Any] | None:
    info = process_info if isinstance(process_info, Mapping) else {}
    durations = [_seconds(info.get(f"init_{phase}_time"), info.get(f"finish_{phase}_time")) for _, phase in PHASES]
    if all(value is None for value in durations):
        return None
    return {"chart": "pie", "labels": [label for label, _ in PHASES],
            "datasets": [{"label": "seconds", "data": [value or 0 for value in durations]}]}


class ClassStatsVisualizer(Visualizer):
    id = "stats"
    label = "Aggregated graph statistics"
    element = "soup-pkg-ekg-class-stats"
    accepts = (CLASS_KIND,)
    requires_tools = (MEMGRAPH,)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        ekg.ensure_loaded(obj, tools)
        counts = class_counts(cast(ekg.GraphDatabase, tools.get(MEMGRAPH)).run)
        composition = {"chart": "pie", "labels": ["Class Nodes", "OBS", "DF_C"],
                       "datasets": [{"label": "Count",
                           "data": [counts["class_nodes"], counts["obs_rel"], counts["dfc_rel"]]}]}
        return {
            "counts": counts,
            "entity_types": list(obj.meta.get("entity_types") or []),
            "charts": {"data": composition, "process": process_chart(obj.meta.get("process_info"))},
            "notice": notice_of(obj),
        }
