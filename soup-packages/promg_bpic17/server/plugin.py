from soup.core.contracts import PluginContext, SoupPlugin

from .contributions import Bpic17Importer
from .migration import NormalizeLegacyPromg


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        neo4j = ctx.database.for_backend("neo4j")
        ctx.add_importer(Bpic17Importer(neo4j))
        ctx.add_operation(NormalizeLegacyPromg(neo4j))
