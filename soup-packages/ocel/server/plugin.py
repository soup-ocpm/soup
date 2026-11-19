"""
------------------------------------------------------------------------
File : plugin.py
Description: Plugin - registers the two importers of OCEL 2.0 JSON files
             (as tables, as an EKG), the two visualizers and the exporter
             of "ocel_tables" objects and the "Scomponi in EKG"
             operation; contributes the build step of the relationships
             (step.py) to "ekg.build_steps" and the notice of the EKGs
             imported before them to "ekg.stats_notices". The
             contributions that read the tables share one
             cache, created here for this plugin instance (a
             disable/enable builds a new instance with an empty cache)
             with the limits of SOUP_OCEL_CACHE_OBJECTS and
             SOUP_OCEL_CACHE_MB (default 8 objects, 200 MB). Name, version
             and dependencies come from soup-package.json.
Project : soup-packages/ocel
------------------------------------------------------------------------
"""

from __future__ import annotations

import os

from soup_pkg_ekg.api import BUILD_STEPS_POINT
from soup_pkg_ekg_views.api import STATS_NOTICES_POINT
from soup_pkg_soup_base.api import ParsedCache, limits_from_env

from soup.core.contracts import ExtensionPointError, PluginContext, SoupPlugin

from .graph import DecomposeToEkg, OcelEkgImporter, OcelRelationshipsNotice
from .step import OcelRelationshipsStep
from .store import OcelTables
from .tables import OcelJsonExporter, OcelSummaryVisualizer, OcelTablesImporter, OcelTablesVisualizer
from .tables_cache import new_cache

ENV_PREFIX = "SOUP_OCEL"


class Plugin(SoupPlugin):
    cache: ParsedCache[OcelTables] | None = None

    def register(self, ctx: PluginContext) -> None:
        max_objects, max_bytes = limits_from_env(os.environ, ENV_PREFIX)
        self.cache = cache = new_cache(max_objects, max_bytes)
        ctx.add_importer(OcelTablesImporter(cache))
        def alternatives():
            try:
                return ctx.contributions('oced.ocel_importers')
            except ExtensionPointError:
                return ()
        ctx.add_importer(OcelEkgImporter(alternatives))
        ctx.add_visualizer(OcelTablesVisualizer(cache))
        ctx.add_visualizer(OcelSummaryVisualizer())
        ctx.add_operation(DecomposeToEkg(cache))
        ctx.add_exporter(OcelJsonExporter(cache))
        step = OcelRelationshipsStep()
        ctx.contribute(BUILD_STEPS_POINT, step, key=step.key, order=step.order)
        notice = OcelRelationshipsNotice()
        ctx.contribute(STATS_NOTICES_POINT, notice, key=notice.key)

    def on_shutdown(self, ctx: PluginContext) -> None:
        if self.cache is not None:
            self.cache.clear()
