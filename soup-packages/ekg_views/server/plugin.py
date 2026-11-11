"""
------------------------------------------------------------------------
File : plugin.py
Description: Plugin - opens the "ekg.graph_views", "ekg.queries",
             "ekg.json_parts" and "ekg.stats_notices" extension points,
             contributes to them the standard and the object views, the
             queries of builtin_queries.py and the five JSON parts, and
             registers the three visualizers (Grafo,
             Statistiche, Interrogazioni) and the "JSON del grafo"
             exporter, which read the contributions of every package at
             each request. The maximum LIMIT of the graph comes from
             SOUP_EKG_VIEWS_MAX_LIMIT (default 2000; a value that is not a
             positive integer fails the loading of the package). Name,
             version and dependencies come from soup-package.json.
Project : soup-packages/ekg_views
------------------------------------------------------------------------
"""

from __future__ import annotations

import os
from collections.abc import Mapping

from soup.core.contracts import PluginContext, SoupPlugin

from .builtin_queries import builtin_queries
from .contributions import (
    DEFAULT_MAX_LIMIT,
    GRAPH_VIEWS_POINT,
    JSON_PARTS_POINT,
    QUERIES_POINT,
    STATS_NOTICES_POINT,
    GraphJsonExporter,
    GraphVisualizer,
    QueriesVisualizer,
    StatsVisualizer,
)
from .json_parts import builtin_parts
from .kinds import EKG_KIND, OCED_KIND
from .views import ObjectGraphView, StandardGraphView

MAX_LIMIT_ENV = "SOUP_EKG_VIEWS_MAX_LIMIT"


def max_limit_from_env(env: Mapping[str, str]) -> int:
    """:raises ValueError: SOUP_EKG_VIEWS_MAX_LIMIT is not a positive integer"""

    raw = env.get(MAX_LIMIT_ENV, "").strip()
    if not raw:
        return DEFAULT_MAX_LIMIT
    try:
        value = int(raw)
    except ValueError:
        value = 0
    if value <= 0:
        raise ValueError(f"{MAX_LIMIT_ENV} must be a positive integer, got {raw!r}")
    return value


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        max_limit = max_limit_from_env(os.environ)
        for point in (GRAPH_VIEWS_POINT, QUERIES_POINT, JSON_PARTS_POINT, STATS_NOTICES_POINT):
            ctx.add_extension_point(point)

        for view in (StandardGraphView(), ObjectGraphView()):
            ctx.contribute(GRAPH_VIEWS_POINT, view, key=view.key)
        # Order 0 for all: they keep this order, and the contributions of
        # other packages with the default order come after them.
        for query in builtin_queries():
            ctx.contribute(QUERIES_POINT, query, key=query.key)
        for part in builtin_parts():
            ctx.contribute(JSON_PARTS_POINT, part, key=part.key)

        for visualizer in (GraphVisualizer(ctx.contributions, max_limit, ctx.database),
                           StatsVisualizer(ctx.contributions, ctx.database)):
            visualizer.accepts = (OCED_KIND,) if ctx.database.backend == "neo4j" else (EKG_KIND,)
            ctx.add_visualizer(visualizer)
        ctx.add_visualizer(QueriesVisualizer(ctx.contributions, ctx.database))
        ctx.add_exporter(GraphJsonExporter(ctx.contributions, ctx.database))
