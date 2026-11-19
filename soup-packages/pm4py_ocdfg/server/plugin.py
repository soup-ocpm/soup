from soup.core.contracts import PluginContext, SoupPlugin

from .contributions import DiscoverOcdfg, DotExporter, JsonExporter, OcdfgVisualizer, SvgExporter


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.add_operation(DiscoverOcdfg())
        ctx.add_visualizer(OcdfgVisualizer())
        for exporter in (JsonExporter(), SvgExporter(), DotExporter()):
            ctx.add_exporter(exporter)
