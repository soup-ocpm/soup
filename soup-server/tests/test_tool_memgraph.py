"""
------------------------------------------------------------------------
File : test_tool_memgraph.py
Description: Tests for the tool_memgraph package's "memgraph" tool on a
             FakeDatabase: run, health, the active graph
             (ensure_loaded / advance / current_state / clear /
             invalidate),
             MemgraphConfig from the environment and the public api.py.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import threading

import pytest

from tests.fakes import FakeDatabase, fake_memgraph_tool
from tests.packages import bundled_api, bundled_source

api = bundled_api("tool_memgraph")
Query = api.Query

CLEAR = "MATCH (n) DETACH DELETE n"


class _Loader:
    def __init__(self, text: str = "CREATE (:Event)", fail: bool = False):
        self.text = text
        self.fail = fail
        self.calls = 0

    def __call__(self, run) -> None:
        self.calls += 1
        run(Query(self.text, {"calls": self.calls}))
        if self.fail:
            raise RuntimeError("load failed")


@pytest.fixture
def db():
    return FakeDatabase()


@pytest.fixture
def tool(db):
    return fake_memgraph_tool(db)


def _texts(db) -> list[str]:
    return [query.text for query in db.received_queries]


def test_run_forwards_the_query_and_returns_the_rows(tool, db):
    db.set_response("MATCH (n) RETURN n", [{"n": 1}])

    rows = tool.run(Query("MATCH (n) RETURN n", {"id": "x"}))

    assert rows == [{"n": 1}]
    assert db.received_queries[-1].params == {"id": "x"}


def test_ensure_loaded_loads_after_clearing_the_database(tool, db):
    loader = _Loader()

    assert tool.ensure_loaded("obj-1", loader) is True

    assert loader.calls == 1
    assert _texts(db) == [CLEAR, "CREATE (:Event)"]
    assert tool.current_state() == "obj-1"


def test_ensure_loaded_does_not_reload_the_active_state(tool, db):
    loader = _Loader()
    tool.ensure_loaded("obj-1", loader)
    db.received_queries.clear()

    assert tool.ensure_loaded("obj-1", loader) is False

    assert loader.calls == 1
    # One query more: the check that the graph is still in the database.
    assert _texts(db) == [db.ANY_NODE]


def test_ensure_loaded_rebuilds_when_the_active_state_finds_an_empty_database(tool, db, caplog):
    loader = _Loader()
    tool.ensure_loaded("obj-1", loader)
    db.set_empty()
    db.received_queries.clear()

    with caplog.at_level("WARNING", logger="soup.memgraph"):
        assert tool.ensure_loaded("obj-1", loader) is True

    assert loader.calls == 2
    assert _texts(db) == [db.ANY_NODE, CLEAR, "CREATE (:Event)"]
    assert tool.current_state() == "obj-1"
    assert "Memgraph restarted or emptied: reloading obj-1" in caplog.text


def test_is_loaded_looks_at_the_database_only_for_the_active_state(tool, db):
    tool.ensure_loaded("obj-1", _Loader())
    db.received_queries.clear()

    assert tool.is_loaded("obj-2") is False
    assert db.received_queries == []
    assert tool.current_state() == "obj-1"

    assert tool.is_loaded("obj-1") is True
    assert _texts(db) == [db.ANY_NODE]


def test_is_loaded_forgets_the_state_of_an_empty_database(tool, db):
    tool.ensure_loaded("obj-1", _Loader())
    db.set_empty()

    assert tool.is_loaded("obj-1") is False

    assert tool.current_state() is None


def test_ensure_loaded_reloads_when_the_state_changes(tool, db):
    first, second = _Loader("CREATE (:A)"), _Loader("CREATE (:B)")
    tool.ensure_loaded("obj-1", first)

    assert tool.ensure_loaded("obj-2", second) is True

    assert second.calls == 1
    assert _texts(db)[-2:] == [CLEAR, "CREATE (:B)"]
    assert tool.current_state() == "obj-2"


def test_ensure_loaded_reloads_with_force(tool, db):
    loader = _Loader()
    tool.ensure_loaded("obj-1", loader)

    assert tool.ensure_loaded("obj-1", loader, force=True) is True

    assert loader.calls == 2
    assert _texts(db).count(CLEAR) == 2


def test_a_failed_load_leaves_no_active_state(tool):
    tool.ensure_loaded("obj-1", _Loader())

    with pytest.raises(RuntimeError, match="load failed"):
        tool.ensure_loaded("obj-2", _Loader(fail=True))

    assert tool.current_state() is None
    # The next request loads again instead of trusting a half-loaded graph.
    retry = _Loader()
    assert tool.ensure_loaded("obj-2", retry) is True
    assert retry.calls == 1


def test_advance_mutates_the_active_graph_and_moves_to_the_new_state(tool, db):
    tool.ensure_loaded("parent", lambda run: None)
    db.received_queries.clear()

    tool.advance("parent", "child", lambda run: run(Query("MATCH (n:`Event`) DETACH DELETE n")))

    assert tool.current_state() == "child"
    # In place: no clear of the database, only the check that the graph is there.
    assert _texts(db) == [db.ANY_NODE, "MATCH (n:`Event`) DETACH DELETE n"]


def test_advance_on_an_empty_database_is_an_error_and_mutates_nothing(tool, db):
    from soup.core.contracts import ConflictError

    tool.ensure_loaded("parent", lambda run: None)
    db.set_empty()
    db.received_queries.clear()
    calls = []

    with pytest.raises(ConflictError, match="no longer in Memgraph"):
        tool.advance("parent", "child", lambda run: calls.append(run))

    assert calls == [] and _texts(db) == [db.ANY_NODE]
    # The state is forgotten: the next opening rebuilds the parent.
    assert tool.current_state() is None


def test_advance_from_a_state_that_is_not_active_does_not_touch_the_graph(tool, db):
    from soup.core.contracts import ConflictError

    tool.ensure_loaded("other", lambda run: None)
    db.received_queries.clear()
    calls = []

    with pytest.raises(ConflictError, match="parent"):
        tool.advance("parent", "child", lambda run: calls.append(run))

    assert calls == [] and db.received_queries == []
    assert tool.current_state() == "other"


def test_a_failed_advance_leaves_the_state_unknown(tool, db):
    tool.ensure_loaded("parent", lambda run: None)

    def mutate(run):
        raise RuntimeError("filter failed")

    with pytest.raises(RuntimeError, match="filter failed"):
        tool.advance("parent", "child", mutate)
    assert tool.current_state() is None
    assert tool.ensure_loaded("parent", lambda run: None) is True


@pytest.mark.parametrize("states", [("", "b"), ("a", ""), (None, "b")])
def test_advance_states_must_be_non_empty_strings(tool, states):
    with pytest.raises(ValueError):
        tool.advance(*states, lambda run: None)


@pytest.mark.parametrize("state_key", ["", None, 3])
def test_state_key_must_be_a_non_empty_string(tool, state_key):
    with pytest.raises(ValueError):
        tool.ensure_loaded(state_key, _Loader())


def test_clear_empties_the_database_and_forgets_the_state(tool, db):
    tool.ensure_loaded("obj-1", _Loader())

    tool.clear()

    assert _texts(db)[-1] == CLEAR
    assert tool.current_state() is None


def test_invalidate_forgets_the_state_without_touching_the_data(tool, db):
    tool.ensure_loaded("obj-1", _Loader())
    db.received_queries.clear()

    tool.invalidate()

    assert tool.current_state() is None
    assert db.received_queries == []


def test_concurrent_loads_of_the_same_state_load_once(tool):
    loader = _Loader()
    barrier = threading.Barrier(8)

    def load():
        barrier.wait()
        tool.ensure_loaded("obj-1", loader)

    threads = [threading.Thread(target=load) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert loader.calls == 1


def test_health_reports_a_failing_database_without_raising():
    class _Down(FakeDatabase):
        def run(self, query):
            raise ConnectionError("unreachable")

    assert fake_memgraph_tool(FakeDatabase()).health()["ok"] is True
    health = fake_memgraph_tool(_Down()).health()
    assert health == {"ok": False, "error": "unreachable"}


def test_close_closes_a_database_that_has_close():
    class _Closable(FakeDatabase):
        closed = False

        def close(self):
            self.closed = True

    db = _Closable()
    fake_memgraph_tool(db).close()
    fake_memgraph_tool(FakeDatabase()).close()  # no close(): no error

    assert db.closed is True


def test_config_reads_the_environment():
    from soup_pkg_tool_memgraph.config import MemgraphConfig

    assert MemgraphConfig.from_env({}).uri == "bolt://memgraph:7687"
    assert MemgraphConfig.from_env({"MEMGRAPH_HOST": "localhost", "MEMGRAPH_PORT": "7688"}).uri == "bolt://localhost:7688"


def test_manifest_and_api():
    manifest = bundled_source("tool_memgraph").manifest

    assert manifest.provides_tools == ("memgraph",)
    assert manifest.requires_tools == ()
    assert api.MEMGRAPH_TOOL == "memgraph"
    assert api.MemgraphTool.name == "memgraph"
    assert api.ident("Event") == "`Event`"
    with pytest.raises(ValueError):
        api.ident("Event`) DETACH DELETE (n")
