"""
------------------------------------------------------------------------
File : settings.py
Description: Engine settings, read from the environment with explicit
             defaults. Only what the host
             itself needs: Memgraph and file storage are configured by
             the packages providing those tools (tool_memgraph reads
             MEMGRAPH_HOST/MEMGRAPH_PORT, tool_storage reads
             SOUP_STORAGE_KIND, SOUP_CONTAINER_NAME and
             SOUP_LOCAL_STORAGE_ROOT). SOUP_MAX_UPLOAD_MB caps the
             request body of /api/v3; SOUP_CORS_ORIGINS lists the
             origins of the SOUP app allowed to call it from a browser.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

DEFAULT_STRICT = False

# soup-server/ and the repository root, from this file's location
# (soup-server/soup/core/settings.py). The Docker image keeps the same
# layout (/srv/soup-server, /srv/soup-packages), so the defaults hold there.
_SERVER_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = _SERVER_ROOT.parent

# The packages shipped with SOUP (tool_memgraph, tool_storage, ekg,
# csv_ekg, causal_df, soup_base, text, csv_table, ...). Every
# package found is active unless disabled at runtime (persisted state)
# or SOUP_PACKAGES lists the active ones explicitly.
DEFAULT_BUNDLED_PACKAGES_DIR = str(_REPO_ROOT / "soup-packages")
# Where install(zip) extracts packages; also holds the enabled/disabled
# state. Under instance/, which .gitignore already excludes.
DEFAULT_INSTALLED_PACKAGES_DIR = str(_SERVER_ROOT / "instance" / "packages")
# Installing a package runs its code with the server's privileges: off
# unless explicitly enabled (docker-compose turns it on for development).
DEFAULT_ALLOW_PACKAGE_INSTALL = False
# Largest request body accepted by /api/v3 (uploaded files, package zips).
DEFAULT_MAX_UPLOAD_MB = 200
# The origins of the SOUP app (the container and ng serve, on 4200): the
# only pages a browser lets call /api/v3 (CORS), and the only Origin a
# request that changes data may come from (soup/api/security.py).
DEFAULT_CORS_ORIGINS = ("http://localhost:4200", "http://127.0.0.1:4200")

_TRUE_VALUES = {"1", "true", "yes", "on"}


def _split_csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


def _split_paths(value: str) -> tuple[str, ...]:
    # os.pathsep: ":" on Linux/Docker, ";" on Windows, where ":" would
    # split "C:\..." apart.
    return tuple(item.strip() for item in value.split(os.pathsep) if item.strip())


def _positive_int(name: str, value: str | None, default: int) -> int:
    if value is None or not value.strip():
        return default
    try:
        number = int(value.strip())
    except ValueError:
        raise ValueError(f"{name} must be a positive integer, got {value!r}") from None
    if number <= 0:
        raise ValueError(f"{name} must be a positive integer, got {value!r}")
    return number


def _origins(value: str | None) -> tuple[str, ...]:
    """Comma-separated origins, without a trailing slash (the form of the Origin header)."""

    return tuple(origin.rstrip("/") for origin in _split_csv(value or ""))


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in _TRUE_VALUES


@dataclass(frozen=True)
class Settings:
    # None: every package found; a tuple: only those (SOUP_PACKAGES).
    packages: tuple[str, ...] | None = None
    packages_path: tuple[str, ...] = (DEFAULT_BUNDLED_PACKAGES_DIR, DEFAULT_INSTALLED_PACKAGES_DIR)
    installed_packages_dir: str = DEFAULT_INSTALLED_PACKAGES_DIR
    allow_package_install: bool = DEFAULT_ALLOW_PACKAGE_INSTALL
    strict: bool = DEFAULT_STRICT
    max_upload_mb: int = DEFAULT_MAX_UPLOAD_MB
    cors_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        """Build Settings from environment variables, with explicit defaults for each."""

        source = os.environ if env is None else env

        # SOUP_PACKAGES="" disables every package; absent means all of them.
        raw_packages = source.get("SOUP_PACKAGES")
        raw_origins = source.get("SOUP_CORS_ORIGINS")
        installed_dir = source.get("SOUP_INSTALLED_PACKAGES_DIR", DEFAULT_INSTALLED_PACKAGES_DIR)
        raw_path = source.get("SOUP_PACKAGES_PATH")
        packages_path = _split_paths(raw_path) if raw_path is not None else (DEFAULT_BUNDLED_PACKAGES_DIR,)
        # The installed packages must be found again at the next start.
        if installed_dir not in packages_path:
            packages_path = (*packages_path, installed_dir)

        return cls(
            packages=_split_csv(raw_packages) if raw_packages is not None else None,
            packages_path=packages_path,
            installed_packages_dir=installed_dir,
            allow_package_install=_as_bool(source.get("SOUP_ALLOW_PACKAGE_INSTALL"), DEFAULT_ALLOW_PACKAGE_INSTALL),
            strict=_as_bool(source.get("SOUP_STRICT"), DEFAULT_STRICT),
            max_upload_mb=_positive_int("SOUP_MAX_UPLOAD_MB", source.get("SOUP_MAX_UPLOAD_MB"), DEFAULT_MAX_UPLOAD_MB),
            # Absent or empty: the default origins (an empty list would lock the app out).
            cors_origins=_origins(raw_origins) or DEFAULT_CORS_ORIGINS,
        )
