"""
------------------------------------------------------------------------
File : plugin_manager.py
Description: Orders, loads, unloads and shuts down plugins (the SoupPlugin
             of each package). Packages are found on disk by the
             PackageManager (soup/core/packages), which hands their
             plugins to this class; discover() only resolves the
             plugins passed in code (tests, the e2e server).
             Mirrors the six-phase lifecycle from the refactoring document:
             1. Discovery   - SoupPlugin instances or classes given in code
             2. Ordering    - topological sort on `requires` and on tools
                               (a tool's provider loads before the
                               packages requiring it), cycle detection
             3. Verification- required deps and required tools present,
                               api_version compatible (same major,
                               minor not above the host's)
             4. Registration- calls register(ctx); PluginContext attributes
                               every contribution to the current plugin;
                               "package.loaded" is published on success
             5. Isolation   - a failing plugin is excluded, its partial
                               contributions removed (remove_owner) and
                               the reason recorded in the PackageReport;
                               the host still starts (unless `strict=True`)
             6. Shutdown    - on_shutdown(ctx) in reverse load order, then
                               "package.unloaded"
             load() is incremental: packages loaded by an earlier call
             satisfy the `requires` of later ones (runtime install and
             enable), and unload() removes one package at runtime.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Iterable
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any

from soup.core.contracts import (
    CONTRACTS_API_VERSION,
    PluginApiVersionError,
    PluginCycleError,
    PluginDependencyError,
    PluginError,
    PluginMissingToolsError,
    SoupPlugin,
    is_api_compatible,
)
from soup.core.events import PACKAGE_LOADED, PACKAGE_UNLOADED
from soup.core.ordering import topological_order
from soup.core.plugin_context import DefaultPluginContext


@dataclass
class PluginFailure:
    plugin_name: str
    error: Exception

    @property
    def reason(self) -> str:
        return str(self.error)


@dataclass
class PackageReport:
    """
    Outcome of loading packages: who loaded, who was left disabled (by
    the persisted state or the SOUP_PACKAGES override), who did not load
    and why.
    """

    loaded: list[str] = field(default_factory=list)
    failed: list[PluginFailure] = field(default_factory=list)
    disabled: list[str] = field(default_factory=list)
    # Problems that exclude no package but leave a service unable to
    # answer (e.g. no package provides the object catalog).
    warnings: list[str] = field(default_factory=list)

    def add_loaded(self, name: str) -> None:
        self.loaded.append(name)

    def add_failure(self, name: str, error: Exception) -> None:
        self.failed.append(PluginFailure(name, error))

    def add_disabled(self, name: str) -> None:
        self.disabled.append(name)

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)

    def merge(self, other: PackageReport) -> None:
        self.loaded.extend(other.loaded)
        self.failed.extend(other.failed)
        self.disabled.extend(other.disabled)
        self.warnings.extend(other.warnings)


class PluginManager:
    def __init__(self, contracts_api_version: str = CONTRACTS_API_VERSION, strict: bool = False):
        self.contracts_api_version = contracts_api_version
        self.strict = strict
        self.report: PackageReport = PackageReport()
        self._ctx: DefaultPluginContext | None = None
        # Replaced, never mutated: readers (package_status, list) iterate a snapshot.
        self._loaded_plugins: tuple[SoupPlugin, ...] = ()

    # ------------------------------------------------------------------ #
    # Phase 1: discovery
    # ------------------------------------------------------------------ #
    def discover(self, specs: Iterable[Any] | None = None) -> list[SoupPlugin]:
        """
        Resolve `specs` into SoupPlugin instances, without registering
        them: each spec is a SoupPlugin instance or a SoupPlugin
        subclass. Packages on disk are not resolved here: the
        PackageManager loads them.
        """

        return [self._resolve_spec(spec) for spec in specs or ()]

    @staticmethod
    def _resolve_spec(spec: Any) -> SoupPlugin:
        if isinstance(spec, SoupPlugin):
            return spec
        if isinstance(spec, type) and issubclass(spec, SoupPlugin):
            return spec()
        raise TypeError(f"Unsupported plugin spec: {spec!r}")

    # ------------------------------------------------------------------ #
    # Phases 2-5: ordering, verification, registration, isolation
    # ------------------------------------------------------------------ #
    @property
    def loaded_names(self) -> list[str]:
        return [plugin.name for plugin in self._loaded_plugins]

    def get(self, name: str) -> SoupPlugin | None:
        return next((plugin for plugin in self._loaded_plugins if plugin.name == name), None)

    def load(self, plugins: Iterable[SoupPlugin], ctx: DefaultPluginContext | None = None) -> PackageReport:
        """
        Load `plugins` into `ctx` (by default the context of the previous
        call, or a new one). Packages already loaded into the same
        context stay loaded and satisfy the `requires` of the new ones.
        Returns the report of this call; self.report accumulates them.
        """

        ctx = ctx if ctx is not None else (self._ctx or DefaultPluginContext())
        if ctx is not self._ctx:
            self._ctx = ctx
            self._loaded_plugins = ()
            self.report = PackageReport()

        report = PackageReport()
        already_loaded = set(self.loaded_names)
        plugins = list(plugins)
        for plugin in [plugin for plugin in plugins if plugin.name in already_loaded]:
            self._fail(report, plugin.name, PluginError(f"Package '{plugin.name}' is already loaded"))
            plugins.remove(plugin)

        plugins = self._database_compatible(plugins, ctx, report)
        by_name = {plugin.name: plugin for plugin in plugins}
        # Tools registered by the host, or by packages already loaded, count as provided.
        host_tools = set(ctx.tool_registry.keys())

        valid = self._verify(plugins, by_name, report, host_tools, already_loaded)
        ordered = self._topological_order(valid)  # raises PluginCycleError, not isolated

        for plugin in ordered:
            # A provider that passed verification but then failed in
            # register() leaves its tools missing: its consumers fail here.
            missing_tools = [name for name in plugin.requires_tools if name not in ctx.tool_registry]
            if missing_tools:
                self._fail(report, plugin.name, PluginMissingToolsError(plugin.name, missing_tools))
                continue

            try:
                ctx._begin_plugin(plugin)
                plugin.register(ctx)
                not_added = [
                    name for name in plugin.provides_tools if ctx.tool_registry.owner_of(name) != plugin.name
                ]
                if not_added:
                    raise PluginError(
                        f"Plugin '{plugin.name}' declares provides_tools {not_added} but did not add them"
                    )
                points_not_added = [
                    name for name in plugin.extension_points
                    if name not in ctx.extension_points.points() or ctx.extension_points.owner_of(name) != plugin.name
                ]
                if points_not_added:
                    raise PluginError(
                        f"Plugin '{plugin.name}' declares extension_points {points_not_added} but did not open them"
                    )
            except Exception as exc:  # noqa: BLE001 - isolate any plugin failure
                ctx.remove_owner(plugin.name)
                if self.strict:
                    raise
                report.add_failure(plugin.name, exc)
                continue
            else:
                report.add_loaded(plugin.name)
                self._loaded_plugins = (*self._loaded_plugins, plugin)
            finally:
                ctx._end_plugin()
            ctx.publish(PACKAGE_LOADED, {"package": plugin.name, "version": plugin.version})

        self.report.merge(report)
        return report

    def unload(self, name: str) -> SoupPlugin:
        """
        Remove a loaded package at runtime: on_shutdown(ctx), then every
        contribution it made (registries, extension points,
        subscriptions), then "package.unloaded". Dependents are not
        checked here: the PackageManager refuses to unload a package
        that other loaded packages need.
        :raises KeyError: `name` is not loaded
        """

        plugin = self.get(name)
        if plugin is None or self._ctx is None:
            raise KeyError(name)
        with suppress(Exception):  # the package's own cleanup is best-effort
            plugin.on_shutdown(self._ctx)
        self._ctx.remove_owner(name)
        self._loaded_plugins = tuple(loaded for loaded in self._loaded_plugins if loaded is not plugin)
        self._ctx.publish(PACKAGE_UNLOADED, {"package": plugin.name, "version": plugin.version})
        return plugin

    def _database_compatible(
        self, plugins: list[SoupPlugin], ctx: DefaultPluginContext, report: PackageReport,
    ) -> list[SoupPlugin]:
        compatible = []
        for plugin in plugins:
            if ctx.database.backend not in plugin.databases:
                self._fail(report, plugin.name, PluginError(
                    f"Package '{plugin.name}' does not support database '{ctx.database.backend}'"
                ))
            else:
                compatible.append(plugin)
        return compatible

    def _verify(
        self,
        plugins: list[SoupPlugin],
        by_name: dict[str, SoupPlugin],
        report: PackageReport,
        host_tools: set[str] | None = None,
        already_loaded: set[str] | None = None,
    ) -> list[SoupPlugin]:
        """
        Phase 3: exclude (and record in `report`) plugins with an
        incompatible api_version, with `requires` dependencies that are
        missing entirely or that themselves failed verification, or with
        `requires_tools` that neither the host nor any remaining plugin
        provides (computed to a fixpoint so cascading failures are also
        isolated).
        """

        host_tools = host_tools or set()
        already_loaded = already_loaded or set()

        candidates = dict(by_name)
        failed_names: set[str] = set()

        changed = True
        while changed:
            changed = False
            for name, plugin in list(candidates.items()):
                if not is_api_compatible(plugin.api_version, self.contracts_api_version):
                    error = PluginApiVersionError(name, plugin.api_version, self.contracts_api_version)
                    self._fail(report, name, error)
                    del candidates[name]
                    failed_names.add(name)
                    changed = True
                    continue

                missing = [dep for dep in plugin.requires if dep not in by_name and dep not in already_loaded]
                unavailable = [dep for dep in plugin.requires if dep in failed_names and dep not in missing]
                all_missing = missing + unavailable
                if all_missing:
                    self._fail(report, name, PluginDependencyError(name, all_missing))
                    del candidates[name]
                    failed_names.add(name)
                    changed = True
                    continue

                provided = set(host_tools)
                for candidate in candidates.values():
                    provided.update(candidate.provides_tools)
                missing_tools = [tool for tool in plugin.requires_tools if tool not in provided]
                if missing_tools:
                    self._fail(report, name, PluginMissingToolsError(name, missing_tools))
                    del candidates[name]
                    failed_names.add(name)
                    changed = True
                    continue

        return [plugin for plugin in plugins if plugin.name in candidates]

    def _fail(self, report: PackageReport, name: str, error: Exception) -> None:
        if self.strict:
            raise error
        report.add_failure(name, error)

    @staticmethod
    def _topological_order(plugins: list[SoupPlugin]) -> list[SoupPlugin]:
        """Each plugin after the ones it requires and the providers of the tools it requires."""

        by_name = {plugin.name: plugin for plugin in plugins}
        providers: dict[str, list[str]] = {}
        for plugin in plugins:
            for tool in plugin.provides_tools:
                providers.setdefault(tool, []).append(plugin.name)
        predecessors = {
            plugin.name: [
                *plugin.requires,
                *(provider for tool in plugin.requires_tools
                    for provider in providers.get(tool, ()) if provider != plugin.name),
            ]
            for plugin in plugins
        }
        ordered, blocked = topological_order(list(by_name), predecessors)
        if blocked:
            raise PluginCycleError(blocked)
        return [by_name[name] for name in ordered]

    # ------------------------------------------------------------------ #
    # Phase 6: shutdown
    # ------------------------------------------------------------------ #
    def shutdown(self) -> None:
        if self._ctx is None:
            return
        for plugin in reversed(self._loaded_plugins):
            with suppress(Exception):  # shutdown is best-effort
                plugin.on_shutdown(self._ctx)
            with suppress(Exception):
                self._ctx.publish(PACKAGE_UNLOADED, {"package": plugin.name, "version": plugin.version})
