"""Register an additional visualizer without changing the existing EKG views."""
from soup.core.contracts import PluginContext, SoupPlugin

from .explorer import Explorer


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.add_visualizer(Explorer(ctx.database))
