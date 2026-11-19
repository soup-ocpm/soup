"""OCED importer registration and temporary CSV server lifecycle."""

from __future__ import annotations

from soup.core.contracts import PluginContext, SoupPlugin

from .contributions import OcedImporter, OcedSummary
from .csv_http import CsvServer, shared_server


class Plugin(SoupPlugin):
    csv_server: CsvServer | None = None

    def register(self, ctx: PluginContext) -> None:
        self.csv_server = shared_server()
        ctx.add_extension_point('oced.ocel_importers')
        ctx.add_extension_point('oced.memgraph_steps')
        if 'memgraph' in ctx.database.backends:
            from .memgraph import OcedPropertiesStep
            ctx.contribute('oced.memgraph_steps', OcedPropertiesStep(ctx.tools.get('storage')), key='oced_properties')
        ctx.add_importer(OcedImporter(ctx.database, self.csv_server))
        ctx.add_visualizer(OcedSummary())

    def on_shutdown(self, ctx: PluginContext) -> None:
        if self.csv_server is not None:
            self.csv_server.close()
