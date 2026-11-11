"""
------------------------------------------------------------------------
File : info.py
Description: What the PackageManager tells about a package: its status
             (active, disabled, failed, or missing for an object whose
             package is gone), PackageInfo (manifest data, dependents and
             the contributions it registered, as served by
             /api/v3/packages) and PackageIndex, the packages known to the
             manager (found on disk, their plugin factories, the last
             error of each), shared by the facade and its collaborators.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from soup.core.packages.discovery import PackageSource
from soup.core.packages.loader import PluginFactory

STATUS_ACTIVE = "active"
STATUS_DISABLED = "disabled"
STATUS_FAILED = "failed"
STATUS_MISSING = "missing"


@dataclass(frozen=True)
class PackageInfo:
    name: str
    status: str
    version: str = ""
    label: str = ""
    description: str = ""
    author: str = ""
    origin: str = ""
    error: str | None = None
    requires: tuple[str, ...] = ()
    databases: tuple[str, ...] = ("memgraph",)
    requires_tools: tuple[str, ...] = ()
    provides_tools: tuple[str, ...] = ()
    extension_points: tuple[str, ...] = ()
    dependents: tuple[str, ...] = ()
    app_entry: str | None = None
    # Contribution type -> keys this package registered (empty when not active).
    contributions: Mapping[str, tuple[str, ...]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "databases": list(self.databases),
            "name": self.name,
            "status": self.status,
            "version": self.version,
            "label": self.label,
            "description": self.description,
            "author": self.author,
            "origin": self.origin,
            "error": self.error,
            "requires": list(self.requires),
            "requires_tools": list(self.requires_tools),
            "provides_tools": list(self.provides_tools),
            "extension_points": list(self.extension_points),
            "dependents": list(self.dependents),
            "app_entry": self.app_entry,
            "contributions": {kind: list(keys) for kind, keys in self.contributions.items()},
        }


@dataclass
class PackageIndex:
    """The packages the manager knows: on disk, their plugin factories, the last error of each."""

    sources: dict[str, PackageSource] = field(default_factory=dict)
    factories: dict[str, PluginFactory] = field(default_factory=dict)
    errors: dict[str, str] = field(default_factory=dict)

    def forget(self, name: str) -> None:
        self.sources.pop(name, None)
        self.factories.pop(name, None)
        self.errors.pop(name, None)
