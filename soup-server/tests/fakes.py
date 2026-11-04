"""
------------------------------------------------------------------------
File : fakes.py
Description: In-memory fakes used by every test instead of Memgraph and
             Docker: FakeDatabase (shaped like tool_memgraph's GraphDatabase
             port: a run(query) method) and InMemoryFileStorage
             (a FileStorage backend), the catalog and preferences tools
             (InMemoryCatalog, InMemoryPreferences, CoreToolsPackage),
             and the "memgraph" and "storage" tools of the tool_memgraph
             and tool_storage packages built on them
             (fake_memgraph_tool, fake_storage_tool, LegacyToolsPackage,
             fake_tool_engine, with the in-memory catalog too). The ekg
             packages require tool_memgraph and tool_storage themselves:
             ekg_engine loads the real ones, tool_storage on a throw-away
             folder (no Docker) and the memgraph tool on a FakeDatabase
             (use_database).
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from soup.core.contracts import (
    Catalog,
    ConflictError,
    FileStorage,
    NotFoundError,
    ObjectRef,
    PluginContext,
    Preferences,
    SoupPlugin,
)

# The memgraph tool's database: tool_memgraph's GraphDatabase, or any object
# with run(query) -> rows. The fakes do not import the package, so that
# importing tests.fakes loads no package module.
GraphDatabase = Any
Query = Any


class InMemoryFileStorage(FileStorage):
    """
    FileStorage fake backed by a plain dict - no filesystem/Docker I/O.
    Behaves like the real backends: "/" separates folders, list(prefix)
    returns the names directly under prefix and delete(path) removes a
    file or a whole folder.
    """

    def __init__(self) -> None:
        self._files: dict[str, bytes] = {}

    def read(self, path: str) -> bytes:
        if path not in self._files:
            raise FileNotFoundError(path)
        return self._files[path]

    def write(self, path: str, data: bytes) -> None:
        self._files[path] = bytes(data)

    def exists(self, path: str) -> bool:
        return path in self._files

    def delete(self, path: str) -> None:
        folder = path.rstrip("/") + "/"
        for key in [key for key in self._files if key == path or key.startswith(folder)]:
            del self._files[key]

    def list(self, prefix: str = "") -> list[str]:
        folder = prefix.strip("/")
        folder = folder + "/" if folder else ""
        return sorted({path[len(folder):].split("/")[0] for path in self._files if path.startswith(folder)})

    @property
    def paths(self) -> list[str]:
        """Every file stored, by full path (white-box checks)."""

        return sorted(self._files)


class FakeDatabase:
    """
    GraphDatabase fake that records every Query it receives (text and
    params, in order) and returns a configurable canned response per
    query text, falling back to a default response. The check of
    tool_memgraph for a lost graph finds a node, as in a database that
    holds the graph: a test of the lost graph calls set_empty().
    """

    ANY_NODE = "MATCH (n) RETURN 1 AS found LIMIT 1"

    def __init__(self) -> None:
        self.received_queries: list[Query] = []
        self._responses: dict[str, list[dict[str, Any]]] = {self.ANY_NODE: [{"found": 1}]}
        self._default_response: list[dict[str, Any]] = []

    def set_response(self, query_text: str, rows: list[dict[str, Any]]) -> None:
        self._responses[query_text] = rows

    def set_default_response(self, rows: list[dict[str, Any]]) -> None:
        self._default_response = rows

    def set_empty(self, empty: bool = True) -> None:
        """The answer of the check for a lost graph: an empty database, or one with a node."""

        self._responses[self.ANY_NODE] = [] if empty else [{"found": 1}]

    def run(self, query: Query) -> list[dict[str, Any]]:
        self.received_queries.append(query)
        return self._responses.get(query.text, self._default_response)


class InMemoryCatalog(Catalog):
    """Catalog fake backed by dicts, following the port's error contract."""

    def __init__(self) -> None:
        self.objects: dict[str, ObjectRef] = {}
        self.thumbnails: dict[str, Optional[str]] = {}

    def health(self) -> dict[str, Any]:
        return {"ok": True}

    def add(self, obj: ObjectRef) -> None:
        if obj.id in self.objects:
            raise ConflictError(f"Object '{obj.id}' already exists")
        self.objects[obj.id] = obj

    def get(self, object_id: str) -> Optional[ObjectRef]:
        return self.objects.get(object_id)

    def list(self) -> list[ObjectRef]:
        return list(self.objects.values())

    def children(self, object_id: str) -> list[ObjectRef]:
        return [obj for obj in self.objects.values() if object_id in obj.parents]

    def update(self, obj: ObjectRef) -> None:
        self._require(obj.id)
        self.objects[obj.id] = obj

    def remove(self, object_id: str) -> None:
        self._require(object_id)
        del self.objects[object_id]
        self.thumbnails.pop(object_id, None)

    def get_thumbnail(self, object_id: str) -> Optional[str]:
        self._require(object_id)
        return self.thumbnails.get(object_id)

    def set_thumbnail(self, object_id: str, svg: Optional[str]) -> None:
        self._require(object_id)
        self.thumbnails[object_id] = svg

    def _require(self, object_id: str) -> None:
        if object_id not in self.objects:
            raise NotFoundError(f"Object '{object_id}' not found")


