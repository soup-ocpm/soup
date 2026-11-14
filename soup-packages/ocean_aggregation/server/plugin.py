from soup.core.contracts import PluginContext, SoupPlugin

from .contributions import OceanOperation
from .views import OceanStudio, OceanVisualizer


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.add_operation(OceanOperation(ctx.database))
        ctx.add_visualizer(OceanStudio(ctx.database))
        ctx.add_visualizer(OceanVisualizer(ctx.database))
