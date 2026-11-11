"""
------------------------------------------------------------------------
File : checks.py
Description: PackageChecks - the checks the PackageManager makes on a
             package before (and while) it is active, all without
             importing its code:
             - manifest_problem(): api_version compatible with the host's
               contracts, python_dependencies installed;
             - claims() / conflict_with_active(): the global names (tools
               and extension points) a package declares, which no two
               active packages may share;
             - require_active(): the packages it requires are active;
             - dependents(): the active packages needing a package,
               through `requires` or a tool only it provides.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from typing import Any

from soup.core.contracts import (
    ConflictError,
    PluginApiVersionError,
    PluginConflictError,
    PluginPythonDependencyError,
    ValidationError,
    is_api_compatible,
)
from soup.core.packages.dependencies import VersionLookup, python_dependency_problems
from soup.core.packages.manifest import PackageManifest
from soup.core.plugin_context import DefaultPluginContext
from soup.core.plugin_manager import PluginManager

Claims = dict[tuple[str, str], str]


def claims_of(declared: Any) -> Claims:
    """The global names a manifest (or a plugin) declares: (kind, name) -> its package."""

    claims = {("tool", tool): declared.name for tool in declared.provides_tools}
    claims.update({("extension_point", point): declared.name for point in declared.extension_points})
    return claims


def declaration_conflict(manifest: PackageManifest, claims: Claims) -> PluginConflictError | None:
    for kind, names in (("tool", manifest.provides_tools), ("extension_point", manifest.extension_points)):
        for name in names:
            owner = claims.get((kind, name))
            if owner is not None and owner != manifest.name:
                return PluginConflictError(kind, name, owner, manifest.name)
    return None


class PackageChecks:
    def __init__(
        self,
        plugin_manager: PluginManager,
        ctx: DefaultPluginContext,
        contracts_api_version: str,
        version_lookup: VersionLookup,
    ):
        self._plugins = plugin_manager
        self._ctx = ctx
        self._api_version = contracts_api_version
        self._version_lookup = version_lookup

    def manifest_problem(self, manifest: PackageManifest) -> Exception | None:
        backend = self._ctx.database.backend
        if backend not in manifest.databases:
            return ValidationError(f"Package '{manifest.name}' does not support database '{backend}'")
        if not is_api_compatible(manifest.api_version, self._api_version):
            return PluginApiVersionError(manifest.name, manifest.api_version, self._api_version)
        problems = python_dependency_problems(manifest, self._version_lookup)
        if problems:
            return PluginPythonDependencyError(manifest.name, problems)
        return None

    def claims(self) -> Claims:
        """(kind, global name) -> active package declaring it, for tools and extension points."""

        claims: Claims = {}
        # Registry iterates over its items: the names are keys().
        for tool in self._ctx.tool_registry.keys():  # noqa: SIM118
            claims[("tool", tool)] = self._ctx.tool_registry.owner_of(tool) or ""
        for name in self._plugins.loaded_names:
            plugin = self._plugins.get(name)
            if plugin is not None:
                claims.update(claims_of(plugin))
        return claims

    def conflict_with_active(self, manifest: PackageManifest) -> None:
        """:raises ConflictError: an active package already declares one of its global names"""

        conflict = declaration_conflict(manifest, self.claims())
        if conflict is not None:
            raise ConflictError(
                f"Package '{manifest.name}' declares {conflict.kind} '{conflict.key}', already declared by "
                f"active package '{conflict.existing_owner}'",
                details={"conflict": {
                    "kind": conflict.kind,
                    "name": conflict.key,
                    "packages": [conflict.existing_owner, conflict.new_owner],
                }},
            )

    def require_active(self, manifest: PackageManifest) -> None:
        """:raises ConflictError: a package it requires is not active"""

        missing = [dep for dep in manifest.requires if self._plugins.get(dep) is None]
        if missing:
            raise ConflictError(
                f"Package '{manifest.name}' requires packages that are not active: {', '.join(missing)}",
                details={"missing": missing},
            )

    def dependents(self, name: str) -> list[str]:
        """
        Active packages that need `name`, directly or transitively: they
        list it in `requires`, or use a tool only it provides. Ordered so
        that unloading them in this order never leaves a package without
        what it needs (last loaded first).
        """

        loaded = self._plugins.loaded_names
        found: set[str] = set()
        frontier = [name]
        while frontier:
            current = frontier.pop()
            for other in self._needing(current, loaded, exclude={name, *found}):
                found.add(other)
                frontier.append(other)
        return [other for other in reversed(loaded) if other in found]

    def _needing(self, package: str, loaded: list[str], exclude: set[str]) -> list[str]:
        """The loaded packages (but `exclude`) requiring `package` or a tool it provides."""

        registry = self._ctx.tool_registry
        provided = {tool for tool in registry.keys() if registry.owner_of(tool) == package}  # noqa: SIM118
        needing = []
        for other in loaded:
            plugin = self._plugins.get(other)
            if other in exclude or plugin is None:
                continue
            if package in plugin.requires or provided.intersection(plugin.requires_tools):
                needing.append(other)
        return needing
