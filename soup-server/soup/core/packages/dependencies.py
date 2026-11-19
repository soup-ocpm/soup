"""Package requirements and approval-controlled installation in the shared Python process."""

from __future__ import annotations

import importlib
import importlib.metadata as importlib_metadata
import json
import logging
import os
import re
import subprocess
import sys
import sysconfig
import tempfile
import threading
import uuid
from collections.abc import Callable, Iterable
from pathlib import Path

from packaging.requirements import InvalidRequirement, Requirement
from packaging.utils import canonicalize_name

from soup.core.contracts import ConflictError, ValidationError
from soup.core.packages.manifest import PackageManifest, load_manifest

VersionLookup = Callable[[str], str | None]
_LOGGER = logging.getLogger("soup.packages.dependencies")
_INSTALL_LOCK = threading.RLock()
_DEPENDENCY_PATHS: set[str] = set()


def read_requirements(path: Path) -> tuple[str, ...]:
    """Accept portable PEP 508 lines, not pip options, nested files or arbitrary URLs."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise ValidationError(f"Cannot read {path.name}: {exc}") from exc
    specs = []
    for number, line in enumerate(lines, 1):
        spec = line.split(" #", 1)[0].strip()
        if not spec or spec.startswith("#"):
            continue
        try:
            requirement = Requirement(spec)
            if requirement.url:
                raise ValueError("direct URLs are not supported")
        except (InvalidRequirement, ValueError) as exc:
            raise ValidationError(f"{path.name}:{number}: expected a PEP 508 requirement: {exc}") from exc
        specs.append(spec)
    return tuple(dict.fromkeys(specs))


def installed_version(distribution: str) -> str | None:
    try:
        return importlib_metadata.version(distribution)
    except importlib_metadata.PackageNotFoundError:
        return None


def _requirements(manifest: PackageManifest) -> list[Requirement]:
    requirements = [Requirement(spec) for spec in manifest.python_dependencies]
    expanded = []
    seen = set()
    while requirements:
        requirement = requirements.pop(0)
        if str(requirement) in seen or (requirement.marker and not requirement.marker.evaluate()):
            continue
        seen.add(str(requirement))
        expanded.append(requirement)
        if requirement.extras and installed_version(requirement.name) is not None:
            for spec in importlib_metadata.requires(requirement.name) or []:
                dependency = Requirement(spec)
                if dependency.marker is None or any(
                    dependency.marker.evaluate({"extra": extra}) for extra in requirement.extras
                ):
                    dependency.marker = None
                    requirements.append(dependency)
    return expanded


def python_dependency_problems(manifest: PackageManifest, lookup: VersionLookup = installed_version) -> list[str]:
    """One message per unsatisfied requirement; [] when all are satisfied."""
    problems = []
    for requirement in _requirements(manifest):
        spec = str(requirement)
        version = lookup(requirement.name)
        if version is None:
            problems.append(f"'{spec}' (not installed)")
        elif requirement.specifier and not requirement.specifier.contains(version, prereleases=True):
            problems.append(f"'{spec}' (installed: {version})")
    return problems


def dependency_directory(root: Path) -> Path:
    return root / f"{sys.implementation.cache_tag}-{sysconfig.get_platform()}"


def activate_dependencies(root: Path) -> None:
    """Only committed directories enter sys.path; never execute third-party .pth files."""
    root = dependency_directory(root.resolve())
    if root.is_dir():
        for directory in sorted(root.glob("env-*")):
            if directory.is_dir() and str(directory) not in sys.path:
                sys.path.append(str(directory))
                _DEPENDENCY_PATHS.add(str(directory))
                # Package workers use the same interpreter in child processes (e.g. PromG).
                paths = [path for path in os.environ.get("PYTHONPATH", "").split(os.pathsep) if path]
                os.environ["PYTHONPATH"] = os.pathsep.join(dict.fromkeys([*paths, str(directory)]))
    importlib.invalidate_caches()


def _run_pip(arguments: list[str]) -> None:
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "--isolated", "--disable-pip-version-check", *arguments],
            capture_output=True, text=True, timeout=600, check=False,
            env={**os.environ, "PYTHONPATH": os.pathsep.join(
                [*sorted(path for path in _DEPENDENCY_PATHS if path in sys.path), os.environ.get("PYTHONPATH", "")]
            )},
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        _LOGGER.exception("Python dependency installation could not complete")
        raise ValidationError(
            "Python dependency installation timed out or pip could not start; check backend logs"
        ) from exc
    if result.returncode:
        diagnostic = re.sub(r"(https?://)[^/\s@]+@", r"\1[redacted]@", result.stderr[-8000:])
        _LOGGER.error("pip failed (exit %s): %s", result.returncode, diagnostic)
        reason = next((line for line in reversed(diagnostic.splitlines()) if line.startswith("ERROR:")), "")
        raise ValidationError(
            f"Python dependency resolution/installation failed. {reason[:500]} "
            "Check backend logs for conflicts, network access or unavailable wheels; the package was not activated."
        )


def ensure_dependencies(
    manifest: PackageManifest, root: Path, active: Iterable[PackageManifest], *, approved: bool = False,
    lookup: VersionLookup = installed_version, allow_source: bool = False,
) -> None:
    """Install missing libraries atomically; never replace a distribution already in the shared process."""
    with _INSTALL_LOCK:
        activate_dependencies(root)
        requirements = _requirements(manifest)
        if any(req.url for req in requirements):
            raise ValidationError(
                "Direct Python dependency URLs are not supported; use named distribution requirements"
            )
        incompatible = []
        for requirement in requirements:
            version = lookup(requirement.name)
            if version is not None and not requirement.specifier.contains(version, prereleases=True):
                incompatible.append(f"{requirement} (installed: {version})")
        if incompatible:
            raise ConflictError(
                f"Package '{manifest.name}' conflicts with installed shared/core dependencies: "
                + ", ".join(incompatible) + ". Rebuild a compatible server environment; no versions were changed."
            )
        missing = [str(req) for req in requirements if lookup(req.name) is None]
        if not missing:
            return
        if not approved:
            raise ConflictError(
                f"Package '{manifest.name}' needs Python dependencies: {', '.join(missing)}. "
                "Approve installation on the Packages page, or include this package in "
                "SOUP_APPROVE_PYTHON_DEPENDENCIES for startup "
                "(startup also requires SOUP_ALLOW_PACKAGE_INSTALL=true).",
                details={"dependency_approval_required": True, "requirements": missing},
            )
        try:
            _install_missing(manifest, root, active, lookup, allow_source=allow_source)
        except (OSError, ValueError, KeyError) as exc:
            _LOGGER.exception("Could not stage Python dependencies for package '%s'", manifest.name)
            raise ValidationError(
                "Could not stage or verify Python dependencies. Check package-volume permissions, free disk space "
                "and backend logs; the package was not activated."
            ) from exc


def _write_constraints(
    constraints: Path, package_name: str, active: Iterable[PackageManifest],
) -> dict[str, str]:
    # Freeze ALL installed distributions, including transitive/core dependencies.
    pins = {}
    for distribution in importlib_metadata.distributions():
        name = distribution.metadata["Name"]
        if name:
            pins.setdefault(canonicalize_name(name), distribution.version)
    constrained = [f"{name}=={version}" for name, version in sorted(pins.items())]
    for package in active:
        if package.name == package_name:
            continue
        for spec in package.python_dependencies:
            requirement = Requirement(spec)
            if requirement.url:
                raise ValidationError("Direct Python dependency URLs are not supported")
            # Constraints restrict versions; they must never request installation
            # of another enabled package's unapproved missing dependencies.
            requirement.extras.clear()
            constrained.append(str(requirement))
    constraints.write_text("\n".join(constrained), encoding="utf-8")
    return pins


def _install_missing(
    manifest: PackageManifest, root: Path, active: Iterable[PackageManifest], lookup: VersionLookup,
    *, allow_source: bool = False,
) -> None:
    root = dependency_directory(root)
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="_pending-", dir=root) as temporary:
        staging = Path(temporary)
        constraints = staging / "constraints.txt"
        pins = _write_constraints(constraints, manifest.name, active)
        report = staging / "report.json"
        specs = list(manifest.python_dependencies)
        distribution_policy = "--prefer-binary" if allow_source else "--only-binary=:all:"
        _run_pip(["install", "--dry-run", distribution_policy, "--report", str(report),
                  "--constraint", str(constraints), *specs])
        plan = json.loads(report.read_text(encoding="utf-8"))["install"]
        additions = []
        for item in plan:
            metadata = item["metadata"]
            name, version = metadata["name"], metadata["version"]
            if canonicalize_name(name) in pins:
                raise ConflictError(f"pip attempted to change installed dependency '{name}'; installation refused")
            additions.append(f"{name}=={version}")
        if additions:
            target = staging / "site-packages"
            _run_pip(["install", distribution_policy, "--no-deps", "--target", str(target), *additions])
            installed = {canonicalize_name(dist.metadata["Name"]): dist.version
                         for dist in importlib_metadata.distributions(path=[str(target)])}
            for spec in additions:
                requirement = Requirement(spec)
                version = installed.get(canonicalize_name(requirement.name))
                if version is None or not requirement.specifier.contains(version, prereleases=True):
                    raise ValidationError(
                        f"pip did not install the resolved dependency '{spec}'; nothing was activated"
                    )
            problems = python_dependency_problems(
                manifest, lambda name: installed.get(canonicalize_name(name)) or lookup(name)
            )
            if problems:
                raise ValidationError("Staged dependencies are incomplete: " + "; ".join(problems))
            target.rename(root / f"env-{uuid.uuid4().hex}")
        activate_dependencies(root.parent)
        problems = python_dependency_problems(manifest, lookup)
        if problems:
            raise ValidationError("Dependency installation did not satisfy requirements: " + "; ".join(problems))


def install_bundled(packages: Path, target: Path) -> None:
    """Install every bundled package's declared libraries while building the image."""
    manifests = [load_manifest(path) for path in sorted(packages.iterdir())
                 if path.is_dir() and not path.name.startswith(("_", "."))
                 and (path / "soup-package.json").is_file()]
    for manifest in manifests:
        ensure_dependencies(manifest, target, manifests, approved=True, allow_source=True)
