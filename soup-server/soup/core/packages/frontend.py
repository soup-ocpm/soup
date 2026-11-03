"""
------------------------------------------------------------------------
File : frontend.py
Description: PackageFrontend - the app/ part of the packages as the
             browser sees it: the frontend manifest (every active
             package with an app part, each after the packages it
             requires, so the host imports the dependencies first) and
             the static files of app/dist. A requested path is accepted
             only if it is a safe relative path that, once resolved
             (symbolic links included), stays inside the package's
             app/dist; anything else is a 404, like a missing file, so
             nothing outside dist can be probed. Disabled and missing
             packages serve nothing. The ETag of each file is its package
             version, size and modification time in nanoseconds (one
             os.stat, the content is never read): a new version or a
             rebuilt bundle with the same version both invalidate the
             browser's copy, and every file has its own.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from pathlib import Path

from soup.core.contracts import NotFoundError, ValidationError
from soup.core.packages.manager import STATUS_ACTIVE, PackageManager
from soup.core.packages.manifest import APP_DIR, APP_DIST_DIR, is_safe_relative_path, validate_package_name

# Explicit types for what a bundle contains: mimetypes reads the Windows
# registry, where ".js" is often "text/plain" (refused for modules).
_MIME_TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".map": "application/json",
    ".html": "text/html",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
    ".txt": "text/plain",
}
_DEFAULT_MIME = "application/octet-stream"
_DIST_PREFIX = f"{APP_DIST_DIR}/"


@dataclass(frozen=True)
class FrontendModule:
    """One package in the frontend manifest. `entry` is relative to app/dist."""

    name: str
    version: str
    entry: str
    requires: tuple[str, ...]


@dataclass(frozen=True)
class StaticFile:
    path: Path
    mime: str
    etag: str


def file_etag(package: str, version: str, path: Path) -> str:
    """The ETag of a static file: package, version, size and modification time (ns) of the file."""

    stat = path.stat()
    return f"{package}-{version}-{stat.st_size}-{stat.st_mtime_ns}"


def mime_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return _MIME_TYPES.get(suffix) or mimetypes.guess_type(filename)[0] or _DEFAULT_MIME


class PackageFrontend:
    def __init__(self, packages: PackageManager):
        self._packages = packages

    def entry(self, package: str) -> str | None:
        """The bundle of an active package, relative to app/dist; None without an app part."""

        if not package or self._packages.package_status(package) != STATUS_ACTIVE:
            return None
        source = self._packages.source(package)
        if source is None or not source.manifest.app_entry:
            return None
        return source.manifest.app_entry[len(_DIST_PREFIX):]

    def manifest(self) -> list[FrontendModule]:
        modules = []
        for name in self._packages.active_in_load_order():
            entry = self.entry(name)
            source = self._packages.source(name)
            if entry is None or source is None:
                continue
            manifest = source.manifest
            modules.append(FrontendModule(manifest.name, manifest.version, entry, tuple(manifest.requires)))
        return modules

    def app_file(self, package: str, path: str) -> StaticFile:
        """:raises NotFoundError: unknown/inactive package, no app part, unsafe or missing path"""

        try:
            validate_package_name(package)
        except ValidationError:
            raise NotFoundError(f"Package '{package}' not found") from None
        source = self._packages.source(package)
        if source is None or self.entry(package) is None:
            raise NotFoundError(f"Package '{package}' has no active app part")
        if not isinstance(path, str) or not is_safe_relative_path(path):
            raise NotFoundError(f"File '{path}' not found in package '{package}'")

        dist = (source.path / APP_DIR / APP_DIST_DIR).resolve()
        target = (dist / path).resolve()
        if not target.is_relative_to(dist) or not target.is_file():
            raise NotFoundError(f"File '{path}' not found in package '{package}'")
        return StaticFile(target, mime_type(target.name), file_etag(package, source.manifest.version, target))
