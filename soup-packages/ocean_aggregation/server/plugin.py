from soup.core.contracts import PluginContext, SoupPlugin

from .compat import register_state, state_available
from .contributions import OceanOperation
from .views import OceanStudio, OceanVisualizer


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        register_state(ctx)
        ctx.add_operation(OceanOperation(ctx.database, lambda: state_available(ctx)))
        ctx.add_visualizer(OceanStudio(ctx.database))
        ctx.add_visualizer(OceanVisualizer(ctx.database))
