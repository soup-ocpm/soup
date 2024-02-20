"""
-------------------------------
File : query_library.py
Description: Cypher query library for EKG
Date creation: 06-02-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""


def create_nodes_event_query(cypher_properties):
    return f"CREATE (e:Event {{EventID: $event_id, Timestamp: $timestamp, ActivityName: $activity_name, {', '.join(cypher_properties)}}})"


def create_nodes_entity_query():
    return "MERGE (e:Entity {Value: $property_value, Type: $type_value})"


def create_corr_rel_two_query(key):
    return ("MATCH (e:Event) "
            "MATCH (en: Entity) "
            f"WHERE en.Value = e.{key} "
            "MERGE (e)-[:CORR { Type: en.Value }] ->(en) ")


def create_corr_rel_query(key):
    return (f"MATCH(e:Event) UNWIND e.{key} AS val WITH e, val "
            "MATCH (n:Entity) WHERE n.Value = val MERGE (e)-[:CORR {Type: n.Value}]->(n)")


def create_df_rel_query(key):
    return ("MATCH (e1:Event), (e2:Event) "
            "WHERE e1 <> e2 "
            f"AND e1.{key} = e2.{key} "
            "AND e1.Timestamp < e2.Timestamp "
            "WITH e1, e2 "
            "ORDER BY e1.Timestamp ASC, e2.Timestamp ASC "
            "WITH e1, collect(e2) AS relatedNodes "
            "WITH e1, head(relatedNodes) AS nextNode "
            "MERGE (e1)-[:DF {Type: '" + key + "'}]->(nextNode) ")


def create_class_nodes_query(attribute_keys):
    query = "MATCH (e:Event) WITH "
    query += ", ".join(f"e.{key} AS {key}" for key in attribute_keys)
    query += ", COLLECT(e) AS events "

    query += "UNWIND events AS event WITH event, events, "
    query += "ALL(other IN events WHERE "
    query += f"ALL(prop IN {attribute_keys} WHERE event[prop] = other[prop])"
    query += ") AS allMatch "

    query += "FOREACH (prop IN CASE WHEN allMatch THEN [" + ", ".join(
        f"'{key}'" for key in attribute_keys) + "] ELSE [] END | "
    query += "MERGE (c:Class { "
    query += "Name: event.ActivityName, Type: 'Class', ID: event.ActivityName, "
    query += ", ".join(f"{key}: toString(event.{key})" for key in attribute_keys)
    query += " })) "

    query += "FOREACH (prop IN CASE WHEN NOT allMatch THEN [" + ", ".join(
        f"'{key}'" for key in attribute_keys) + "] ELSE [] END | "
    query += "MERGE (c:Class { "
    query += "Name: event.ActivityName, Type: 'Class', ID: event.ActivityName, "
    query += ", ".join(f"{key}: toString(event.{key})" for key in attribute_keys)
    query += " })) "

    return query


def create_observe_rel_one_two_query(filtered_column):
    query = ("MATCH (e:Event), (c:Class) "
             "WHERE e.ActivityName = c.Name AND (")
    for key in filtered_column:
        query += f"e.{key} = c.{key} AND "
    query = query[:-4]
    query += (") "
              "MERGE (e)-[:OBSERVED_C {Type: 'Activity'")
    for key in filtered_column:
        query += f", {key}: e.{key}"
    query += "}]->(c)"
    return query


def create_observe_rel_query(filtered_column):
    query = ("MATCH (e:Event) "
             "MATCH (c:Class) "
             "WHERE e.ActivityName = c.Name AND (")
    for key in filtered_column:
        query += f"e.{key} = c.{key} AND "
    query = query[:-4]
    query += (") "
              "MERGE (e)-[:OBSERVED_C{ Type: 'Activity'")
    for key in filtered_column:
        query += f" + CASE WHEN e.{key} = c.{key} THEN ', {key}' ELSE '' END"
    query += "}]->(c)"
    return query


def create_observe_rel_two_query(filtered_column):
    query = ("MATCH (e:Event) "
             "MATCH (en: Entity) "
             "MATCH (c: Class)"
             "WHERE NOT (e)-[:OBSERVED_C]->(en) AND NOT (e)-[:OBSERVED_C]->(c) "
             "MATCH (c: Class) "
             "WHERE e.ActivityName = c.Name AND (")

    for key in filtered_column:
        query += f"e.{key} = c.{key} OR "
    query = query[:-4]
    query += (") "
              "MERGE (e)-[:OBSERVED_C{ Type: 'Activity'")
    for key in filtered_column:
        query += f" + CASE WHEN e.{key} = c.{key} THEN ', {key}' ELSE '' END"
    query += "}]->(c)"
    return query


def create_observe_rel_two_two_query(filtered_column):
    query = (
        "MATCH (e:Event), (c:Class) "
        "WHERE e.ActivityName = c.Name AND ("
    )

    conditions = []
    for key in filtered_column:
        conditions.append(f"e.{key} = c.{key}")
    conditions_str = " OR ".join(conditions)

    # Aggiunta delle condizioni alla query
    query += conditions_str + ") "

    # Costruzione della clausola WHERE per le relazioni OBSERVED_C
    query += (
        "AND NOT EXISTS ((e)-[:OBSERVED_C]->(c:Class))"
    )

    # Creazione della relazione OBSERVED_C
    query += (
        "MERGE (e)-[:OBSERVED_C {Type: 'Activity'"
    )
    for key in filtered_column:
        query += f", {key}: e.{key}"
    query += (
        "}]->(c)"
    )

    return query


def create_df_c_query(key):
    return ("MATCH (c:Class)<-[:OBSERVED_C]-(e:Event) "
            "OPTIONAL MATCH (c1:Class)<-[:OBSERVED_C]-(e1:Event)<-[:DF]-(e:Event) "
            "WHERE e <> e1 "
            "AND e.Timestamp < e1.Timestamp "
            f"AND c.{key} = c1.{key}  "
            f"AND NOT (toString(c.{key}) = 'NaN' AND toString(c1.{key}) = 'NaN') "
            "WITH c, c1, e.Timestamp AS timestamp "
            "ORDER BY timestamp ASC "
            "FOREACH (ignored IN CASE WHEN c1 IS NOT NULL THEN [1] ELSE [] END | "
            "  MERGE (c)-[:DF_C {Type:'" + key + "'}]->(c1))")


def get_nodes_event_query():
    return """
            MATCH (e:Event) 
            RETURN e AS node
            """


def get_nodes_class_query():
    return """
            MATCH (e:Class) 
            RETURN e AS node
            """


def get_df_node_rel_query():
    return """
    MATCH (e:Event)-[r:DF]->(e1:Event)
    RETURN e, r.Type AS type, e1
    """


def get_df_2_node_rel_query():
    return """
            MATCH (e:Class)-[r:DF_C]->(dfRelated)
            RETURN ID(e) AS nodeId, e AS mainNode, r.Type AS type, ID(dfRelated) AS relatedNodeId
            """


def delete_graph_query():
    return "MATCH(n) DETACH DELETE n"


def get_count_data_query():
    return "MATCH (n) RETURN COUNT(n) AS count"
