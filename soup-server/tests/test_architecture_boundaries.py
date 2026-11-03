"""
------------------------------------------------------------------------
File : test_architecture_boundaries.py
Description: Static (AST-based) checks of the dependency rules: soup/core
             never imports from soup/api; the packages in soup-packages/
             never import Flask, reach the host only through
             soup.core.contracts and another package only through its
             api.py, after declaring it in `requires`; soup/core/contracts
             never imports pandas; soup/api is the only package that
             imports Flask; and nothing under soup/ imports the Memgraph
             driver or the Docker SDK any more (they belong to the
             tool_memgraph and tool_storage packages, commit 3); text
             and csv_table use the standard library and the "storage"
             tool only (no pandas, no Memgraph driver, commit 7); the
             whole of soup/core imports none of pandas, neo4j, docker and
             Flask, and the event log and the EKG are gone from it to the
             ekg, csv_ekg and causal_df packages (commit 8). Since
             commit 11 the legacy backend (Controllers, Services, Utils,
             Models, Shared) is gone and nothing imports it; a package
             only names the tools it declares (requires_tools or
             provides_tools) and only imports third-party libraries it
             lists in python_dependencies; on the frontend, soup-app
             reaches soup-packages only through the SDK (@soup/sdk) and
             no package bundle imports host code. The tests kept next to
             a package (soup-packages/<name>/tests) are not part of it
             (not packed) and are not checked.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

SOUP_ROOT = Path(__file__).resolve().parent.parent / "soup"
PACKAGES_ROOT = Path(__file__).resolve().parent.parent.parent / "soup-packages"


def _imported_modules(file_path: Path) -> set[str]:
    tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def _is_flask_module(name: str) -> bool:
    return name == "flask" or name.startswith("flask.") or name.startswith("flask_")


def _is_pandas_module(name: str) -> bool:
    return name == "pandas" or name.startswith("pandas.")


def _py_files(directory: Path) -> list[Path]:
    return sorted(directory.rglob("*.py")) if directory.exists() else []


def _package_files(package_dir: Path) -> list[Path]:
    """The Python files of a package, without its tests/ folder."""

    return [path for path in _py_files(package_dir) if "tests" not in path.relative_to(package_dir).parts]


def test_core_never_imports_from_api_or_packages():
    violations = []
    for file_path in _py_files(SOUP_ROOT / "core"):
        for module in _imported_modules(file_path):
            if module.startswith("soup.api") or module.startswith("soup_pkg_"):
                violations.append(f"{file_path.relative_to(SOUP_ROOT)} imports {module}")
    assert violations == []


def test_startup_imports_neither_flask_nor_the_rest_of_the_host():
    # soup.startup runs before Flask is imported (app.py, tests/e2e_server.py):
    # it must work in an environment where Flask, pandas or the engine are broken.
    forbidden = ("flask", "werkzeug", "pandas", "numpy")
    violations = []
    files = _py_files(SOUP_ROOT / "startup")
    assert files
    for file_path in files:
        for module in _imported_modules(file_path):
            if module.split(".")[0] in forbidden or module.startswith(("soup.api", "soup.core", "soup_pkg_")):
                violations.append(f"{file_path.relative_to(SOUP_ROOT)} imports {module}")
    assert violations == []


def test_soup_plugins_is_gone():
    # The built-in plugins moved to soup-packages/ (commit 2).
    assert not (SOUP_ROOT / "plugins").exists()


def test_contracts_never_import_pandas():
    violations = []
    for file_path in _py_files(SOUP_ROOT / "core" / "contracts"):
        for module in _imported_modules(file_path):
            if _is_pandas_module(module):
                violations.append(f"{file_path.relative_to(SOUP_ROOT)} imports {module}")
    assert violations == []


def _package_dirs() -> list[Path]:
    return sorted(path.parent for path in PACKAGES_ROOT.glob("*/soup-package.json"))


def test_bundled_packages_exist():
    assert {path.name for path in _package_dirs()} >= {
        "ekg", "csv_ekg", "causal_df", "ekg_views", "ekg_analysis", "ekg_class_graph", "tool_memgraph", "tool_storage",
        "soup_base", "text", "csv_table", "ocel",
    }
    assert not (PACKAGES_ROOT / "csv_reader").exists()


def test_soup_infrastructure_is_gone():
    # The adapters moved to soup-packages/tool_memgraph and tool_storage (commit 3).
    assert not (SOUP_ROOT / "infrastructure").exists()


def test_host_never_imports_the_database_driver_or_docker():
    violations = []
    for file_path in _py_files(SOUP_ROOT):
        for module in _imported_modules(file_path):
            if module.split(".")[0] in ("neo4j", "docker"):
                violations.append(f"{file_path.relative_to(SOUP_ROOT)} imports {module}")
    assert violations == []


def test_tool_packages_have_no_app_part():
    for name in ("tool_memgraph", "tool_storage"):
        manifest = json.loads((PACKAGES_ROOT / name / "soup-package.json").read_text(encoding="utf-8"))
        assert "app" not in manifest
        assert not (PACKAGES_ROOT / name / "app").exists()


STDLIB_PACKAGES = ("text", "csv_table")


def test_text_and_csv_table_import_neither_pandas_nor_the_database_driver():
    violations = []
    for name in STDLIB_PACKAGES:
        for file_path in _package_files(PACKAGES_ROOT / name):
            for module in _imported_modules(file_path):
                if module.split(".")[0] in ("pandas", "neo4j", "docker") or module.startswith("soup_pkg_tool_memgraph"):
                    violations.append(f"{file_path.relative_to(PACKAGES_ROOT)} imports {module}")
    assert violations == []


def test_text_and_csv_table_only_need_the_storage_tool():
    for name in STDLIB_PACKAGES:
        manifest = json.loads((PACKAGES_ROOT / name / "soup-package.json").read_text(encoding="utf-8"))
        assert manifest["requires"] == ["soup_base", "tool_storage"]
        assert manifest["requires_tools"] == ["storage"]
        assert manifest["python_dependencies"] == []


# The "come tabelle" side of ocel (format, storage, tables importer,
# visualizers, exporter): standard library and the storage tool only; only
# graph.py reaches the ekg package.
OCEL_TABLE_MODULES = ("model.py", "store.py", "tables.py")


def test_the_ocel_tables_import_neither_pandas_nor_ekg_nor_the_database():
    violations = []
    for name in OCEL_TABLE_MODULES:
        file_path = PACKAGES_ROOT / "ocel" / "server" / name
        for module in _imported_modules(file_path):
            if module.split(".")[0] in ("pandas", "numpy", "neo4j", "docker") or module.startswith("soup_pkg_"):
                violations.append(f"ocel/server/{name} imports {module}")
    assert violations == []


def test_packages_never_import_flask():
    violations = []
    for package_dir in _package_dirs():
        for file_path in _package_files(package_dir):
            for module in _imported_modules(file_path):
                if _is_flask_module(module):
                    violations.append(f"{file_path.relative_to(PACKAGES_ROOT)} imports {module}")
    assert violations == []


def test_packages_reach_the_host_only_through_contracts_and_others_only_through_api():
    violations = []
    for package_dir in _package_dirs():
        manifest = json.loads((package_dir / "soup-package.json").read_text(encoding="utf-8"))
        allowed_packages = {f"soup_pkg_{name}.api" for name in manifest.get("requires", [])}
        for file_path in _package_files(package_dir):
            relative = file_path.relative_to(PACKAGES_ROOT)
            for module in _imported_modules(file_path):
                if module == "soup" or (module.startswith("soup.") and not module.startswith("soup.core.contracts")):
                    violations.append(f"{relative} imports host module {module}")
                if module.startswith("soup_pkg_") and module not in allowed_packages:
                    violations.append(f"{relative} imports {module} (not api.py of a package in requires)")
    assert violations == []


# The mediator: contracts, package wiring and routing services. None of it
# may depend on a data library, a database driver, Docker or Flask.
MEDIATOR_PATHS = (
    "core/contracts",
    "core/packages",
    "core/settings.py",
    "core/registry.py",
    "core/plugin_context.py",
    "core/plugin_manager.py",
    "core/events.py",
    "core/event_bus.py",
    "core/extension_points.py",
    "core/toolbox.py",
    "core/field_validation.py",
    "core/services/core_tools.py",
    "core/services/import_router.py",
    "core/services/operation_router.py",
    "core/services/visualizer_router.py",
    "core/services/export_router.py",
    "core/services/workspace_service.py",
    "core/services/orphaned_data.py",
)

_FORBIDDEN_IN_MEDIATOR = ("pandas", "neo4j", "docker", "flask", "werkzeug")


def _mediator_files() -> list[Path]:
    files: list[Path] = []
    for relative in MEDIATOR_PATHS:
        path = SOUP_ROOT / relative
        files.extend(_py_files(path) if path.is_dir() else [path])
    return files


def test_mediator_imports_no_data_library_database_docker_or_flask():
    violations = []
    for file_path in _mediator_files():
        assert file_path.exists(), file_path
        for module in _imported_modules(file_path):
            root = module.split(".")[0]
            if root in _FORBIDDEN_IN_MEDIATOR or root.startswith("flask_"):
                violations.append(f"{file_path.relative_to(SOUP_ROOT)} imports {module}")
    assert violations == []


def test_only_soup_api_imports_flask():
    violations = []
    for file_path in _py_files(SOUP_ROOT):
        relative = file_path.relative_to(SOUP_ROOT)
        if relative.parts[0] == "api":
            continue
        for module in _imported_modules(file_path):
            if _is_flask_module(module):
                violations.append(f"{relative} imports {module}")
    assert violations == []


def test_the_whole_core_imports_no_data_library_database_docker_or_flask():
    violations = []
    for file_path in _py_files(SOUP_ROOT / "core"):
        for module in _imported_modules(file_path):
            root = module.split(".")[0]
            if root in _FORBIDDEN_IN_MEDIATOR or root.startswith("flask_"):
                violations.append(f"{file_path.relative_to(SOUP_ROOT)} imports {module}")
    assert violations == []


# What commit 8 moved to the ekg, csv_ekg and causal_df packages.
MOVED_FROM_THE_CORE = (
    "core/event_log.py",
    "core/dataset_repository.py",
    "core/tables.py",
    "core/process_timer.py",
    "core/ekg",
    "core/services/event_log_handler.py",
    "core/services/ekg_service.py",
    "core/services/import_service.py",
    "core/services/legacy_tools.py",
    "core/contracts/event_log.py",
    "core/contracts/input.py",
    "core/contracts/build.py",
    "core/contracts/tables.py",
)


def test_the_event_log_and_the_ekg_are_gone_from_the_core():
    assert [path for path in MOVED_FROM_THE_CORE if (SOUP_ROOT / path).exists()] == []
    # Nor does the core mention them: no Cypher of the EKG, no event-log names
    # (but in the version history of the contracts, which records the removal).
    violations = []
    for file_path in _py_files(SOUP_ROOT / "core"):
        if file_path == SOUP_ROOT / "core" / "contracts" / "version.py":
            continue
        text = file_path.read_text(encoding="utf-8")
        for word in ("EventLog", "ColumnMapping", "EkgBuildStep", "LOAD CSV", ":CORR", "add_build_step", "add_input_reader"):
            if word in text:
                violations.append(f"{file_path.relative_to(SOUP_ROOT)} mentions {word}")
    assert violations == []


def test_ekg_packages_declare_what_they_use():
    manifests = {
        name: json.loads((PACKAGES_ROOT / name / "soup-package.json").read_text(encoding="utf-8"))
        for name in ("ekg", "csv_ekg", "causal_df")
    }
    assert manifests["ekg"]["requires"] == ["tool_memgraph", "tool_storage"]
    assert set(manifests["ekg"]["requires_tools"]) >= {"memgraph", "storage"}
    assert manifests["ekg"]["extension_points"] == ["ekg.build_steps", "ekg.state_providers"]
    assert "app" not in manifests["ekg"]
    assert manifests["csv_ekg"]["requires"] == ["ekg", "soup_base", "csv_table"]
    assert manifests["causal_df"]["requires"] == ["ekg"]


# ---------------------------------------------------------------------- #
# Commit 11: no legacy backend, tools and libraries declared, frontend
# ---------------------------------------------------------------------- #

SERVER_ROOT = SOUP_ROOT.parent
LEGACY_BACKEND = ("Controllers", "Services", "Utils", "Models", "Shared")


def test_the_legacy_backend_is_gone_and_nothing_imports_it():
    assert [name for name in LEGACY_BACKEND if (SERVER_ROOT / name).exists()] == []
    files = [*_py_files(SOUP_ROOT), *_py_files(SERVER_ROOT / "tests"), SERVER_ROOT / "app.py"]
    files += [path for package_dir in _package_dirs() for path in _py_files(package_dir)]
    violations = [
        f"{path} imports {module}"
        for path in files
        for module in _imported_modules(path)
        if module.split(".")[0] in LEGACY_BACKEND
    ]
    assert violations == []


def _manifest(package_dir: Path) -> dict:
    return json.loads((package_dir / "soup-package.json").read_text(encoding="utf-8"))


def _known_tools() -> set[str]:
    return {tool for package_dir in _package_dirs() for tool in _manifest(package_dir).get("provides_tools", [])}


# Tool-name constants packages import instead of writing the name.
_TOOL_CONSTANTS = {"CATALOG_TOOL": "catalog", "PREFERENCES_TOOL": "preferences", "MEMGRAPH_TOOL": "memgraph"}


def _tool_names_used(file_path: Path, known: set[str]) -> set[str]:
    """Every tool name a file mentions: a string equal to a tool name, or a tool-name constant."""

    tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    used: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value in known:
            used.add(node.value)
        elif isinstance(node, ast.Name) and node.id in _TOOL_CONSTANTS:
            used.add(_TOOL_CONSTANTS[node.id])
        elif isinstance(node, ast.alias) and node.name in _TOOL_CONSTANTS:
            used.add(_TOOL_CONSTANTS[node.name])
    return used


def test_no_package_names_a_tool_it_does_not_declare():
    known = _known_tools()
    assert known >= {"memgraph", "storage", "catalog", "preferences"}
    violations = []
    for package_dir in _package_dirs():
        manifest = _manifest(package_dir)
        declared = set(manifest.get("requires_tools", [])) | set(manifest.get("provides_tools", []))
        for file_path in _package_files(package_dir):
            for tool in sorted(_tool_names_used(file_path, known) - declared):
                violations.append(f"{file_path.relative_to(PACKAGES_ROOT)} uses tool '{tool}' (not in requires_tools)")
    assert violations == []


def _third_party(module: str) -> bool:
    top = module.split(".")[0]
    return not (top in sys.stdlib_module_names or top == "soup" or top.startswith("soup_pkg_") or top == "__future__")


def _absolute_imports(file_path: Path) -> set[str]:
    """The modules a file imports by absolute name (relative imports are the package's own)."""

    tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            modules.add(node.module)
    return modules


def test_packages_declare_the_libraries_they_import():
    violations = []
    for package_dir in _package_dirs():
        declared = {
            canonicalize_name(Requirement(spec).name) for spec in _manifest(package_dir).get("python_dependencies", [])
        }
        for file_path in _package_files(package_dir):
            for module in sorted(_absolute_imports(file_path)):
                if _third_party(module) and canonicalize_name(module.split(".")[0]) not in declared:
                    violations.append(f"{file_path.relative_to(PACKAGES_ROOT)} imports {module} (not in python_dependencies)")
    assert violations == []


APP_ROOT = PACKAGES_ROOT.parent / "soup-app"
_TS_IMPORT = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]""")


def _ts_files(directory: Path) -> list[Path]:
    return sorted(path for path in directory.rglob("*.ts") if "node_modules" not in path.parts and "dist" not in path.parts)


def _ts_imports(file_path: Path) -> list[str]:
    return _TS_IMPORT.findall(file_path.read_text(encoding="utf-8"))


def _resolves_inside(file_path: Path, specifier: str, root: Path) -> bool:
    if not specifier.startswith("."):
        return True
    return (file_path.parent / specifier).resolve().is_relative_to(root.resolve())


def test_the_host_app_reaches_the_packages_only_through_the_sdk():
    violations = []
    for file_path in _ts_files(APP_ROOT / "src"):
        for specifier in _ts_imports(file_path):
            if "soup-packages" in specifier or not _resolves_inside(file_path, specifier, APP_ROOT):
                violations.append(f"{file_path.relative_to(APP_ROOT)} imports {specifier}")
            if specifier.startswith("@soup/") and specifier != "@soup/sdk":
                violations.append(f"{file_path.relative_to(APP_ROOT)} imports {specifier} (only @soup/sdk)")
    assert violations == []


def test_no_package_bundle_imports_host_code():
    violations = []
    for package_dir in _package_dirs():
        for file_path in _ts_files(package_dir / "app"):
            for specifier in _ts_imports(file_path):
                if "soup-app" in specifier or specifier.startswith("src/") or not _resolves_inside(file_path, specifier, package_dir):
                    violations.append(f"{file_path.relative_to(PACKAGES_ROOT)} imports {specifier}")
    assert violations == []


def test_the_frontend_never_calls_api_v2():
    files = [*_ts_files(APP_ROOT / "src"), *_ts_files(APP_ROOT / "e2e"), APP_ROOT / "nginx.conf"]
    files += sorted((APP_ROOT / "src").rglob("*.html"))
    hits = [str(path.relative_to(APP_ROOT)) for path in files if "api/v2" in path.read_text(encoding="utf-8")]
    assert hits == []


def test_there_is_one_parsed_cache_and_it_is_soup_base_s():
    # DRY (commit 13): text, csv_table and ocel use the ParsedCache of
    # soup_pkg_soup_base.api instead of a copy each.
    definitions = []
    for package_dir in _package_dirs():
        for file_path in _package_files(package_dir):
            tree = ast.parse(file_path.read_text(encoding="utf-8"), filename=str(file_path))
            if any(isinstance(node, ast.ClassDef) and node.name == "ParsedCache" for node in ast.walk(tree)):
                definitions.append(file_path.relative_to(PACKAGES_ROOT).as_posix())
    assert definitions == ["soup_base/server/cache.py"]


def test_the_dom_helper_of_the_package_bundles_lives_in_the_sdk():
    # DRY (commit 13): h() and errorMessage() come from @soup/sdk, not from a copy per package.
    copies = sorted(
        path.relative_to(PACKAGES_ROOT).as_posix()
        for path in PACKAGES_ROOT.glob("*/app/src/**/*.ts")
        if re.search(r"^export function (h|errorMessage)\b", path.read_text(encoding="utf-8"), re.M)
    )
    assert copies == []
    assert re.search(r"^export function h<", (PACKAGES_ROOT / "sdk" / "src" / "dom.ts").read_text(encoding="utf-8"), re.M)
