"""
------------------------------------------------------------------------
File : test_ekg_views_graph.py
Description: The "Grafo" and "Statistiche" visualizers of ekg_views and
             the views of "ekg.graph_views", on the real memgraph tool
             over a FakeDatabase: StandardGraphView turns the rows into
             the nodes and edges of a "graph" block; the LIMIT is $limit,
             an integer clamped to SOUP_EKG_VIEWS_MAX_LIMIT (a wrong value
             fails the package); the actions graph, search and node; every
             visualizer first loads its own object (ensure_loaded); the
             statistics read the counts, the activities, the entities with
             null values and the phase times of meta.process_info. A
             dataset whose graph cannot be built (one column for every
             standard role): the graph is a 400 with the reason and no
             query, the statistics show its metadata and the reason.
Project : soup-packages/ekg_views
------------------------------------------------------------------------
"""

from __future__ import annotations

import dataclasses
import json
import sys

import pytest

from soup.core.contracts import NotFoundError, Upload, ValidationError
from tests.api_client import soup_client
from tests.fakes import FakeDatabase, ekg_engine
from tests.packages import bundled_module

views = bundled_module("ekg_views", "views")

CSV = b"case,activity,time,order\n1,Create,2021-01-01T10:00:00.000,o1\n2,Ship,2021-01-01T11:00:00.000,o1\n"
OPTIONS = {"event_id": "case", "timestamp": "time", "activity": "activity", "entities": ["order"]}

CREATE = {"Event_Id": "1", "ActivityName": "Create", "order": "o1"}
SHIP = {"Event_Id": "2", "ActivityName": "Ship", "order": "o1"}
ORDER = {"Value": "o1", "Type": "order"}


def _edge(source_id, source, edge_id, rel_type, props, target_id, target, source_labels=("Event",), target_labels=("Event",)):
    return {
        "source_id": source_id, "source_labels": list(source_labels), "source": source,
        "edge_id": edge_id, "edge_type": rel_type, "edge": props,
        "target_id": target_id, "target_labels": list(target_labels), "target": target,
    }


DF_ROW = _edge(1, CREATE, 10, "DF", {"Type": "order", "ID": "o1", "edge_weight": 1}, 2, SHIP)
CORR_ROW = _edge(1, CREATE, 11, "CORR", {"Type": "order"}, 3, ORDER, target_labels=("Entity",))


class ParamsDatabase(FakeDatabase):
    """A FakeDatabase that also answers by text and params (several queries share one text)."""

    def __init__(self) -> None:
        super().__init__()
        self._by_query: dict[tuple[str, str], list] = {}

    def respond(self, query, rows) -> None:
        self._by_query[(query.text, repr(sorted(query.params.items())))] = rows

    def run(self, query):
        key = (query.text, repr(sorted(query.params.items())))
        if key in self._by_query:
            self.received_queries.append(query)
            return self._by_query[key]
        return super().run(query)


@pytest.fixture
def setup(tmp_path, monkeypatch):
    db = ParamsDatabase()
    engine = ekg_engine(tmp_path, monkeypatch, db=db)
    assert engine.report.failed == [], engine.report.failed
    return engine, db


def _import(engine, name="orders"):
    return engine.import_router.import_("csv_ekg.csv", Upload.from_bytes("orders.csv", CSV), name, options=OPTIONS)


def _respond(db, query, rows):
    db.respond(query, rows)


# ---------------------------------------------------------------------- #
# StandardGraphView
# ---------------------------------------------------------------------- #
def test_the_standard_view_builds_the_graph_block():
    graph = views.StandardGraphView().to_graph([DF_ROW, CORR_ROW, DF_ROW])

    assert graph["directed"] is True
    assert [(node["id"], node["label"], node["group"]) for node in graph["nodes"]] == [
        ("1", "Create", "Event"), ("2", "Ship", "Event"), ("3", "o1", "order"),
    ]
    assert graph["nodes"][2]["props"] == ORDER
    df, corr, _again = graph["edges"]
    assert (df["source"], df["target"], df["group"], df["label"], df["props"]["weight"]) == ("1", "2", "order", "order", 1)
    assert (corr["group"], corr["label"]) == ("CORR", "CORR")


