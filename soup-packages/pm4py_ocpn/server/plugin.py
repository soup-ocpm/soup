from soup.core.contracts import SoupPlugin
from .contributions import DiscoverOcpn, OcpnVisualizer, JsonExporter, SvgExporter, DotExporter

class Plugin(SoupPlugin):
    def register(self, ctx):
        ctx.add_operation(DiscoverOcpn())
        ctx.add_visualizer(OcpnVisualizer())
        for exporter in (JsonExporter(), SvgExporter(), DotExporter()):
            ctx.add_exporter(exporter)
