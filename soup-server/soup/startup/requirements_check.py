"""
------------------------------------------------------------------------
File : requirements_check.py
Description: The check at startup of the local processes (app.py,
             tests/e2e_server.py): the installed versions of Flask,
             Werkzeug, pandas and numpy must match requirements.txt.
             With another environment (e.g. the Python of the system,
             with an older Flask) the server would start and then fail
             with errors like "'SoupRequest' object has no attribute
             '_max_content_length'"; here it stops at once with a message
             naming the Python in use, the versions found and the
             command that prepares soup-server/.venv. Skipped with
             SOUP_SKIP_REQUIREMENTS_CHECK=1. Imports neither Flask nor
             the rest of the host. The Docker image (wsgi.py) installs
             requirements.txt itself and does not run it.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import importlib.metadata
import os
import sys
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path

from packaging.requirements import InvalidRequirement, Requirement
from packaging.specifiers import SpecifierSet
from packaging.utils import canonicalize_name

# The libraries whose version changes the behaviour of the server.
CHECKED = ("Flask", "Werkzeug", "pandas", "numpy")
SKIP_VARIABLE = "SOUP_SKIP_REQUIREMENTS_CHECK"

VersionOf = Callable[[str], str]


@dataclass(frozen=True)
class Mismatch:
    """A library whose installed version (None: not installed) is not the required one."""

    name: str
    required: SpecifierSet
    found: str | None


def pinned(requirements: Path) -> dict[str, SpecifierSet]:
    """{canonical name: specifier} of a requirements file (comments, blank lines and options skipped)."""

    found: dict[str, SpecifierSet] = {}
    for raw in requirements.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        try:
            requirement = Requirement(line)
        except InvalidRequirement:
            continue
        found[canonicalize_name(requirement.name)] = requirement.specifier
    return found


def mismatches(requirements: Path, names: Iterable[str] = CHECKED,
               version_of: VersionOf | None = None) -> list[Mismatch]:
    """
    The libraries of `names` pinned in `requirements` and installed with
    another version, or missing. `version_of` (default: the installed
    version, importlib.metadata.version) raises PackageNotFoundError for a
    missing one.
    """

    version_of = version_of or importlib.metadata.version
    wanted = pinned(requirements)
    wrong: list[Mismatch] = []
    for name in names:
        specifier = wanted.get(canonicalize_name(name))
        if specifier is None:
            continue
        try:
            version: str | None = version_of(name)
        except importlib.metadata.PackageNotFoundError:
            version = None
        if version is None or not specifier.contains(version, prereleases=True):
            wrong.append(Mismatch(name, specifier, version))
    return wrong


def requirements_problem(requirements: Path, env: Mapping[str, str] = os.environ,
                         version_of: VersionOf | None = None,
                         python: str = sys.executable) -> str | None:
    """None when the versions match (or the check is skipped); otherwise the message to show."""

    if env.get(SKIP_VARIABLE, "").strip() == "1":
        return None
    wrong = mismatches(requirements, version_of=version_of)
    if not wrong:
        return None
    lines = [
        f"Requirements check failed: this Python does not have the libraries of {requirements.name}.",
        f"  Python in use: {python}",
    ]
    lines += [f"  {item.name}: found {item.found or 'not installed'}, required {item.required}" for item in wrong]
    lines += [
        "Prepare the environment of the project (soup-server/.venv) and run with its Python:",
        "  cd soup-app && npm run setup:server",
        "  (or, from soup-server: python scripts/setup_venv.py)",
        f"To start anyway: {SKIP_VARIABLE}=1",
    ]
    return "\n".join(lines)


def ensure_requirements(requirements: Path) -> None:
    """Stop the process (exit code 2) with the message of requirements_problem, if any."""

    problem = requirements_problem(requirements)
    if problem is not None:
        print(problem, file=sys.stderr, flush=True)
        raise SystemExit(2)
