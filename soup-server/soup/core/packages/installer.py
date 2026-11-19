"""
------------------------------------------------------------------------
File : installer.py
Description: PackageInstaller - installing a package from a zip and
             uninstalling it, for the PackageManager (which serializes
             the calls with its lock and checks that installation is
             allowed):
             - install(): the archive is extracted in a staging folder
               and its manifest checked (version rules against a bundled
               or installed package of the same name, manifest problems,
               active `requires`, global names, active dependents of the
               version replaced), then it takes the place of the previous
               version and is loaded at once; if it does not load, the
               previous version comes back (and is reloaded if it was
               active);
             - uninstall(): unloaded and removed, and a bundled package of
               the same name, if any, takes its place.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import os
import shutil
import uuid
from collections.abc import Callable
from pathlib import Path
from typing import BinaryIO, Protocol

from soup.core.contracts import ConflictError, DomainError, NotFoundError, ValidationError
from soup.core.packages.archive import ArchiveLimits, extract_package_zip
from soup.core.packages.checks import PackageChecks
from soup.core.packages.discovery import ORIGIN_INSTALLED, PackageSource, discover_packages
from soup.core.packages.info import PackageIndex, PackageInfo
from soup.core.packages.loader import PluginFactory, plugin_factory, purge
from soup.core.packages.manifest import PackageManifest, load_manifest
from soup.core.packages.state import PackageState
from soup.core.plugin_manager import PluginManager

STAGING_DIR = "_staging"

class InstallConfig(Protocol):
    """What the installer reads of the PackageManagerConfig, at each call (tests change it)."""

    packages_path: tuple[str, ...]
    limits: ArchiveLimits


LoadOne = Callable[[str, PluginFactory], None]
Reload = Callable[[PackageSource], None]
Describe = Callable[[str], PackageInfo]


def _needed_by(name: str, dependents: list[str], what: str) -> ConflictError:
    return ConflictError(
        f"Package '{name}' is needed by {', '.join(dependents)}: {what}",
        details={"dependents": dependents},
    )


class PackageInstaller:
    def __init__(  # noqa: PLR0913, PLR0917 - the collaborators, injected by the PackageManager
        self,
        installed_dir: Path,
        config: InstallConfig,
        index: PackageIndex,
        state: PackageState,
        plugin_manager: PluginManager,
        checks: PackageChecks,
        load_one: LoadOne,
        reload_quietly: Reload,
        describe: Describe,
        dependencies: Callable[..., None],
    ):
        self._installed_dir = installed_dir
        self._config = config
        self._index = index
        self._state = state
        self._plugins = plugin_manager
        self._checks = checks
        self._load_one = load_one
        self._reload_quietly = reload_quietly
        self._describe = describe
        self._dependencies = dependencies

    def install(self, stream: BinaryIO, allow_override: bool, approve_dependencies: bool = False) -> PackageInfo:
        staging = self._installed_dir / STAGING_DIR / uuid.uuid4().hex
        try:
            root = extract_package_zip(stream, staging / "package", self._config.limits)
            manifest = load_manifest(root)
            return self._install_from(root, manifest, staging, allow_override, approve_dependencies)
        finally:
            shutil.rmtree(staging, ignore_errors=True)

    def uninstall(self, name: str) -> None:
        source = self._index.sources.get(name)
        if source is None:
            raise NotFoundError(f"Package '{name}' not found")
        if source.origin != ORIGIN_INSTALLED:
            raise ConflictError(f"Package '{name}' ships with SOUP: it can be disabled, not uninstalled")
        dependents = self._checks.dependents(name)
        if dependents:
            raise _needed_by(name, dependents, "disable or uninstall them first")
        if self._plugins.get(name) is not None:
            self._plugins.unload(name)
        purge(name)
        shutil.rmtree(source.path, ignore_errors=True)
        self._state.forget(name)
        self._index.forget(name)
        self._restore_bundled(name)

    # ------------------------------------------------------------------ #
    def _install_from(
        self, root: Path, manifest: PackageManifest, staging: Path, allow_override: bool,
        approve_dependencies: bool = False,
    ) -> PackageInfo:
        name = manifest.name
        existing = self._index.sources.get(name)
        self._check_replaceable(manifest, existing, allow_override)
        was_active = self._plugins.get(name) is not None
        self._checks.require_active(manifest)
        self._checks.conflict_with_active(manifest)
        if was_active and self._checks.dependents(manifest.name):
            raise _needed_by(name, self._checks.dependents(name), "disable them before upgrading it")
        self._dependencies(manifest, approved=approve_dependencies)
        self._check_installable(manifest, was_active)

        target = self._installed_dir / name
        backup = staging / "previous"
        self._swap_in(name, root, target, backup, was_active)
        source = PackageSource(load_manifest(target), target, ORIGIN_INSTALLED)
        try:
            factory = plugin_factory(source)
            self._load_one(name, factory)
        except Exception as exc:
            self._roll_back(name, target, backup, existing, was_active)
            if isinstance(exc, DomainError):
                raise
            raise ValidationError(f"Package '{name}' could not be loaded: {exc}") from exc

        self._index.sources[name] = source
        self._index.factories[name] = factory
        self._index.errors.pop(name, None)
        self._state.forget(name)
        return self._describe(name)

    @staticmethod
    def _check_replaceable(manifest: PackageManifest, existing: PackageSource | None, allow_override: bool) -> None:
        """:raises ConflictError: the version rules against a package of the same name"""

        if existing is None:
            return
        name = manifest.name
        newer = manifest.parsed_version > existing.manifest.parsed_version
        if existing.origin != ORIGIN_INSTALLED and not (newer and allow_override):
            raise ConflictError(
                f"Package '{name}' ships with SOUP (version {existing.manifest.version}): only a higher "
                "version can replace it, and only with explicit confirmation (allow_override)"
            )
        if existing.origin == ORIGIN_INSTALLED and not newer:
            raise ConflictError(
                f"Package '{name}' is already installed in version {existing.manifest.version}: "
                "install a higher version to upgrade it"
            )

    def _check_installable(self, manifest: PackageManifest, was_active: bool) -> None:
        problem = self._checks.manifest_problem(manifest)
        if problem is not None:
            raise ValidationError(str(problem))
        self._checks.require_active(manifest)
        self._checks.conflict_with_active(manifest)
        if was_active:
            dependents = self._checks.dependents(manifest.name)
            if dependents:
                raise _needed_by(manifest.name, dependents, "disable them before upgrading it")

    def _swap_in(self, name: str, root: Path, target: Path, backup: Path, was_active: bool) -> None:
        if was_active:
            self._plugins.unload(name)
        purge(name)
        if target.exists():
            os.replace(target, backup)
        os.replace(root, target)

    def _roll_back(
        self, name: str, target: Path, backup: Path, existing: PackageSource | None, was_active: bool
    ) -> None:
        """The previous version back in place (and loaded again if it was active)."""

        purge(name)
        shutil.rmtree(target, ignore_errors=True)
        if backup.exists():
            os.replace(backup, target)
        if existing is None:
            self._index.errors.pop(name, None)
            self._index.factories.pop(name, None)
        elif was_active:
            self._reload_quietly(existing)

    def _restore_bundled(self, name: str) -> None:
        discovery = discover_packages(self._config.packages_path, self._installed_dir)
        source = discovery.sources.get(name)
        if source is None:
            return
        self._index.sources[name] = source
        if not self._state.is_disabled(name):
            self._reload_quietly(source)