def test_the_object_view_draws_the_rel_by_qualifier_and_the_corr_with_theirs():
    item = {"Value": "i1", "Type": "item"}
    rel = _edge(3, ORDER, 20, "REL", {"qualifier": "contains"}, 4, item, source_labels=("Entity",), target_labels=("Entity",))
    bare = _edge(3, ORDER, 21, "REL", {}, 4, item, source_labels=("Entity",), target_labels=("Entity",))
    corr = _edge(1, CREATE, 11, "CORR", {"Type": "order", "qualifier": "placed"}, 3, ORDER, target_labels=("Entity",))
    view = views.ObjectGraphView()

    graph = view.to_graph([rel, bare, corr, CORR_ROW])

    assert (view.key, view.relationship_types, view.default_relations) == ("object", ("REL", "CORR"), ("REL",))
    assert [(node["id"], node["label"], node["group"]) for node in graph["nodes"]] == [
        ("3", "o1", "order"), ("4", "i1", "item"), ("1", "Create", "Event"),
    ]
    assert [(edge["group"], edge["label"]) for edge in graph["edges"]] == [
        ("contains", "contains"), ("REL", "REL"), ("CORR", "placed"), ("CORR", "CORR"),
    ]
    assert "MATCH (a:`Entity`)-[r:`REL`]->(b:`Entity`)" in view.edges_query(10, ["REL"]).text
    assert "MATCH (a)-[r:`REL`|`CORR`]->(b:`Entity`)" in view.edges_query(10, ["REL", "CORR"]).text


@pytest.mark.parametrize("relations, pattern", [
    (["DF"], "MATCH (a:`Event`)-[r:`DF`]->(b:`Event`)"),
    (["CORR"], "MATCH (a:`Event`)-[r:`CORR`]->(b:`Entity`)"),
    # Different targets: only the common source is labelled.
    (["DF", "CORR"], "MATCH (a:`Event`)-[r:`DF`|`CORR`]->(b)"),
])
def test_the_edges_are_read_with_a_labelled_pattern_and_no_global_order(relations, pattern):
    view = views.StandardGraphView()
    query = view.edges_query(321, relations)
    assert pattern in query.text
    assert "ORDER BY" not in query.text and "IN labels(" not in query.text and "type(r) IN" not in query.text
    assert "$limit" in query.text and "321" not in query.text
    assert query.params == {"limit": 321}

    max_data = view.max_data_query(relations)
    assert pattern in max_data.text and "apoc" not in max_data.text and "ORDER BY" not in max_data.text


def test_the_search_pages_a_labelled_pattern_in_a_stable_order():
    view = views.StandardGraphView()
    hostile = "Cre'ate`) DETACH DELETE n //"

    nodes = view.search_query(hostile, "node", 50, 50, ["DF"], label="Entity")
    assert "MATCH (n:`Entity`)" in nodes.text and "ORDER BY id" in nodes.text
    assert hostile not in nodes.text
    assert nodes.params == {"text": hostile, "offset": 50, "limit": 50}
    assert "MATCH (n) WHERE n:`Event` OR n:`Entity`" in view.search_query("", "node", 0, 50, ["DF"]).text

    edges = view.search_query(hostile, "edge", 0, 50, ["CORR"])
    assert "MATCH (a:`Event`)-[r:`CORR`]->(b:`Entity`)" in edges.text and "ORDER BY edge_id" in edges.text
    assert "MATCH (n:`Event`)" in view.search_count_query("x", "node", ["DF"], label="Event").text
    assert view.search_count_query("x", "edge", ["DF"]).params == {"text": "x"}

    node = view.node_query(7)
    assert "WHERE id(n) = $id AND (n:`Event` OR n:`Entity`)" in node.text and node.params == {"id": 7}


def test_relations_and_labels_outside_the_view_are_rejected():
    view = views.StandardGraphView()
    for relations in (["NEXT"], ["DF", "DF`]->() DETACH DELETE a //"], []):
        with pytest.raises(ValidationError):
            view.edges_query(10, relations)
    with pytest.raises(ValidationError, match="label"):
        view.search_query("", "node", 0, 50, ["DF"], label="Class")


class _OddView(views.EdgeListGraphView):
    key = "odd"
    relationships = {"MATCH": ("Order", "Order")}


class _BadView(views.EdgeListGraphView):
    key = "bad"
    relationships = {"has space": ("Event", "Event")}


def test_a_name_that_needs_quoting_goes_through_ident():
    assert "MATCH (a:`Order`)-[r:`MATCH`]->(b:`Order`)" in _OddView().edges_query(5, ["MATCH"]).text
    with pytest.raises(ValueError):
        _BadView().edges_query(5, ["has space"])


