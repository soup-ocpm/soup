"""
------------------------------------------------------------------------
File : memgraph_smoke.py
Description: Smoke test of the queries of ekg_analysis and ekg_class_graph
             that CHANGE the graph, against a REAL Memgraph (not collected
             by pytest: the name does not start with test_). Each check
             starts from a fresh copy of a small EKG (7 :Event, 6 :Entity,
             :CORR and :DF for the entity types order and item, the schema
             of the ekg package) and reports whether its queries succeed
             and the nodes/relationships before and after:
             - the six filters, with every operator where there is one;
             - "Nuova analisi" with combined filters (counts, the deletion
               of the classes of "analysis.before_apply", the filters in
               their order, counts);
             - the rollback: the memgraph tool's advance with a filter that
               fails half-way, then the rebuild of the parent (the counts
               must be the original ones);
             - "Costruisci grafo aggregato" with one and with two entity
               types, the queries Class/OBS/DF_C of "ekg.queries", the
               JSON parts of the classes, the "class" view and the
               deletion of the classes;
             - the read queries of "Indicatori di processo".
             It prints one line per check and the ones that failed, and
             exits with 1 if any did.

             docker run -d --rm --name ekg-analysis-smoke -p 17688:7687 memgraph/memgraph:3.13.2
             cd soup-server
             python ../soup-packages/ekg_analysis/tests/memgraph_smoke.py [bolt://localhost:17688]
             docker stop ekg-analysis-smoke

             The database is emptied: never point it at a Memgraph with
             data you want to keep.
Project : soup-packages/ekg_analysis
------------------------------------------------------------------------
"""

from __future__ import annotations

import sys
import traceback
from pathlib import Path
from typing import Any, Callable

SERVER_ROOT = Path(__file__).resolve().parents[3] / "soup-server"
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from tests.packages import bundled_module  # noqa: E402

database = bundled_module("tool_memgraph", "database")
query_module = bundled_module("tool_memgraph", "query")
tool_module = bundled_module("tool_memgraph", "tool")
filters = bundled_module("ekg_analysis", "filters")
analysis_module = bundled_module("ekg_analysis", "analysis")
service = bundled_module("ekg_analysis", "service")
insights = bundled_module("ekg_analysis", "insights")
classes = bundled_module("ekg_class_graph", "classes")
class_queries = bundled_module("ekg_class_graph", "queries")
class_views = bundled_module("ekg_class_graph", "views")

Query = query_module.Query

# order o1: Create -> Pack -> Ship -> Pay (about a day); o2: Create -> Ship
# (4 hours); o3: only Create. item i1: e1 -> e2, i2: e3 -> e4, i3: e5 -> e6;
# e7 has item 'nan'.
SAMPLE_GRAPH = """
CREATE (e1:Event {Event_Id: '1', Timestamp: localDateTime('2021-01-01T10:00:00'), ActivityName: 'Create', order: 'o1', item: 'i1'}),
       (e2:Event {Event_Id: '2', Timestamp: localDateTime('2021-01-01T10:30:00'), ActivityName: 'Pack', order: 'o1', item: 'i1'}),
       (e3:Event {Event_Id: '3', Timestamp: localDateTime('2021-01-01T11:00:00'), ActivityName: 'Ship', order: 'o1', item: 'i2'}),
       (e4:Event {Event_Id: '4', Timestamp: localDateTime('2021-01-02T09:30:00'), ActivityName: 'Pay', order: 'o1', item: 'i2'}),
       (e5:Event {Event_Id: '5', Timestamp: localDateTime('2021-01-03T08:00:00'), ActivityName: 'Create', order: 'o2', item: 'i3'}),
       (e6:Event {Event_Id: '6', Timestamp: localDateTime('2021-01-03T12:00:00'), ActivityName: 'Ship', order: 'o2', item: 'i3'}),
       (e7:Event {Event_Id: '7', Timestamp: localDateTime('2021-01-04T08:00:00'), ActivityName: 'Create', order: 'o3', item: 'nan'}),
       (o1:Entity {Value: 'o1', Type: 'order'}), (o2:Entity {Value: 'o2', Type: 'order'}), (o3:Entity {Value: 'o3', Type: 'order'}),
       (i1:Entity {Value: 'i1', Type: 'item'}), (i2:Entity {Value: 'i2', Type: 'item'}), (i3:Entity {Value: 'i3', Type: 'item'}),
       (e1)-[:CORR {Type: 'order'}]->(o1), (e2)-[:CORR {Type: 'order'}]->(o1), (e3)-[:CORR {Type: 'order'}]->(o1),
       (e4)-[:CORR {Type: 'order'}]->(o1), (e5)-[:CORR {Type: 'order'}]->(o2), (e6)-[:CORR {Type: 'order'}]->(o2),
       (e7)-[:CORR {Type: 'order'}]->(o3),
       (e1)-[:CORR {Type: 'item'}]->(i1), (e2)-[:CORR {Type: 'item'}]->(i1), (e3)-[:CORR {Type: 'item'}]->(i2),
       (e4)-[:CORR {Type: 'item'}]->(i2), (e5)-[:CORR {Type: 'item'}]->(i3), (e6)-[:CORR {Type: 'item'}]->(i3),
       (e1)-[:DF {Type: 'order', ID: 'o1', edge_weight: 1}]->(e2), (e2)-[:DF {Type: 'order', ID: 'o1', edge_weight: 1}]->(e3),
       (e3)-[:DF {Type: 'order', ID: 'o1', edge_weight: 1}]->(e4), (e5)-[:DF {Type: 'order', ID: 'o2', edge_weight: 1}]->(e6),
       (e1)-[:DF {Type: 'item', ID: 'i1', edge_weight: 1}]->(e2), (e3)-[:DF {Type: 'item', ID: 'i2', edge_weight: 1}]->(e4),
       (e5)-[:DF {Type: 'item', ID: 'i3', edge_weight: 1}]->(e6)
"""

