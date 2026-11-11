"""
------------------------------------------------------------------------
File : manager.py
Description: PackageManager - the facade of the runtime package
             lifecycle, on top of the PluginManager (which still
             registers/unregisters the SoupPlugin of each package). It
             serializes every change with one lock and delegates:
             - load_all(): discovery from SOUP_PACKAGES_PATH, then the
               SOUP_PACKAGES override or the persisted enabled/disabled
               state (PackageState), then PackagePreparer: the checks made
               on the manifest BEFORE importing any code (api_version,
               python_dependencies, global names - tools and extension
               points - declared by two active packages, `requires`,
               dependency cycles), import under soup_pkg_<name>; then
               registration. Every failure is isolated in the
               PackageReport, unless strict.
             - install(zip) / uninstall(name): PackageInstaller, only if
               SOUP_ALLOW_PACKAGE_INSTALL is true (403 otherwise).
             - disable(name) / enable(name): Registry.remove_owner
               through PluginManager.unload, and registration of a fresh
               plugin instance; refused (409) while active packages
               depend on it (PackageChecks.dependents), unless cascade.
             Objects created by a package that is no longer loaded stay
             in the catalog; package_status() tells the workspace whether
             their package is active, disabled or missing.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import builtins
import logging
import threading
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO

from soup.core.contracts import (
    CONTRACTS_API_VERSION,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    SoupPlugin,
    ValidationError,
)
from soup.core.ordering import topological_order
from soup.core.packages.archive import ArchiveLimits
from soup.core.packages.checks import PackageChecks
from soup.core.packages.dependencies import VersionLookup, installed_version
from soup.core.packages.discovery import PackageSource, discover_packages
from soup.core.packages.info import (
    STATUS_ACTIVE,
    STATUS_DISABLED,
    STATUS_FAILED,
    STATUS_MISSING,
    PackageIndex,
    PackageInfo,
)
from soup.core.packages.installer import STAGING_DIR, PackageInstaller
from soup.core.packages.loader import PluginFactory, plugin_factory
from soup.core.packages.manifest import validate_package_name
from soup.core.packages.preparation import PackagePreparer
from soup.core.packages.state import PackageState
from soup.core.plugin_context import DefaultPluginContext
from soup.core.plugin_manager import PackageReport, PluginManager

__all__ = [
    "STAGING_DIR",
    "STATUS_ACTIVE",
    "STATUS_DISABLED",
    "STATUS_FAILED",
    "STATUS_MISSING",
    "PackageInfo",
    "PackageManager",
    "PackageManagerConfig",
]

_LOGGER = logging.getLogger("soup.packages")


@dataclass
class PackageManagerConfig:
    packages_path: tuple[str, ...]
    installed_dir: str
    # None: every package found; otherwise only these (SOUP_PACKAGES).
    enabled_override: tuple[str, ...] | None = None
    allow_install: bool = False
    strict: bool = False
    contracts_api_version: str = CONTRACTS_API_VERSION
    limits: ArchiveLimits = field(default_factory=ArchiveLimits)


class PackageManager:
    def __init__(
        self,
        plugin_manager: PluginManager,
        ctx: DefaultPluginContext,
        config: PackageManagerConfig,
        version_lookup: VersionLookup = installed_version,
    ):
        self.plugin_manager = plugin_manager
        self.ctx = ctx
        self.config = config
        self.installed_dir = Path(config.installed_dir)
        self.state = PackageState(self.installed_dir)
        self.report = PackageReport()
        self._index = PackageIndex()
        self._lock = threading.RLock()
        self._checks = PackageChecks(plugin_manager, ctx, config.contracts_api_version, version_lookup)
        self._preparer = PackagePreparer(plugin_manager, self._checks, self._fail)
        self._installer = PackageInstaller(
            self.installed_dir, config, self._index, self.state, plugin_manager,
            self._checks, self._load_one, self._reload_quietly, self.info,
        )

    # ------------------------------------------------------------------ #
    # Startup
    # ------------------------------------------------------------------ #
    def load_all(self, extra_plugins: Iterable[SoupPlugin] = ()) -> PackageReport:
        """
        Discover and load every enabled package, plus `extra_plugins`
        (plugins built in code, e.g. by tests). Returns the report.
        """

        with self._lock:
            report = PackageReport()
            discovery = discover_packages(self.config.packages_path, self.installed_dir)
            for warning in discovery.warnings:
                report.add_warning(warning)
            for folder, error in discovery.failures:
                self._fail(report, folder, error)
            self._index.sources = dict(discovery.sources)

            plugins = self._prepare(self._enabled_sources(report), report)
            for plugin in extra_plugins:
                self._index.factories[plugin.name] = _same_instance(plugin)
                plugins.append(plugin)
            self._load(plugins, report)

            self.report = report
            return report

    def _enabled_sources(self, report: PackageReport) -> list[PackageSource]:
        """The packages found that start enabled: the SOUP_PACKAGES override, or the persisted state."""

        override = self.config.enabled_override
        if override is not None:
            for name in override:
                if name not in self._index.sources:
                    report.add_warning(f"SOUP_PACKAGES lists '{name}', but no such package was found")
        enabled = []
        for name, source in self._index.sources.items():
            disabled = name not in override if override is not None else self.state.is_disabled(name)
            if override is None and self.ctx.database.backend not in source.manifest.databases:
                disabled = True
            if disabled:
                report.add_disabled(name)
            else:
                enabled.append(source)
        return enabled

    # ------------------------------------------------------------------ #
    # Queries
    # ------------------------------------------------------------------ #
    def list(self) -> builtins.list[PackageInfo]:
        with self._lock:
            names = sorted(set(self._index.sources) | set(self.plugin_manager.loaded_names) | set(self._index.errors))
            return [self.info(name) for name in names]

    def info(self, name: str) -> PackageInfo:
        with self._lock:
            source = self._index.sources.get(name)
            plugin = self.plugin_manager.get(name)
            if source is None and plugin is None and name not in self._index.errors:
                raise NotFoundError(f"Package '{name}' not found")
            status = self._status(name)
            manifest = source.manifest if source is not None else None
            # Both a manifest and a plugin declare version/requires/tools.
            declared = manifest if manifest is not None else plugin
            return PackageInfo(
                databases=tuple(declared.databases) if declared else ("memgraph",),
                name=name,
                status=status,
                version=declared.version if declared else "",
                label=manifest.label if manifest else name,
                description=manifest.description if manifest else "",
                author=manifest.author if manifest else "",
                origin=source.origin if source else ("code" if plugin else ""),
                error=self._index.errors.get(name) if status == STATUS_FAILED else None,
                requires=tuple(declared.requires) if declared else (),
                requires_tools=tuple(declared.requires_tools) if declared else (),
                provides_tools=tuple(declared.provides_tools) if declared else (),
                extension_points=tuple(declared.extension_points) if declared else (),
                dependents=tuple(self.dependents(name)),
                app_entry=manifest.app_entry if manifest else None,
                contributions=self._contributions(name),
            )

    def source(self, name: str) -> PackageSource | None:
        """The package as found on disk (None for packages built in code)."""

        with self._lock:
            return self._index.sources.get(name)

    def active_in_load_order(self) -> builtins.list[str]:
        """
        The active packages ordered so that each comes after the packages
        it requires (stable on the load order).
        """

        with self._lock:
            loaded = list(self.plugin_manager.loaded_names)
            requires = {}
            for name in loaded:
                plugin = self.plugin_manager.get(name)
                requires[name] = tuple(plugin.requires) if plugin is not None else ()
            ordered, blocked = topological_order(loaded, requires)
            return [*ordered, *blocked]

    def package_status(self, name: str) -> str:
        """active | disabled (known but not loaded, also after a failure) | missing."""

        with self._lock:
            if self.plugin_manager.get(name) is not None:
                return STATUS_ACTIVE
            if name in self._index.sources or name in self._index.factories:
                return STATUS_DISABLED
            return STATUS_MISSING

    def dependents(self, name: str) -> builtins.list[str]:
        """
        Active packages that need `name`, directly or transitively
        (PackageChecks.dependents), last loaded first.
        """

        with self._lock:
            return self._checks.dependents(name)

    # ------------------------------------------------------------------ #
    # Enable / disable
    # ------------------------------------------------------------------ #
    def disable(self, name: str, cascade: bool = False) -> builtins.list[str]:
        """
        Unload `name` (and, with cascade, the active packages depending on
        it) and remember it as disabled. Returns the names disabled.
        :raises ConflictError: active packages depend on it and not cascade
        """

        with self._lock:
            self._require_known(name)
            if self.plugin_manager.get(name) is None:
                self.state.set_disabled(name, True)
                return []
            dependents = self.dependents(name)
            if dependents and not cascade:
                raise ConflictError(
                    f"Package '{name}' is needed by {', '.join(dependents)}: disable them first, or use cascade",
                    details={"dependents": dependents},
                )
            disabled = [*dependents, name]
            for package in disabled:
                self.plugin_manager.unload(package)
                self.state.set_disabled(package, True)
            return disabled

    def enable(self, name: str) -> PackageInfo:
        """
        Load `name` again (a fresh plugin instance) and remember it as
        enabled.
        :raises ConflictError: a package it requires is not active
        :raises ValidationError: its manifest checks fail or register() fails
        """

        with self._lock:
            self._require_known(name)
            if self.plugin_manager.get(name) is None:
                source = self._index.sources.get(name)
                if source is not None:
                    self._check_enable(source)
                self._load_one(name, self._factory(name))
            self.state.set_disabled(name, False)
            return self.info(name)

    def _check_enable(self, source: PackageSource) -> None:
        self._checks.require_active(source.manifest)
        self._checks.conflict_with_active(source.manifest)
        problem = self._checks.manifest_problem(source.manifest)
        if problem is not None:
            self._index.errors[source.name] = str(problem)
            raise ValidationError(str(problem))

    # ------------------------------------------------------------------ #
    # Install / uninstall
    # ------------------------------------------------------------------ #
    def install(self, stream: BinaryIO, allow_override: bool = False) -> PackageInfo:
        """
        Install a package from a zip and load it at once. A package with
        the name of a bundled one is accepted only in a higher version
        and with allow_override; an installed one is upgraded only to a
        higher version.
        :raises ForbiddenError: installation is disabled on this server
        :raises ValidationError: invalid archive/manifest, missing Python
            libraries, the package fails to load
        :raises ConflictError: name already used, missing `requires`,
            active dependents of the version being replaced
        """

        with self._lock:
            self._require_install_allowed("install")
            return self._installer.install(stream, allow_override)

    def uninstall(self, name: str) -> None:
        """
        Unload and delete an installed package. Objects it created stay in
        the catalog (their package becomes "missing"). If a bundled
        package of the same name exists, it takes its place.
        :raises ForbiddenError: installation is disabled on this server
        :raises ConflictError: bundled package, or active dependents
        """

        with self._lock:
            self._require_install_allowed("uninstall")
            self._installer.uninstall(name)

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    def _prepare(self, sources: builtins.list[PackageSource], report: PackageReport) -> builtins.list[SoupPlugin]:
        plugins, factories = self._preparer.prepare(sources, report)
        self._index.factories.update(factories)
        return plugins

    def _reload_quietly(self, source: PackageSource) -> None:
        """Best-effort reload of a previous version: failures go to the report and the log."""

        report = PackageReport()
        try:
            self._load(self._prepare([source], report), report)
        except Exception as exc:  # noqa: BLE001 - rollback must not hide the original error
            report.add_failure(source.name, exc)
            self._index.errors[source.name] = str(exc)
        for failure in report.failed:
            _LOGGER.warning("Package '%s' could not be reloaded: %s", failure.plugin_name, failure.reason)
        self.report.merge(report)

    def _load(self, plugins: builtins.list[SoupPlugin], report: PackageReport) -> None:
        loaded = self.plugin_manager.load(plugins, ctx=self.ctx)
        for failure in loaded.failed:
            self._index.errors[failure.plugin_name] = failure.reason
        for name in loaded.loaded:
            self._index.errors.pop(name, None)
        report.merge(loaded)

    def _load_one(self, name: str, factory: PluginFactory) -> None:
        """:raises ValidationError: the package does not load"""

        report = PackageReport()
        self._load([factory()], report)
        if report.failed:
            raise ValidationError(f"Package '{name}' could not be loaded: {report.failed[0].reason}")

    def _factory(self, name: str) -> PluginFactory:
        factory = self._index.factories.get(name)
        if factory is None:
            factory = plugin_factory(self._index.sources[name])
            self._index.factories[name] = factory
        return factory

    def _contributions(self, name: str) -> dict[str, tuple[str, ...]]:
        registries = (
            ("importers", self.ctx.importers),
            ("operations", self.ctx.operations),
            ("visualizers", self.ctx.visualizers),
            ("exporters", self.ctx.exporters),
            ("tools", self.ctx.tool_registry),
        )
        return {kind: tuple(registry.keys_of(name)) for kind, registry in registries}

    def _status(self, name: str) -> str:
        if self.plugin_manager.get(name) is not None:
            return STATUS_ACTIVE
        if name in self._index.errors and not self.state.is_disabled(name):
            return STATUS_FAILED
        return STATUS_DISABLED

    def _require_known(self, name: str) -> None:
        validate_package_name(name)
        if name not in self._index.sources and name not in self._index.factories:
            raise NotFoundError(f"Package '{name}' not found")

    def _require_install_allowed(self, action: str) -> None:
        if not self.config.allow_install:
            raise ForbiddenError(
                f"Package {action} is disabled on this server (set SOUP_ALLOW_PACKAGE_INSTALL=true to allow it)"
            )

    def _fail(self, report: PackageReport, name: str, error: Exception) -> None:
        if self.config.strict:
            raise error
        report.add_failure(name, error)
        self._index.errors[name] = str(error)


def _same_instance(plugin: SoupPlugin) -> PluginFactory:
    def build() -> SoupPlugin:
        return plugin

    return build