# ---------------------------------------------------------------------- #
# The visualizers on an engine
# ---------------------------------------------------------------------- #
def test_graph_data_draws_the_default_view_with_the_max_data(setup):
    engine, db = setup
    obj = _import(engine)
    view = views.StandardGraphView()
    _respond(db, view.edges_query(200, ["DF"]), [DF_ROW])
    _respond(db, view.max_data_query(["DF"]), [{"total_nodes": 2, "total_rels": 1}])

    data = engine.visualizer_router.data("ekg_views.graph", obj.id, {})

    assert data["views"] == [{"key": "standard", "label": "Grafo standard", "relationship_types": ["DF", "CORR"],
                              "default_relations": ["DF"], "node_labels": ["Event", "Entity"]},
                             {"key": "object", "label": "Grafo degli oggetti", "relationship_types": ["REL", "CORR"],
                              "default_relations": ["REL"], "node_labels": ["Entity", "Event"]}]
    assert (data["view"], data["limit"], data["relations"], data["max_data"], data["max_limit"]) == ("standard", 200, ["DF"], 3, 2000)
    assert [node["label"] for node in data["graph"]["nodes"]] == ["Create", "Ship"]


def test_the_graph_action_takes_view_limit_and_relations(setup):
    engine, db = setup
    obj = _import(engine)

    result = engine.visualizer_router.action("ekg_views.graph", obj.id, "graph", {"view": "standard", "limit": "50", "relations": ["DF", "CORR"]})
    sent = db.received_queries[-2]
    assert sent.params == {"limit": 50} and "[r:`DF`|`CORR`]" in sent.text
    assert (result["limit"], result["relations"]) == (50, ["DF", "CORR"])

    engine.visualizer_router.action("ekg_views.graph", obj.id, "graph", {"limit": 10**9})
    assert db.received_queries[-2].params["limit"] == 2000

    for params in ({"limit": "many"}, {"view": "nope"}, {"relations": ["NEXT"]}):
        with pytest.raises(ValidationError):
            engine.visualizer_router.action("ekg_views.graph", obj.id, "graph", params)

    # Every type hidden: an empty graph, nothing read.
    before = len(db.received_queries)
    empty = engine.visualizer_router.action("ekg_views.graph", obj.id, "graph", {"relations": []})
    assert (empty["graph"]["nodes"], empty["max_data"]) == ([], 0)
    assert len(db.received_queries) == before


def test_an_undeclared_relation_or_label_answers_400(setup):
    from soup.api.flask_app import build_flask_app

    engine, _db = setup
    obj = _import(engine)
    client = soup_client(build_flask_app(engine))
    url = f"/api/v3/objects/{obj.id}/visualizers/ekg_views.graph/actions"

    assert client.post(f"{url}/graph", json={"relations": ["DF"]}).status_code == 200
    assert client.post(f"{url}/graph", json={"relations": ["NEXT"]}).status_code == 400
    assert client.post(f"{url}/graph", json={"relations": ["DF`]->() DETACH DELETE a //"]}).status_code == 400
    assert client.post(f"{url}/search", json={"kind": "edge", "relations": ["OBS"]}).status_code == 400
    assert client.post(f"{url}/search", json={"kind": "node", "label": "Class"}).status_code == 400
    assert client.post(f"{url}/search", json={"kind": "node", "label": "Entity"}).status_code == 200


def test_the_max_limit_comes_from_the_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("SOUP_EKG_VIEWS_MAX_LIMIT", "30")
    engine = ekg_engine(tmp_path, monkeypatch)
    obj = _import(engine)
    assert engine.visualizer_router.data("ekg_views.graph", obj.id, {"limit": 100})["limit"] == 30


@pytest.mark.parametrize("value", ["0", "-3", "lots"])
def test_a_wrong_max_limit_fails_the_package(tmp_path, monkeypatch, value):
    monkeypatch.setenv("SOUP_EKG_VIEWS_MAX_LIMIT", value)
    engine = ekg_engine(tmp_path, monkeypatch)
    [failure] = engine.report.failed
    assert failure.plugin_name == "ekg_views"
    assert "SOUP_EKG_VIEWS_MAX_LIMIT" in failure.reason


def test_the_search_action_pages_nodes_and_edges(setup):
    engine, db = setup
    obj = _import(engine)
    view = views.StandardGraphView()
    _respond(db, view.search_query("cre", "node", 0, 50, ["DF"]), [{"id": 1, "labels": ["Event"], "props": CREATE}])
    _respond(db, view.search_count_query("cre", "node", ["DF"]), [{"count": 61}])

    page = engine.visualizer_router.action("ekg_views.graph", obj.id, "search", {"text": " cre ", "kind": "node", "offset": 0})
    assert page == {"items": [{"id": "1", "label": "Create", "group": "Event", "props": CREATE}], "total": 61}

    _respond(db, view.search_query("", "edge", 50, 50, ["DF"]), [DF_ROW])
    page = engine.visualizer_router.action("ekg_views.graph", obj.id, "search", {"kind": "edge", "offset": 50})
    [edge] = page["items"]
    assert (edge["source"], edge["target"], edge["type"], edge["weight"]) == ("1", "2", "order", 1)

    with pytest.raises(ValidationError):
        engine.visualizer_router.action("ekg_views.graph", obj.id, "search", {"kind": "both"})