CLEAR = Query("MATCH (n) DETACH DELETE n")

CONDITIONS: dict[str, list[dict[str, Any]]] = {
    "timestamp": [
        {"startDate": "2021-01-01T00:00:00.000Z", "endDate": "2021-01-02T23:59:59Z"},
        {"startDate": "2021-01-01T09:00:00+01:00", "endDate": "2021-01-03T10:00:00+01:00"},
    ],
    "performance": [{"entity": "order", "operator": op, "seconds": 3600 * 5} for op in filters.OPERATORS],
    "includeActivities": [{"activities": ["Create", "Ship"]}],
    "excludeActivities": [{"activities": ["Pack"]}, {"activities": ["Pack", "Pay"]}],
    "frequence": [{"entity": "order", "operator": op, "frequency": 2} for op in filters.OPERATORS],
    "variant": [{"entity": "order", "operator": op, "variant": 1} for op in filters.OPERATORS],
}


def counts(db) -> dict[str, int]:
    return service.graph_counts(db.run)


def fresh(db) -> None:
    db.run(CLEAR)
    db.run(Query(SAMPLE_GRAPH))


def main(uri: str) -> int:
    db = database.MemgraphDatabase(uri)
    by_key = {item.key: item for item in filters.builtin_filters()}
    checks: list[tuple[str, Callable[[], Any]]] = []

    # --- the six filters, every operator -------------------------------- #
    for key, conditions in CONDITIONS.items():
        for condition in conditions:
            def run_filter(key=key, condition=condition):
                item = by_key[key]
                for query in item.to_queries(item.validate(condition), filters.FilterContext(db.run)):
                    db.run(query)
            label = condition.get("operator") or ",".join(condition.get("activities", [])) or condition.get("startDate")
            checks.append((f"filter {key} {label}", run_filter))

    # --- "Nuova analisi" with combined filters --------------------------- #
    def combined():
        classes.build_classes(db.run, ["order"])
        analysis = analysis_module.Analysis.from_items("combined", [
            {"variant": "variant", "values": {"entity": "order", "operator": ">", "variant": 1}},
            {"variant": "excludeActivities", "values": {"activities": ["Pack"]}},
            {"variant": "timestamp", "values": CONDITIONS["timestamp"][0]},
            {"variant": "frequence", "values": {"entity": "order", "operator": ">=", "frequency": 1}},
        ], filters.builtin_filters())
        before = service.graph_counts(db.run)
        classes.delete_classes(db.run)  # what ekg_class_graph does on "analysis.before_apply"
        service.apply_filters(analysis.ordered(filters.builtin_filters()), db.run)
        return {"before (with classes)": before, "classes left": classes.class_counts(db.run)["class_nodes"]}
    checks.append(("analysis combined", combined))

    # --- rollback: advance fails half-way, the parent is rebuilt --------- #
    def rollback():
        tool = tool_module.MemgraphTool(db)
        tool.ensure_loaded("parent", lambda run: run(Query(SAMPLE_GRAPH)))
        original = counts(db)

        def mutate(run):
            for query in by_key["excludeActivities"].to_queries({"activities": ["Pack"]}, filters.FilterContext(run)):
                run(query)
            run(Query("THIS IS NOT CYPHER"))

        try:
            tool.advance("parent", "child", mutate)
        except Exception:  # noqa: BLE001 - expected
            pass
        else:
            raise AssertionError("the failing change did not fail")
        changed = counts(db)
        assert tool.current_state() is None, tool.current_state()
        assert tool.ensure_loaded("parent", lambda run: run(Query(SAMPLE_GRAPH))) is True
        rebuilt = counts(db)
        assert rebuilt == original, (rebuilt, original)
        return {"after the failure": changed, "rebuilt": rebuilt}
    checks.append(("rollback (advance + rebuild)", rollback))

    # --- the aggregate graph --------------------------------------------- #
    for types in (["order"], ["order", "item"]):
        def build(types=types):
            times = classes.build_classes(db.run, types)
            return {**classes.class_counts(db.run), "phases": len(times)}
        checks.append((f"class build {'+'.join(types)}", build))

    def with_classes(check):
        def run():
            classes.build_classes(db.run, ["order", "item"])
            return check()
        return run

    for query in class_queries.class_queries():
        def run_query(query=query):
            values = query.values({})
            return query.transform(db.run(query.build(values)), values)
        checks.append((f"class query {query.key}", with_classes(run_query)))
    for part in class_queries.class_parts():
        checks.append((f"class json part {part.key}", with_classes(lambda part=part: part.transform(db.run(part.query())))))
    view = class_views.ClassGraphView()
    for relations in (["DF_C"], ["OBSERVED"], ["DF_C", "OBSERVED"]):
        name = "|".join(relations)
        checks.append((f"class view edges {name}", with_classes(lambda r=relations: view.to_graph(db.run(view.edges_query(50, r))))))
        checks.append((f"class view max_data {name}", with_classes(lambda r=relations: db.run(view.max_data_query(r)))))
        checks.append((f"class view search edge {name}", with_classes(
            lambda r=relations: view.search_items(db.run(view.search_query("order", "edge", 0, 50, r)), "edge"))))
    checks.append(("class delete", with_classes(lambda: classes.delete_classes(db.run))))

    # --- "Indicatori di processo" ----------------------------------------- #
    for name, factory in (("trace durations", insights.trace_durations_query), ("activity occurrences", insights.activity_occurrences_query),
                          ("variants", insights.variants_query)):
        checks.append((f"insights {name}", lambda factory=factory: db.run(factory("order"))))
    checks.append(("insights frequency", lambda: db.run(insights.activity_frequency_query(2))))
    checks.append(("insights average duration",
                   lambda: insights.average([row["iso_duration"] for row in db.run(insights.trace_durations_query("order"))])))

    failures = []
    for name, check in checks:
        fresh(db)
        before = counts(db)
        try:
            result = check()
            after = counts(db)
        except Exception as exc:  # noqa: BLE001 - report every failure, then go on
            failures.append((name, exc))
            print(f"FAIL {name}: {exc}")
            traceback.print_exc(limit=1)
            continue
        print(f"ok   {name}: {_counts(before)} -> {_counts(after)}" + (f"  {_summary(result)}" if result is not None else ""))
    db.run(CLEAR)
    db.close()

    print(f"\n{len(checks) - len(failures)}/{len(checks)} checks ok")
    for name, exc in failures:
        print(f"  failed: {name}: {exc}")
    return 1 if failures else 0


def _counts(value: dict[str, int]) -> str:
    return f"{value['nodes']}n/{value['relationships']}r"


def _summary(result: Any) -> str:
    if isinstance(result, dict) and "nodes" in result and "edges" in result:
        return f"{len(result['nodes'])} nodes, {len(result['edges'])} edges"
    text = repr(result)
    return text if len(text) < 140 else text[:137] + "..."


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "bolt://localhost:17688"))
