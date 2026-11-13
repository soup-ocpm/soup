"""
------------------------------------------------------------------------
File : plugin.py
Description: Plugin - opens the "ekg.build_steps" and
             "ekg.state_providers" extension points, activates the
             EkgRuntime used by api.py, registers the "load" operation and
             adds the datasets already on the volume to the catalog
             (migration.py). A failed adoption (e.g. storage unreachable)
             is logged and does not stop the package. Name, version and
             dependencies come from soup-package.json.
Project : soup-packages/ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from soup_pkg_tool_memgraph.api import MemgraphTool

from soup.core.contracts import Catalog, NotFoundError, PluginContext, ServiceUnavailableError, SoupPlugin

from .migration import run_migration
from .operations import LoadEkg
from .runtime import BUILD_STEPS_POINT, STATE_PROVIDERS_POINT, EkgRuntime, activate, deactivate
from .state import ensure_loaded


class Plugin(SoupPlugin):
    runtime: EkgRuntime | None = None

    def register(self, ctx: PluginContext) -> None:
        ctx.add_extension_point(BUILD_STEPS_POINT)
        ctx.add_extension_point(STATE_PROVIDERS_POINT)
        ctx.add_operation(LoadEkg())
        self.runtime = EkgRuntime(ctx)
        activate(self.runtime)
        ctx.database.bind_context("memgraph", self.dataset_context)
        run_migration(self.runtime.tools)

    @contextmanager
    def dataset_context(self, object_id: str) -> Iterator[None]:
        if self.runtime is None:
            raise ServiceUnavailableError("The Memgraph EKG package is not active")
        tools = self.runtime.tools
        obj = tools.typed("catalog", Catalog).get(object_id)
        if obj is None:
            raise NotFoundError(f"Dataset '{object_id}' is not registered")
        with tools.typed("memgraph", MemgraphTool).session():
            ensure_loaded(obj, tools)
            yield

    def on_shutdown(self, ctx: PluginContext) -> None:
        if self.runtime is not None:
            deactivate(self.runtime)
            self.runtime = None