class InMemoryPreferences(Preferences):
    def __init__(self) -> None:
        self.values: dict[str, Any] = {}

    def health(self) -> dict[str, Any]:
        return {"ok": True}

    def get(self, key: str) -> Any:
        return self.values.get(key)

    def set(self, key: str, value: Any) -> None:
        self.values[key] = value


class CoreToolsPackage(SoupPlugin):
    """Test package providing the catalog and preferences tools in memory."""

    name = "test_core_tools"
    version = "1.0.0"
    provides_tools = ("catalog", "preferences")

    def __init__(self) -> None:
        self.catalog = InMemoryCatalog()
        self.preferences = InMemoryPreferences()

    def register(self, ctx: PluginContext) -> None:
        ctx.add_tool(self.catalog)
        ctx.add_tool(self.preferences)


def fake_memgraph_tool(db: Optional[GraphDatabase] = None):
    """The tool_memgraph package's MemgraphTool on a FakeDatabase."""

    from tests.packages import bundled_api

    return bundled_api("tool_memgraph").MemgraphTool(db if db is not None else FakeDatabase())


def fake_storage_tool(files: Optional[FileStorage] = None, root: str = "/soup"):
    """The tool_storage package's StorageTool on an InMemoryFileStorage."""

    from tests.packages import bundled_api

    return bundled_api("tool_storage").StorageTool(files if files is not None else InMemoryFileStorage(), root=root)


class LegacyToolsPackage(SoupPlugin):
    """
    Test package providing the "memgraph" and "storage" tools (the real
    tool classes) on a FakeDatabase and an InMemoryFileStorage. `db` and
    `files` stay reachable for assertions.
    """

    name = "test_legacy_tools"
    version = "1.0.0"
    provides_tools = ("memgraph", "storage")

    def __init__(self, db: Optional[GraphDatabase] = None, files: Optional[FileStorage] = None) -> None:
        self.db = db if db is not None else FakeDatabase()
        self.files = files if files is not None else InMemoryFileStorage()
        self.memgraph = fake_memgraph_tool(self.db)
        self.storage = fake_storage_tool(self.files)

    def register(self, ctx: PluginContext) -> None:
        ctx.add_tool(self.memgraph)
        ctx.add_tool(self.storage)


def fake_tool_engine(
    settings,
    db: Optional[GraphDatabase] = None,
    files: Optional[FileStorage] = None,
    extra_plugins: Iterable[Any] = (),
):
    """
    build_engine(settings) with the in-memory "memgraph" and "storage"
    tools (LegacyToolsPackage) in place of tool_memgraph and tool_storage,
    which `settings` must therefore not activate, and the in-memory
    catalog and preferences (CoreToolsPackage) unless `extra_plugins`
    already has one.
    """

    from soup.core.engine import build_engine

    extra = [LegacyToolsPackage(db, files), *extra_plugins]
    if not any(isinstance(plugin, CoreToolsPackage) for plugin in extra_plugins):
        extra.append(CoreToolsPackage())
    return build_engine(settings, extra_plugins=extra)


# The packages of the EKG (commits 8 and 9) and what they require.
EKG_PACKAGES = ("tool_memgraph", "tool_storage", "soup_base", "csv_table", "ekg", "csv_ekg", "causal_df", "ekg_views")
# ... and the analyses and the aggregate graph (commit 10).
ANALYSIS_PACKAGES = (*EKG_PACKAGES, "ekg_analysis", "ekg_class_graph")


def use_database(engine, db: GraphDatabase) -> None:
    """Point the real "memgraph" tool of `engine` (tool_memgraph) at `db` (white-box, tests only)."""

    engine.ctx.tool_registry.get("memgraph")._db = db


def ekg_engine(tmp_path, monkeypatch, packages: Iterable[str] = EKG_PACKAGES, db=None, extra_plugins=()):
    """
    build_engine with the bundled `packages`, tool_storage's local backend
    on tmp_path/"volume" (the folders of the datasets and the catalog) and
    the memgraph tool on `db` (a new FakeDatabase if None).
    """

    from soup.core.engine import build_engine
    from soup.core.settings import Settings
    from tests.packages import BUNDLED_PACKAGES_DIR

    monkeypatch.setenv("SOUP_STORAGE_KIND", "local")
    monkeypatch.setenv("SOUP_LOCAL_STORAGE_ROOT", str(tmp_path / "volume"))
    installed = tmp_path / "installed"
    settings = Settings(
        packages=tuple(packages),
        packages_path=(str(BUNDLED_PACKAGES_DIR), str(installed)),
        installed_packages_dir=str(installed),
    )
    engine = build_engine(settings, extra_plugins=list(extra_plugins))
    if "memgraph" in engine.ctx.tool_registry:
        use_database(engine, db if db is not None else FakeDatabase())
    return engine


def volume_files(tmp_path) -> list[str]:
    """The files on the ekg_engine volume, as "<folder>/<file>" paths, without the catalog's."""

    root = tmp_path / "volume"
    if not root.exists():
        return []
    return sorted(
        path.relative_to(root).as_posix() for path in root.rglob("*")
        if path.is_file() and not path.relative_to(root).as_posix().startswith("_")
    )
