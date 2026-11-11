"""
------------------------------------------------------------------------
File : manifest.py
Description: PackageManifest - the content of a package's
             soup-package.json, validated. The manifest is the single
             source of truth for a package's identity and dependencies:
             the PackageManager copies name, version, api_version,
             requires, requires_tools, provides_tools and
             extension_points onto the package's SoupPlugin instance.
             Tool and extension point names are global (several packages
             use them); importer/operation/visualizer/exporter ids are
             not declared here: they are scoped to the package. Every problem is reported at
             once, one message per field, in ValidationError.details.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, cast

from packaging.requirements import InvalidRequirement, Requirement
from packaging.version import InvalidVersion, Version

from soup.core.contracts import ValidationError, parse_api_version, validate_name

MANIFEST_FILE = "soup-package.json"
# The folder of app/ holding the built bundle: the only part served to the browser.
APP_DIR = "app"
APP_DIST_DIR = "dist"

# A package name is also part of a Python module name (soup_pkg_<name>).
_PACKAGE_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_MODULE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$")
_ATTRIBUTE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@dataclass(frozen=True)
class PackageManifest:
    name: str
    version: str
    api_version: str
    label: str
    description: str
    author: str
    requires: tuple[str, ...]
    requires_tools: tuple[str, ...]
    provides_tools: tuple[str, ...]
    extension_points: tuple[str, ...]
    python_dependencies: tuple[str, ...]
    server_module: str
    server_plugin: str
    app_entry: str | None = None
    databases: tuple[str, ...] = ("memgraph",)

    @property
    def parsed_version(self) -> Version:
        return Version(self.version)

    @property
    def module_name(self) -> str:
        """The isolated name the server module is imported under."""

        return module_name_for(self.name)

    def to_dict(self) -> dict[str, Any]:
        return {
            "databases": list(self.databases),
            "name": self.name,
            "version": self.version,
            "api_version": self.api_version,
            "label": self.label,
            "description": self.description,
            "author": self.author,
            "requires": list(self.requires),
            "requires_tools": list(self.requires_tools),
            "provides_tools": list(self.provides_tools),
            "extension_points": list(self.extension_points),
            "python_dependencies": list(self.python_dependencies),
            "server": {"module": self.server_module, "plugin": self.server_plugin},
            "app": {"entry": self.app_entry} if self.app_entry else None,
        }


def module_name_for(package_name: str) -> str:
    return f"soup_pkg_{package_name}"


def validate_package_name(name: Any) -> str:
    """validate_name() plus the stricter shape a module name needs. :raises ValidationError:"""

    validate_name(name, label="Package")
    if not _PACKAGE_NAME_RE.match(name):
        raise ValidationError(
            f"Package name must be lowercase letters, digits and '_', starting with a letter: {name!r}"
        )
    return cast(str, name)  # validate_name accepted it: a string


def load_manifest(package_dir: Path) -> PackageManifest:
    """Read and validate <package_dir>/soup-package.json. :raises ValidationError:"""

    path = Path(package_dir) / MANIFEST_FILE
    if not path.is_file():
        raise ValidationError(f"Missing {MANIFEST_FILE} in package folder '{Path(package_dir).name}'")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValidationError(f"{MANIFEST_FILE} is not valid JSON: {exc}") from None
    return parse_manifest(data, package_dir)


class _ManifestReader:
    """Reads the fields of a manifest dict, collecting one message per invalid field (in field order)."""

    def __init__(self, data: Mapping[str, Any]):
        self.data = data
        self.errors: dict[str, str] = {}

    def text(self, key: str, required: bool = True) -> str:
        value = self.data.get(key)
        if value is None and not required:
            return ""
        if not isinstance(value, str) or (required and not value.strip()):
            self.errors[key] = "must be a non-empty string" if required else "must be a string"
            return ""
        return value

    def names(self, key: str) -> tuple[str, ...]:
        value = self.data.get(key, [])
        if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
            self.errors[key] = "must be a list of non-empty strings"
            return ()
        if len(set(value)) != len(value):
            self.errors[key] = "must not contain duplicates"
        return tuple(value)

    def name(self) -> str:
        name = self.text("name")
        if name:
            try:
                validate_package_name(name)
            except ValidationError as exc:
                self.errors["name"] = str(exc)
        return name

    def version(self) -> str:
        version = self.text("version")
        if version:
            try:
                Version(version)
            except InvalidVersion:
                self.errors["version"] = f"is not a valid version: {version!r}"
        return version

    def api_version(self) -> str:
        api_version = self.text("api_version")
        if api_version and parse_api_version(api_version) is None:
            self.errors["api_version"] = f'must be "MAJOR.MINOR", got {api_version!r}'
        return api_version

    def requires(self, name: str) -> tuple[str, ...]:
        requires = self.names("requires")
        for dep in requires:
            if not _PACKAGE_NAME_RE.match(dep):
                self.errors["requires"] = f"is not a package name: {dep!r}"
        if name and name in requires:
            self.errors["requires"] = "a package cannot require itself"
        return requires

    def python_dependencies(self) -> tuple[str, ...]:
        python_dependencies = self.names("python_dependencies")
        for spec in python_dependencies:
            try:
                Requirement(spec)
            except InvalidRequirement as exc:
                self.errors["python_dependencies"] = f"invalid requirement {spec!r}: {exc}"
        return python_dependencies

    def check_server_module(self, package_dir: Path | None, server_module: str) -> None:
        if package_dir is None or not server_module or "server" in self.errors:
            return
        module_dir = Path(package_dir).joinpath(*server_module.split("."))
        if not (module_dir / "__init__.py").is_file():
            expected = server_module.replace(".", "/") + "/__init__.py"
            self.errors["server"] = f"module '{server_module}' not found (expected {expected})"

    def raise_errors(self, name: str) -> None:
        if self.errors:
            raise ValidationError(f"Invalid manifest for package '{name or '?'}': " + "; ".join(
                f"{key} {message}" for key, message in self.errors.items()
            ), details={"fields": self.errors})


def parse_manifest(data: Any, package_dir: Path | None = None) -> PackageManifest:
    """
    Validate a manifest dict. With `package_dir`, also check that the
    server module exists inside it.
    :raises ValidationError: details = {field: message}
    """

    if not isinstance(data, Mapping):
        raise ValidationError(f"{MANIFEST_FILE} must contain a JSON object")

    reader = _ManifestReader(data)
    name = reader.name()
    version = reader.version()
    api_version = reader.api_version()
    label = reader.text("label", required=False) or name
    description = reader.text("description", required=False)
    author = reader.text("author", required=False)
    requires = reader.requires(name)
    requires_tools = reader.names("requires_tools")
    provides_tools = reader.names("provides_tools")
    extension_points = reader.names("extension_points")
    python_dependencies = reader.python_dependencies()
    server_module, server_plugin = _parse_server(data.get("server"), reader.errors)
    app_entry = _parse_app(data.get("app"), reader.errors)
    reader.check_server_module(package_dir, server_module)
    databases = reader.names("databases") if "databases" in data else ("memgraph",)
    if not databases or any(db not in {"memgraph", "neo4j"} for db in databases):
        reader.errors["databases"] = "must list memgraph, neo4j, or both"
    reader.raise_errors(name)

    return PackageManifest(
        name=name,
        version=version,
        api_version=api_version,
        label=label,
        description=description,
        author=author,
        requires=requires,
        requires_tools=requires_tools,
        provides_tools=provides_tools,
        extension_points=extension_points,
        python_dependencies=python_dependencies,
        server_module=server_module,
        server_plugin=server_plugin,
        app_entry=app_entry,
        databases=databases,
    )


def _parse_server(server: Any, errors: dict[str, str]) -> tuple[str, str]:
    if not isinstance(server, Mapping):
        errors["server"] = 'must be an object {"module", "plugin"}'
        return "", ""
    module = server.get("module")
    plugin = server.get("plugin")
    if not isinstance(module, str) or not _MODULE_RE.match(module):
        errors["server"] = f"module must be a module path inside the package, got {module!r}"
        return "", ""
    plugin_module, sep, attribute = plugin.partition(":") if isinstance(plugin, str) else ("", "", "")
    if not sep or not _MODULE_RE.match(plugin_module) or not _ATTRIBUTE_RE.match(attribute):
        errors["server"] = f'plugin must be "module:Attribute", got {plugin!r}'
        return "", ""
    return module, cast(str, plugin)  # partition() above: a string


def _parse_app(app: Any, errors: dict[str, str]) -> str | None:
    if app is None:
        return None
    entry = app.get("entry") if isinstance(app, Mapping) else None
    if not isinstance(entry, str) or not entry:
        errors["app"] = 'must be an object {"entry": "dist/index.js"}'
        return None
    if not is_safe_relative_path(entry):
        errors["app"] = f"entry must be a relative path inside app/, got {entry!r}"
        return None
    # Only app/dist is served (/api/v3/packages/<name>/app/<path>).
    if not entry.startswith(f"{APP_DIST_DIR}/") or entry == f"{APP_DIST_DIR}/":
        errors["app"] = f"entry must be inside app/{APP_DIST_DIR}/, got {entry!r}"
        return None
    return entry


def is_safe_relative_path(value: str) -> bool:
    """A forward-slash relative path that cannot leave its folder."""

    if not value or "\\" in value or ":" in value or "\x00" in value:
        return False
    path = PurePosixPath(value)
    return not path.is_absolute() and ".." not in path.parts
