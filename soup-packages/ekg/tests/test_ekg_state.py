"""
------------------------------------------------------------------------
File : test_ekg_state.py
Description: The graph state of "ekg" objects (ekg package, state.py and
             builder.py) on the real memgraph tool over a FakeDatabase:
             an import leaves its object as the active state;
             ensure_loaded does not rebuild an active state, rebuilds
             with force or for another object, and for a derived object
             applies the state of a test provider (contributed to
             "ekg.state_providers") after rebuilding the root;
             "ekg.before_reset" is published before every emptying or
             rebuild, "ekg.built" after a build; dispose empties the
             graph of an active object and removes its files; the "load"
             operation; derive_state changes the loaded parent in place
             (a failure rebuilds the parent); a derived object of another
             kind loads through a derived parent with only "memgraph".
Project : soup-packages/ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

from typing import Any, Mapping

import pytest

from soup.core.contracts import (
    NotFoundError,
    ObjectDraft,
    ObjectRef,
    Operation,
    OperationInput,
    PluginContext,
    ServiceUnavailableError,
    SoupPlugin,
    Upload,
    ValidationError,
)
from tests.fakes import FakeDatabase, ekg_engine, volume_files
from tests.packages import bundled_api

ekg = bundled_api("ekg")
GraphDatabase = ekg.GraphDatabase

CSV = b"case,activity,time,order,item\n1,Create,2021-01-01T10:00:00.000,o1,i1\n2,Ship,2021-01-01T11:00:00.000,o1,i2\n"
OPTIONS = {"event_id": "case", "timestamp": "time", "activity": "activity", "entities": ["order", "item"]}

CLEAR = "MATCH (n) DETACH DELETE n"


class _FilterProvider(ekg.StateProvider):
    key = "test.only_activity"

    def apply(self, spec: Mapping[str, Any], db: GraphDatabase) -> None:
        db.run(ekg.Query("MATCH (e:Event) WHERE e.ActivityName <> $activity DETACH DELETE e", {"activity": spec["activity"]}))


class _Derive(Operation):
    """ekg -> a derived ekg object keeping only one activity (meta.state)."""

    id = "derive"
    label = "Only one activity"
    inputs = (OperationInput("ekg", (ekg.EKG_KIND,)),)
    produces = (ekg.EKG_KIND,)
    requires_tools = ("memgraph", "storage")

    def run(self, inputs, params, tools):
        state = {"provider": _FilterProvider.key, "spec": {"activity": "Create"}}
        return [ObjectDraft(f"{inputs['ekg'].name} - Create", ekg.EKG_KIND, {"state": state})]

    def dispose(self, obj, tools) -> None:
        ekg.dispose(obj, tools)


class _StatePackage(SoupPlugin):
    name = "state_test"
    version = "1.0.0"
    requires = ("ekg",)
    requires_tools = ("memgraph", "storage")

    def __init__(self, provide: bool = True):
        self.provide = provide
        self.events: list[tuple[str, dict, int]] = []
        self.db: FakeDatabase | None = None

    def register(self, ctx: PluginContext) -> None:
        if self.provide:
            ctx.contribute(ekg.STATE_PROVIDERS_POINT, _FilterProvider(), key=_FilterProvider.key)
        ctx.add_operation(_Derive())
        for event in (ekg.EKG_BEFORE_RESET, ekg.EKG_BUILT):
            ctx.subscribe(event, lambda payload, event=event: self.events.append(
                (event, dict(payload), len(self.db.received_queries) if self.db else 0)
            ))


@pytest.fixture
def setup(tmp_path, monkeypatch):
    db = FakeDatabase()
    package = _StatePackage()
    package.db = db
    engine = ekg_engine(tmp_path, monkeypatch, db=db, extra_plugins=[package])
    assert engine.report.failed == [], engine.report.failed
    return engine, db, package


def _import(engine, name="orders"):
    return engine.import_router.import_("csv_ekg.csv", Upload.from_bytes("orders.csv", CSV), name, options=OPTIONS)


def _tools(engine):
    return engine.core_tools.toolbox("test", ("memgraph", "storage"))


def _memgraph(engine):
    return engine.ctx.tool_registry.get("memgraph")


def _texts(db: FakeDatabase, start: int = 0) -> list[str]:
    return [query.text for query in db.received_queries[start:]]


def test_an_import_leaves_its_object_as_the_active_state(setup):
    engine, db, package = setup
    obj = _import(engine)

    assert _memgraph(engine).current_state() == obj.meta["graph_key"]
    events = [(event, payload.get("object")) for event, payload, _ in package.events]
    assert events == [(ekg.EKG_BEFORE_RESET, obj.id), (ekg.EKG_BUILT, obj.id)]
    built = package.events[-1][1]
    assert (built["dataset"], set(built["counts"])) == ("orders", {"event_nodes", "entity_nodes", "corr_rel", "df_rel"})


def test_ensure_loaded_does_not_rebuild_an_active_state(setup):
    engine, db, package = setup
    obj = _import(engine)
    before, published = len(db.received_queries), len(package.events)

    assert ekg.ensure_loaded(obj, _tools(engine)) is False

    # One query more: the check that the graph is still in the database.
    assert _texts(db, before) == [db.ANY_NODE]
    assert len(package.events) == published


def test_ensure_loaded_rebuilds_an_active_state_after_memgraph_restarted(setup):
    # Memgraph has no persistence: after a restart of Memgraph alone, the
    # backend still holds the state and the database is empty.
    engine, db, _package = setup
    obj = _import(engine)
    db.set_empty()
    start = len(db.received_queries)

    assert ekg.ensure_loaded(obj, _tools(engine)) is True

    sent = _texts(db, start)
    assert sent[0] == db.ANY_NODE and CLEAR in sent and len(sent) > 2
    assert _memgraph(engine).current_state() == obj.meta["graph_key"]


def test_ensure_loaded_rebuilds_with_force_or_for_another_object(setup):
    engine, db, _package = setup
    first, second = _import(engine, "first"), _import(engine, "second")
    assert _memgraph(engine).current_state() == second.meta["graph_key"]

    start = len(db.received_queries)
    assert ekg.ensure_loaded(first, _tools(engine)) is True
    texts = _texts(db, start)
    assert texts[0] == CLEAR
    assert any("/first/first.csv" in text for text in texts if text.startswith("LOAD CSV"))
    assert _memgraph(engine).current_state() == first.meta["graph_key"]

    start = len(db.received_queries)
    assert ekg.ensure_loaded(first, _tools(engine), force=True) is True
    assert _texts(db, start)[0] == CLEAR


def test_before_reset_is_published_before_every_rebuild(setup):
    engine, db, package = setup
    first, second = _import(engine, "first"), _import(engine, "second")
    ekg.ensure_loaded(first, _tools(engine))
    ekg.ensure_loaded(first, _tools(engine), force=True)

    clears = [index for index, query in enumerate(db.received_queries) if query.text == CLEAR]
    resets = [(payload, seen) for event, payload, seen in package.events if event == ekg.EKG_BEFORE_RESET]
    # Two imports and two loads: four emptyings, each announced before it happened.
    assert len(clears) == len(resets) == 4
    assert all(seen <= clear for (_, seen), clear in zip(resets, clears))
    assert [payload["reason"] for payload, _ in resets] == ["build", "build", "load", "load"]
    assert resets[2][0]["active"] == second.meta["graph_key"]


def test_a_derived_object_is_loaded_by_its_provider_after_rebuilding_the_root(setup):
    engine, db, _package = setup
    root = _import(engine)
    [derived] = engine.operation_router.run("state_test.derive", [root.id])
    assert derived.parents == (root.id,)

    start = len(db.received_queries)
    assert ekg.ensure_loaded(derived, _tools(engine)) is True

    texts = _texts(db, start)
    load = next(index for index, text in enumerate(texts) if text.startswith("LOAD CSV"))
    applied = next(index for index, query in enumerate(db.received_queries[start:]) if query.params.get("activity") == "Create")
    assert load < applied
    assert _memgraph(engine).current_state() == derived.id
    # Already active: nothing to do; the root is another state.
    assert ekg.ensure_loaded(derived, _tools(engine)) is False
    assert ekg.ensure_loaded(root, _tools(engine)) is True


def test_a_derived_object_without_its_provider_answers_503(tmp_path, monkeypatch):
    package = _StatePackage(provide=False)
    engine = ekg_engine(tmp_path, monkeypatch, extra_plugins=[package])
    root = _import(engine)
    [derived] = engine.operation_router.run("state_test.derive", [root.id])

    with pytest.raises(ServiceUnavailableError, match="test.only_activity"):
        ekg.ensure_loaded(derived, _tools(engine))


def test_a_derived_object_needs_an_ekg_parent(setup):
    engine, _db, _package = setup
    root = _import(engine)
    [derived] = engine.operation_router.run("state_test.derive", [root.id])
    engine.core_tools.catalog().remove(root.id)

    with pytest.raises(NotFoundError):
        ekg.ensure_loaded(derived, _tools(engine))


def test_deleting_the_active_object_empties_the_graph_and_removes_its_files(setup, tmp_path):
    engine, db, package = setup
    first, second = _import(engine, "first"), _import(engine, "second")

    engine.workspace_service.delete(first.id)  # not active: files only
    assert [path for path in volume_files(tmp_path) if path.startswith("first/")] == []
    assert _memgraph(engine).current_state() == second.meta["graph_key"]

    start = len(db.received_queries)
    engine.workspace_service.delete(second.id)
    assert _texts(db, start) == [CLEAR]
    assert _memgraph(engine).current_state() is None
    assert volume_files(tmp_path) == []
    assert package.events[-1][0] == ekg.EKG_BEFORE_RESET
    assert package.events[-1][1]["reason"] == "dispose"


def test_the_load_operation_runs_ensure_loaded(setup):
    engine, db, _package = setup
    first, _second = _import(engine, "first"), _import(engine, "second")
    assert {entry.key for entry in engine.operation_router.operations_for([first.id])} == {"ekg.load", "state_test.derive"}

    assert engine.operation_router.run("ekg.load", [first.id]) == []
    assert _memgraph(engine).current_state() == first.meta["graph_key"]

    start = len(db.received_queries)
    engine.operation_router.run("ekg.load", [first.id])
    assert _texts(db, start) == [db.ANY_NODE]
    engine.operation_router.run("ekg.load", [first.id], {"force": True})
    assert _texts(db, start)[1] == CLEAR


def test_a_rebuild_saves_the_counts_and_times_in_the_config(setup, tmp_path):
    engine, db, _package = setup
    obj = _import(engine)
    db.set_response("MATCH (n:Event) RETURN COUNT(n) AS count", [{"count": 7}])

    ekg.ensure_loaded(obj, _tools(engine), force=True)

    import json

    config = json.loads((tmp_path / "volume" / "orders" / "orders_config.json").read_text(encoding="utf-8"))
    assert config["event_nodes"] == 7
    assert config["process_info"]["init_df_time"] is not None
    assert config["date_created"] == obj.meta["date_created"]


def test_derive_state_changes_the_loaded_parent_in_place_and_keeps_its_key(setup):
    engine, db, _package = setup
    root = _import(engine)
    start = len(db.received_queries)

    graph_key = ekg.derive_state(root, lambda run: run(ekg.Query("MATCH (n:`Event`) RETURN n LIMIT $limit", {"limit": 1})), _tools(engine))

    # The parent was active: no rebuild, the two checks that its graph is
    # there (ensure_loaded, advance) and the change.
    assert _texts(db, start) == [db.ANY_NODE, db.ANY_NODE, "MATCH (n:`Event`) RETURN n LIMIT $limit"]
    assert _memgraph(engine).current_state() == graph_key != root.meta["graph_key"]

    # The derived object keeps that key: its first opening does not
    # rebuild; after another graph its provider rebuilds it with the same key.
    state = {"provider": _FilterProvider.key, "spec": {"activity": "Create"}}
    derived = ObjectRef(
        id="derived-1", name="derived", kind=ekg.EKG_KIND, created_by=root.created_by, parents=(root.id,),
        meta={"state": state, "graph_key": graph_key},
    )
    engine.core_tools.catalog().add(derived)
    assert ekg.graph_key_of(derived) == graph_key
    assert ekg.ensure_loaded(derived, _tools(engine)) is False
    assert ekg.ensure_loaded(root, _tools(engine)) is True
    assert ekg.ensure_loaded(derived, _tools(engine)) is True
    assert _memgraph(engine).current_state() == graph_key


def test_a_failed_derive_state_rebuilds_the_parent(setup):
    engine, db, _package = setup
    root = _import(engine)

    def mutate(run):
        run(ekg.Query("MATCH (n:`Event`) DETACH DELETE n"))
        raise RuntimeError("filter failed")

    start = len(db.received_queries)
    with pytest.raises(RuntimeError, match="filter failed"):
        ekg.derive_state(root, mutate, _tools(engine))

    assert any(text.startswith("LOAD CSV") for text in _texts(db, start))
    assert _memgraph(engine).current_state() == root.meta["graph_key"]


def test_a_derived_object_of_another_kind_is_loaded_through_a_derived_parent(setup):
    engine, db, _package = setup
    root = _import(engine)
    [derived] = engine.operation_router.run("state_test.derive", [root.id])
    other = ObjectRef(
        id="other-1", name="other", kind="other_kind", created_by=derived.created_by, parents=(derived.id,),
        meta={"state": {"provider": _FilterProvider.key, "spec": {"activity": "Ship"}}},
    )
    engine.core_tools.catalog().add(other)

    assert ekg.root_of(other).id == root.id
    start = len(db.received_queries)
    # Only "memgraph": the dataset is read with the ekg package's own storage.
    assert ekg.ensure_loaded(other, engine.core_tools.toolbox("test", ("memgraph",))) is True

    activities = [query.params.get("activity") for query in db.received_queries[start:] if "activity" in query.params]
    assert activities == ["Create", "Ship"]
    assert _memgraph(engine).current_state() == other.id


def test_an_object_of_another_kind_without_a_state_is_not_an_ekg(setup):
    engine, _db, _package = setup
    root = _import(engine)
    plain = ObjectRef(id="plain-1", name="plain", kind="other_kind", created_by=root.created_by, parents=(root.id,))

    with pytest.raises(ValidationError, match="other_kind"):
        ekg.ensure_loaded(plain, _tools(engine))
