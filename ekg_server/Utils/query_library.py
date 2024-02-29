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


# Query for Graph (Standard)
def create_node_event_query(cypher_properties):
    return f"CREATE (e:Event {{EventID: $event_id, Timestamp: $timestamp, ActivityName: $activity_name, {', '.join(cypher_properties)}}})"


def create_node_entity_query():
    return "MERGE (e:Entity {Value: $property_value, Type: $type_value})"


def create_corr_relation_query(key):
    return ("MATCH (e:Event) "
            "MATCH (en: Entity) "
            f"WHERE en.Value = e.{key} "
            "MERGE (e)-[:CORR { Type: en.Value }] ->(en) ")


def create_df_relation_query(key):
    return ("MATCH (e1:Event), (e2:Event) "
            "WHERE e1 <> e2 "
            f"AND e1.{key} = e2.{key} "
            "AND e1.Timestamp < e2.Timestamp "
            "WITH e1, e2 "
            "ORDER BY e1.Timestamp ASC, e2.Timestamp ASC "
            "WITH e1, collect(e2) AS relatedNodes "
            "WITH e1, head(relatedNodes) AS nextNode "
            "MERGE (e1)-[:DF {Type: '" + key + "'}]->(nextNode) ")


# Query for Graph (Class)
def create_node_class_query(attribute_keys):
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


def create_obs_relation_query(filtered_column):
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


def create_full_obs_relation_query(filtered_column):
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


def create_full_obs_relation_query_two(filtered_column):
    query = (
        "MATCH (e:Event), (c:Class) "
        "WHERE e.ActivityName = c.Name AND ("
    )
    conditions = []
    for key in filtered_column:
        conditions.append(f"e.{key} = c.{key}")
    conditions_str = " OR ".join(conditions)

    query += conditions_str + ") "

    query += (
        "AND NOT EXISTS ((e)-[:OBSERVED_C]->(c:Class))"
    )

    query += (
        "MERGE (e)-[:OBSERVED_C {Type: 'Activity'"
    )
    for key in filtered_column:
        query += f", {key}: e.{key}"
    query += (
        "}]->(c)"
    )

    return query


def create_class_df_relation_query(key):
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


# Other utils query for Graph (Standard)
def get_nodes_event_query():
    return """
            MATCH (e:Event) 
            RETURN e AS node
            """


def get_nodes_entity_query():
    return """
            MATCH (e:Entity)
            RETURN e AS node
            """


def get_nodes_details_query():
    return """
            MATCH (event:Event)
            WITH collect(event) AS data, 'events' AS type, size(collect(event)) AS count
            RETURN data, type, count
            UNION
            MATCH (entity:Entity)
            WITH collect(entity) AS data, 'entities' AS type, size(collect(entity)) AS count
            RETURN data, type, count
            """


def get_corr_relation_query():
    return """
            MATCH (e: Event)-[corr:CORR]->(en:Entity)
            RETURN e, corr, en
            """


def get_df_relation_query():
    return """
            MATCH (e:Event)-[df:DF]->(e1:Event)
            RETURN e, df, e1
            """


# Other utils query for Graph (Class)
def get_nodes_class_query():
    return """
            MATCH (e:Class) 
            RETURN e AS node
            """


def get_df_class_relation_query():
    return """
            MATCH (e:Class)-[r:DF_C]->(dfRelated)
            RETURN ID(e) AS nodeId, e AS mainNode, r.Type AS type, ID(dfRelated) AS relatedNodeId
            """


# Other utils query (supports)
def delete_graph_query():
    return "MATCH(e: Event) DETACH DELETE e"


def get_count_graph_query():
    return "MATCH (n : Event) RETURN COUNT(n) AS count"


def delete_class_graph_query():
    return "MATCH(n: Class) DETACH DELETE n"


def get_count_class_graph_query():
    return "MATCH (c: Class) RETURN COUNT(c) AS count"
