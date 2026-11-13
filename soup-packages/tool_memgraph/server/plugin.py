"""
------------------------------------------------------------------------
File : plugin.py
Description: Plugin - registers the "memgraph" tool on a single
             MemgraphDatabase shared with the host database abstraction
             (driver created on first use), and closes it on shutdown or
             when the package is disabled.
Project : soup-packages/tool_memgraph
------------------------------------------------------------------------
"""

from __future__ import annotations

from soup.core.contracts import PluginContext, SoupPlugin

from .database import MemgraphDatabase
from .tool import MemgraphTool


class Plugin(SoupPlugin):
    def __init__(self) -> None:
        self._tool: MemgraphTool | None = None

    def register(self, ctx: PluginContext) -> None:
        self._tool = MemgraphTool(MemgraphDatabase(database=ctx.database))
        ctx.add_tool(self._tool)

    def on_shutdown(self, ctx: PluginContext) -> None:
        if self._tool is not None:
            self._tool.close()
            self._tool = None
