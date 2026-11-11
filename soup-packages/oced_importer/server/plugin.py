"""OCED importer registration and temporary CSV server lifecycle."""

from __future__ import annotations

import os

from soup.core.contracts import PluginContext, SoupPlugin

from .contributions import OcedImporter, OcedSummary
from .csv_http import CsvServer


class Plugin(SoupPlugin):
    csv_server: CsvServer | None = None

    def register(self, ctx: PluginContext) -> None:
        self.csv_server = CsvServer(os.environ.get("SOUP_NEO4J_CSV_BASE_URL", ""))
        ctx.add_importer(OcedImporter(ctx.database, self.csv_server))
        ctx.add_visualizer(OcedSummary())

    def on_shutdown(self, ctx: PluginContext) -> None:
        if self.csv_server is not None:
            self.csv_server.close()
