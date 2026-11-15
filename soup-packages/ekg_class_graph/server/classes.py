"""
------------------------------------------------------------------------
File : classes.py
Description: The aggregate graph on Memgraph (the legacy
             ClassGraphService.class_process_query of
             Services/AggregateGraph/aggregate_graph_service.py and
             Utils/aggregate_graph_query_lib.py):
             - build_classes(run, entity_types): the properties of the
               events with "nan" or empty values become text (change_nan),
               one :Class node per distinct combination of ActivityName
               and any optionally chosen entity types (create_class_multi_query) with its
               :OBSERVED events, the weight c.Count (set_class_weight) and
               the :DF_C relationships between classes aggregated from :DF
               (class_df_aggregation); returns the times of the phases in
               the keys of the legacy process_info (init/finish_class,
               class_node, obs, dfc);
             - delete_classes(run): MATCH (n:`Class`) DETACH DELETE n,
               then checks that no Class node is left by counting the
               Class nodes (the legacy delete_graph_s of the standard graph
               read the count from a column its queries did not return).
             Every label, type and property goes through ident(); the
             entity types come from the closed list of the graph's types,
             the variables are v0, v1... (the legacy code used the
             lower-cased property names: "Order" and "order" collided, a
             space broke the query); the property names read from the
             graph (change_nan) are quoted too, and one that ident()
             refuses is skipped (the legacy code put it in the text as it
             was, removing only the quotes); :DF_C is aggregated from
             the pattern -[r:`DF`]-> instead of type(r) = 'DF'.
Project : soup-packages/ekg_class_graph
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime
from typing import Any, cast

from soup_pkg_ekg.api import Query, ident
from soup_pkg_ekg_views.api import count_of

from soup.core.contracts import DomainError, ValidationError

EVENT = "Event"
ENTITY = "Entity"
DF = "DF"
CLASS = "Class"
OBSERVED = "OBSERVED"
DF_C = "DF_C"

# ProcessTimer's format: "2025-01-01T10:00:00.123".
_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S.%f"

Run = Callable[[Query], list[dict[str, Any]]]


def _now() -> str:
    return datetime.now().strftime(_DATE_FORMAT)[:-3]


def entity_types_query() -> Query:
    return Query(f"MATCH (n:{ident(ENTITY)}) WHERE n.Type IS NOT NULL "
                 "RETURN DISTINCT n.Type AS entity_type ORDER BY entity_type")


def nan_properties_query() -> Query:
    # get_nan_entities.
    return Query(f"""
            MATCH (e:{ident(EVENT)})
            WITH e, properties(e) AS props
            UNWIND keys(props) AS prop
            WITH e, prop, props[prop] AS value
            WHERE toString(value) = 'nan' OR toString(value) = ''
            WITH DISTINCT prop, count(DISTINCT e) AS node_count
            RETURN prop, node_count""")


def as_text_query(prop: str) -> Query:
    # change_nan.
    return Query(f"MATCH (n:{ident(EVENT)}) SET n.{ident(prop)} = toString(n.{ident(prop)})")


def class_query(entity_types: Sequence[str]) -> Query:
    """Group by ActivityName AND each optionally selected entity property.

    An empty selection still builds the activity-only class graph. Entity
    properties are event attributes, as in legacy SOUP's filtered_columns;
    they are *not* entity-node IDs or separate graph joins.
    """

    # ActivityName is an invariant, not a user-selectable entity dimension.
    # Deduplicate to keep the Cypher map and event identifier unambiguous.
    dimensions = ["ActivityName"]
    for name in entity_types:
        if name != "ActivityName" and name not in dimensions:
            dimensions.append(name)
    variables = [f"v{index}" for index in range(len(dimensions))]
    pairs = list(zip(dimensions, variables, strict=False))
    distinct = ", ".join(f"e.{ident(name)} AS {var}" for name, var in pairs)
    properties = ", ".join(f"{ident(name)}: {var}" for name, var in pairs)
    event_id = ' + "_" + '.join(f"toString({var})" for var in variables)
    text = f"""
            MATCH (e:{ident(EVENT)})
            WITH DISTINCT {distinct}
            MERGE (c:{ident(CLASS)} {{{properties}, Event_Id: "c_" + {event_id}, Type: $class_type}})
            WITH c, {", ".join(variables)}
            MATCH (e:{ident(EVENT)} {{{properties}}})
            MERGE (e)-[:{ident(OBSERVED)}]->(c)"""
    return Query(text, {"class_type": CLASS})


def class_weight_query() -> Query:
    # set_class_weight.
    return Query(f"""
            MATCH (:{ident(EVENT)})-[obs:{ident(OBSERVED)}]->(c:{ident(CLASS)})
            WITH c, count(obs) AS weight
            SET c.Count = weight""")


def class_df_query() -> Query:
    # class_df_aggregation(rel_type='DF', class_rel_type='DF_C').
    pattern = (
        f"(c1:{ident(CLASS)})<-[:{ident(OBSERVED)}]-(e1:{ident(EVENT)})"
        f"-[r:{ident(DF)}]->(e2:{ident(EVENT)})-[:{ident(OBSERVED)}]->(c2:{ident(CLASS)})"
    )
    return Query(f"""
            MATCH {pattern}
            WHERE c1.Type = c2.Type
            WITH r.Type AS c_type, c1, count(r) AS df_freq, c2
            MERGE (c1)-[:{ident(DF_C)} {{Type: c_type, edge_weight: df_freq}}]->(c2)""")


def delete_classes_query() -> Query:
    # delete_class_graph_query.
    return Query(f"MATCH (n:{ident(CLASS)}) DETACH DELETE n")


def count_classes_query() -> Query:
    return Query(f"MATCH (n:{ident(CLASS)}) RETURN count(n) AS count")


def count_relationships_query(rel_type: str) -> Query:
    return Query(f"MATCH ()-[r:{ident(rel_type)}]->() RETURN count(r) AS count")


def class_counts(run: Run) -> dict[str, int]:
    """The counts of create_class_graph_s: class nodes, :OBSERVED and :DF_C."""

    return {
        "class_nodes": count_of(run(count_classes_query())),
        "obs_rel": count_of(run(count_relationships_query(OBSERVED))),
        "dfc_rel": count_of(run(count_relationships_query(DF_C))),
    }


def build_classes(run: Run, entity_types: Sequence[str]) -> dict[str, str]:
    """Build the aggregate graph on the loaded EKG; return the times of its phases."""

    times = {"init_class_time": _now()}
    rows = run(nan_properties_query())
    times["init_class_node_time"] = _now()
    for row in rows:
        try:
            query = as_text_query(cast(str, row.get("prop")))
        except ValueError:
            # Not a property name ident() can quote: never one of the
            # columns of the event log, which are normalized.
            continue
        run(query)
    times["init_obs_time"] = _now()
    run(class_query(entity_types))
    run(class_weight_query())
    times["finish_class_node_time"] = times["finish_obs_time"] = _now()
    times["init_dfc_time"] = _now()
    run(class_df_query())
    times["finish_dfc_time"] = times["finish_class_time"] = _now()
    return times


def delete_classes(run: Run) -> None:
    """:raises DomainError: some Class node is still there after the deletion"""

    run(delete_classes_query())
    left = count_of(run(count_classes_query()))
    if left:
        raise DomainError(f"The aggregate graph was not deleted: {left} Class nodes are left")
