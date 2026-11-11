"""
------------------------------------------------------------------------
File : loader.py
Description: Imports a package's server module under an isolated name,
             soup_pkg_<name>, so two packages may both have a
             server/plugin.py without colliding, and builds its
             SoupPlugin from the manifest's "module:Attribute" spec.
             Another package reaches this one only through
             soup_pkg_<name>.api, after declaring it in `requires` (it
             then loads after this one, so the module is already
             imported). purge() forgets the modules of a package being
             uninstalled or upgraded.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import importlib
import importlib.util
import sys
from collections.abc import Callable
from pathlib import Path
from types import ModuleType

from soup.core.contracts import PluginError, SoupPlugin
from soup.core.packages.discovery import PackageSource
from soup.core.packages.manifest import PackageManifest, module_name_for

PluginFactory = Callable[[], SoupPlugin]


def import_server_module(source: PackageSource) -> ModuleType:
    """Import (once) the package's server module as soup_pkg_<name>."""

    manifest = source.manifest
    module_name = manifest.module_name
    module_dir = Path(source.path).joinpath(*manifest.server_module.split("."))
    existing = sys.modules.get(module_name)
    if existing is not None:
        if _same_file(getattr(existing, "__file__", None), module_dir / "__init__.py"):
            return existing
        # Same package name, other folder (an upgrade, or another copy): start over.
        purge(manifest.name)

    spec = importlib.util.spec_from_file_location(
        module_name, module_dir / "__init__.py", submodule_search_locations=[str(module_dir)]
    )
    if spec is None or spec.loader is None:
        raise PluginError(f"Package '{manifest.name}': cannot import server module from '{module_dir}'")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        purge(manifest.name)
        raise
    return module


def plugin_factory(source: PackageSource) -> PluginFactory:
    """
    Import the package and return a function building a fresh, configured
    SoupPlugin each time (enable after disable gets a new instance).
    """

    manifest = source.manifest
    import_server_module(source)
    module_path, _, attribute = manifest.server_plugin.partition(":")
    try:
        module = importlib.import_module(f"{manifest.module_name}.{module_path}")
    except BaseException:
        purge(manifest.name)
        raise
    target = getattr(module, attribute, None)

    if isinstance(target, type) and issubclass(target, SoupPlugin):
        plugin_class = target

        def build() -> SoupPlugin:
            return configure(plugin_class(), manifest)
    elif isinstance(target, SoupPlugin):
        instance = target

        def build() -> SoupPlugin:
            return configure(instance, manifest)
    else:
        raise PluginError(
            f"Package '{manifest.name}': '{manifest.server_plugin}' is not a SoupPlugin class or instance"
        )
    return build


def configure(plugin: SoupPlugin, manifest: PackageManifest) -> SoupPlugin:
    """The manifest is the source of truth for the plugin's identity and dependencies."""

    plugin.databases = manifest.databases
    plugin.name = manifest.name
    plugin.version = manifest.version
    plugin.api_version = manifest.api_version
    plugin.requires = manifest.requires
    plugin.requires_tools = manifest.requires_tools
    plugin.provides_tools = manifest.provides_tools
    plugin.extension_points = manifest.extension_points
    return plugin


def _same_file(module_file: str | None, expected: Path) -> bool:
    if not module_file:
        return False
    try:
        return Path(module_file).resolve() == expected.resolve()
    except OSError:
        return False


def purge(package_name: str) -> None:
    prefix = module_name_for(package_name)
    for name in [name for name in sys.modules if name == prefix or name.startswith(prefix + ".")]:
        del sys.modules[name]