def test_the_node_action_gives_the_properties(setup):
    engine, db = setup
    obj = _import(engine)
    view = views.StandardGraphView()
    _respond(db, view.node_query(3), [{"id": 3, "labels": ["Entity"], "props": ORDER}])

    node = engine.visualizer_router.action("ekg_views.graph", obj.id, "node", {"id": "3"})
    assert node == {"id": "3", "label": "o1", "group": "order", "props": ORDER}
    with pytest.raises(NotFoundError):
        engine.visualizer_router.action("ekg_views.graph", obj.id, "node", {"id": 4})


def _spy_ensure_loaded(engine, monkeypatch, visualizer_key):
    """Replace ensure_loaded as the ekg_views contributions call it, recording the objects."""

    visualizer = engine.ctx.visualizers.get(visualizer_key)
    module = sys.modules[type(visualizer).__module__]
    calls = []
    real = module.ekg.ensure_loaded
    monkeypatch.setattr(module.ekg, "ensure_loaded", lambda obj, tools, force=False: calls.append(obj.id) or real(obj, tools, force))
    return calls


@pytest.mark.parametrize("key, action, params", [
    ("ekg_views.graph", None, {}),
    ("ekg_views.graph", "graph", {}),
    ("ekg_views.graph", "search", {"text": "x"}),
    ("ekg_views.stats", None, {}),
    ("ekg_views.queries", "query", {"key": "count_events"}),
])
def test_every_visualizer_loads_its_own_object_first(setup, monkeypatch, key, action, params):
    engine, db = setup
    first, second = _import(engine, "first"), _import(engine, "second")
    calls = _spy_ensure_loaded(engine, monkeypatch, key)
    start = len(db.received_queries)

    if action is None:
        engine.visualizer_router.data(key, first.id, params)
    else:
        engine.visualizer_router.action(key, first.id, action, params)

    assert calls == [first.id]
    texts = [query.text for query in db.received_queries[start:]]
    # The second import was the active graph: the first one is rebuilt before being read.
    assert any("/first/first.csv" in text for text in texts if text.startswith("LOAD CSV"))
    memgraph = engine.ctx.tool_registry.get("memgraph")
    assert memgraph.current_state() == engine.workspace_service.get(first.id).meta["graph_key"] != second.meta["graph_key"]


def test_the_statistics(setup):
    engine, db = setup
    obj = _import(engine)
    builtin = bundled_module("ekg_views", "builtin_queries")
    _respond(db, builtin.COUNT_EVENTS.build({}), [{"count": 2}])
    _respond(db, builtin.COUNT_ENTITIES.build({}), [{"count": 1}])
    _respond(db, builtin.COUNT_CORR.build({}), [{"count": 2}])
    _respond(db, builtin.COUNT_DF.build({}), [{"count": 1}])
    _respond(db, builtin.Activities().build({}), [{"activities": ["Ship", "Create"]}])
    _respond(db, builtin.Timestamps().build({}), [{"min_timestamp": 20210101100000, "max_timestamp": 20210101110000}])
    _respond(db, builtin.EntityKeys().build({}), [{"entity_type": "item"}, {"entity_type": "order"}])
    _respond(db, builtin.NullEntities().build({}), [{"prop": "order", "count": 3}])

    data = engine.visualizer_router.data("ekg_views.stats", obj.id, {})

    assert data["counts"] == {"event_nodes": 2, "entity_nodes": 1, "corr_rel": 2, "df_rel": 1}
    assert data["timestamps"] == {"min": "2021-01-01T10:00:00", "max": "2021-01-01T11:00:00"}
    assert data["activities"] == ["Create", "Ship"]
    assert data["entities"] == [
        {"name": "item", "nan_nodes": 0, "warning": None},
        {"name": "order", "nan_nodes": 3, "warning": "3 nodi hanno valore NaN."},
    ]
    assert data["charts"]["data"] == {"chart": "pie", "labels": ["Event", "Entity", "CORR", "DF"], "datasets": [{"label": "numero", "data": [2, 1, 2, 1]}]}
    # The import did not save the phase times (save_process_times false).
    assert data["charts"]["process"] is None
    assert data["columns"] == [
        {"name": "case", "role": "event_id"},
        {"name": "activity", "role": "activity"},
        {"name": "time", "role": "timestamp"},
        {"name": "order", "role": "entity"},
    ]


def test_the_dataset_columns_with_their_role():
    contributions = bundled_module("ekg_views", "contributions")
    meta = {
        "columns": ["id", "when", "what", "order", "price", "note"],
        "mapping": {"event_id": "id", "timestamp": "when", "activity": "what", "entities": ["order"], "values": ["price"]},
    }
    assert [(column["name"], column["role"]) for column in contributions.dataset_columns(meta)] == [
        ("id", "event_id"), ("when", "timestamp"), ("what", "activity"), ("order", "entity"), ("price", "value"), ("note", ""),
    ]
    assert contributions.dataset_columns({}) == []


def test_the_phase_times_pie():
    contributions = bundled_module("ekg_views", "contributions")
    info = {
        "init_event_time": "2025-01-01T10:00:00.000", "finish_event_time": "2025-01-01T10:00:01.500",
        "init_entity_time": "2025-01-01T10:00:01.500", "finish_entity_time": "2025-01-01T10:00:02.000",
        "init_corr_time": None, "finish_corr_time": None,
        "init_df_time": "2025-01-01T10:00:02.000", "finish_df_time": "2025-01-01T10:00:04.000",
    }
    assert contributions.phase_times(info) == {
        "chart": "pie", "labels": ["Event", "Entity", "CORR", "DF"], "datasets": [{"label": "secondi", "data": [1.5, 0.5, 0, 2.0]}],
    }
    assert contributions.phase_times({}) is None
    assert contributions.phase_times(None) is None


# ---------------------------------------------------------------------- #
# A dataset whose graph cannot be built (one column for every role)
# ---------------------------------------------------------------------- #
UNBUILDABLE = {
    "dataset_name": "try",
    "all_columns": ["EventID", "Activity", "Timestamp", "Item"],
    "standard_columns": ["Timestamp", "Timestamp", "Timestamp"],
    "filtered_columns": ["Timestamp", "Item"],
    "values_columns": ["Timestamp"],
    "event_nodes": 21, "entity_nodes": 9, "corr_rel": 15, "df_rel": 10,
}
PROBLEM = (
    "The graph of dataset 'try' cannot be built: event_id, timestamp and activity must be three "
    "different columns: 'Timestamp' is used for event_id, timestamp, activity"
)


@pytest.fixture
def unbuildable(tmp_path, monkeypatch):
    for path, content in (("try/try.csv", b"EventID,Activity,Timestamp,Item\n"),
                          ("try/try_config.json", json.dumps(UNBUILDABLE).encode("utf-8"))):
        target = tmp_path / "volume" / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    db = FakeDatabase()
    engine = ekg_engine(tmp_path, monkeypatch, db=db)
    [obj] = [obj for obj in engine.core_tools.catalog().list() if obj.kind == "ekg"]
    return engine, db, obj


def _without_warning(engine, obj):
    """The object as the adoption before the check left it (no meta.warning/buildable)."""

    meta = {key: value for key, value in obj.meta.items() if key not in ("warning", "buildable")}
    engine.core_tools.catalog().update(dataclasses.replace(obj, meta=meta))
    return engine.core_tools.catalog().get(obj.id)


@pytest.mark.parametrize("adopted_before_the_check", [False, True])
def test_the_graph_of_a_dataset_that_cannot_be_built_is_a_400_without_queries(unbuildable, adopted_before_the_check):
    engine, db, obj = unbuildable
    if adopted_before_the_check:
        obj = _without_warning(engine, obj)

    with pytest.raises(ValidationError) as error:
        engine.visualizer_router.data("ekg_views.graph", obj.id, {})

    assert str(error.value) == PROBLEM
    assert error.value.http_status_code == 400
    assert db.received_queries == []


@pytest.mark.parametrize("adopted_before_the_check", [False, True])
def test_the_statistics_of_a_dataset_that_cannot_be_built_show_its_metadata_and_why(unbuildable, adopted_before_the_check):
    engine, db, obj = unbuildable
    if adopted_before_the_check:
        obj = _without_warning(engine, obj)

    data = engine.visualizer_router.data("ekg_views.stats", obj.id, {})

    assert data["notice"] == PROBLEM
    assert data["counts"] == {"event_nodes": 21, "entity_nodes": 9, "corr_rel": 15, "df_rel": 10}
    assert (data["timestamps"], data["activities"], data["entities"]) == ({"min": None, "max": None}, [], [])
    assert data["columns"][2] == {"name": "Timestamp", "role": "activity"}
    assert db.received_queries == []
