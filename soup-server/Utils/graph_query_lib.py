"""
------------------------------------------------------------------------
File : graph_query_lib.py
Description: Cypher query library for standard EKG
Date creation: 29-01-2025
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""


# ---------- Standard queries ----------

def load_event_node_query(container_csv_path, event_id_col, timestamp_col, activity_col, cypher_properties):
    """
    Load function
    :param container_csv_path: the container csv file path
    :param event_id_col: the event id column
    :param timestamp_col: the timestamp column
    :param activity_col: the activity column
    :param cypher_properties: other properties
    :return: the load query
    """
    properties_string = ', '.join(cypher_properties)
    return (f"LOAD CSV FROM '{container_csv_path}' WITH HEADER AS row "
            f"CREATE (e:Event {{Event_Id: row.{event_id_col}, Timestamp: localDateTime(row.{timestamp_col}), ActivityName: row.{activity_col}, {properties_string}}});")


def create_node_event_query(cypher_properties):
    """
    Create event nodes query
    :param cypher_properties: the properties
    :return the query
    """
    return (
        f"CREATE (e:Event {{Event_Id: $event_id, Timestamp: localDateTime($timestamp), ActivityName: $activity_name, {', '.join(cypher_properties)}}})")


def load_entity_node_query(container_csv_path):
    """
    Load function for entity nodes
    :param container_csv_path: the container csv file path
    :return: the load entity node query
    """
    return (f"LOAD CSV FROM '{container_csv_path}' WITH HEADER AS row "
            f"MERGE (e:Entity {{Value: row.value, Type: row.type}})")


def create_event_index():
    """
    Create activity index for event nodes
    :return: the query
    """
    return """
        CREATE INDEX ON :Event(ActivityName);
    """


def create_event_index_time():
    """
    Create time index for event nodes
    :return: the query
    """
    return """
        CREATE INDEX ON :Event(Timestamp);
    """


def create_event_index_id():
    """
    Create id index for event nodes
    :return: the query
    """
    return """
        CREATE INDEX ON :Event(Event_Id);
    """


def create_entity_index():
    """
    Create index for nodes
    :return: the query
    """
    return "CREATE INDEX ON :Entity(Value)"


def create_corr_relation_query(key):
    """
    Create correlation query, checks if an entity has multiple values
    :param key: the key
    :return: the correlation query
    """
    return (f"""
            MATCH (e:Event) 
            WITH e, 
                CASE WHEN toString(e.{key}) <> "nan"
                    THEN split(e.{key}, ',')
                    ELSE [e.{key}]
                END AS entities
            UNWIND entities AS entity_id
            WITH DISTINCT entity_id, e
            MATCH (ent:Entity {{Value: entity_id}})
            MERGE (e)-[c:CORR {{Type: '{key}'}}]->(ent)
            """)


def create_df_relation_query(key):
    """
    Create direct follow query
    :param key: the key
    :return: the query for df relationships
    """
    return (f"""
            MATCH (e:Event)-[:CORR]->(n:Entity)
            WHERE n.Type = '{key}'
            WITH n, e AS nodes ORDER BY e.Timestamp, ID(e)
            WITH n, collect(nodes) AS event_node_list
            UNWIND range(0, size(event_node_list)-2) AS i
            WITH n, event_node_list[i] AS e1, event_node_list[i+1] AS e2
            MERGE (e1)-[df:DF {{ Type:n.Type, ID:n.Value, edge_weight: 1}}]->(e2)
            """)


# ---------- Util queries ----------

def get_nodes_event_query():
    """
    Get event nodes
    :return: the query
    """
    return "MATCH (e:Event) RETURN e AS node"


def get_count_nodes_event_query():
    """
    Get count of nodes events
    :return: the query
    """
    return " MATCH (n: Event) RETURN COUNT(n) as node_count "


def get_nodes_entity_query():
    """
    Get entity nodes
    :return: the query
    """
    return " MATCH (e:Entity) RETURN e AS node"


def get_nodes_entity_query_distinct():
    """
    Get distinct entity nodes
    :return: the query
    """

    return """
            MATCH (e:Entity)
            WITH e.Type AS type, collect(e)[0] AS node
            RETURN type, node
            """


def get_count_nodes_entity_query():
    """
    Get count of entity nodes
    :return: the query
    """
    return " MATCH (n: Entity) RETURN COUNT(n) as entity_count"


def get_nodes_details_query():
    """
    Get node details query
    :return: the query
    """
    return ("""
            MATCH (event:Event)
            WITH collect(event) AS data, 'events' AS type, size(collect(event)) AS count
            RETURN data, type, count
            UNION
            MATCH (entity:Entity)
            WITH collect(entity) AS data, 'entities' AS type, size(collect(entity)) AS count
            RETURN data, type, count
            """)


def get_nodes_details_length_query(limit):
    """
    Get node details with limit
    :param limit: the    :return:  query
    """
    return (f"""
            MATCH (event:Event)
            WITH collect(event) AS data, 'events' AS type, size(collect(event)) AS count
            RETURN data, type, count
            LIMIT {limit}
            UNION
            MATCH (entity:Entity)
            WITH collect(entity) AS data, 'entities' AS type, size(collect(entity)) AS count
            RETURN data, type, count
            LIMIT {limit}
            """)


def get_corr_relation_query():
    """
    Get correlation relationships query
    :return: the query
    """
    return "MATCH (e:Event)-[corr:CORR]->(e1:Entity) RETURN e, corr, e1"


def get_count_corr_rel_query():
    """
    Get count of correlation relationships query
    :return: the query
    """
    return "MATCH (e:Event)-[corr:CORR]->(e1:Entity) RETURN COUNT(corr) as corr_count"


def get_df_relation_query():
    """
    Get df relationships query
    :return: the query
    """
    return "MATCH (e:Event)-[df:DF]->(e1:Event) RETURN e, df, e1"


def get_count_df_rel_query():
    """
    Get count of df relationships query
    :return: the query
    """
    return "MATCH (e:Event)-[df:DF]->(e1:Event) RETURN COUNT(df) as df_count"


def get_complete_standard_graph_query():
    """
    Get complete standard graph query
    :return: the query
    """
    return ("""
            MATCH (e1:Event)-[r:DF]->(e2:Event)
            RETURN e1 as source, id(e1) as source_id, properties(r) as edge, 
            id(r) as edge_id, e2 as target, id(e2) as target_id
            """)


def get_limit_standard_graph_query(limit):
    """
    Get limit standard graph query
    :param limit: the limit
    :return: the query
    """
    return f"""
            MATCH (e1:Event)-[r:DF]->(e2:Event)
            RETURN e1 as source, id(e1) as source_id, properties(r) as edge, 
            id(r) as edge_id, e2 as target, id(e2) as target_id
            LIMIT {limit}
            """


def get_nan_entities():
    """
    Get nan entities from event nodes
    :return: the query
    """
    return ("""
            MATCH (e:Event)
            WITH e, properties(e) AS props
            UNWIND keys(props) AS prop
            WITH e, prop, props[prop] AS value
            WHERE toString(value) = 'nan' OR toString(value) = ''
            WITH DISTINCT prop, count(DISTINCT e) AS nodeCount
            RETURN prop, nodeCount
            """)


def get_activities_name_query():
    """
    Get all different activities name by the nodes
    :return: the query
    """
    return ("""
            MATCH (n) 
            WHERE n.ActivityName IS NOT NULL
            RETURN COLLECT(DISTINCT n.ActivityName) AS activityNames
            """)


def get_min_max_timestamp_query():
    """
    Get min and max timestamp from the nodes
    :return: the query
    """

    return ("""
            MATCH (n)
            WHERE n.Timestamp IS NOT NULL
            RETURN 
            MIN(n.Timestamp.year * 10000000000 + n.Timestamp.month * 100000000 + n.Timestamp.day * 1000000 + n.Timestamp.hour * 10000 + n.Timestamp.minute * 100 + n.Timestamp.second) AS minTimestamp,
            MAX(n.Timestamp.year * 10000000000 + n.Timestamp.month * 100000000 + n.Timestamp.day * 1000000 + n.Timestamp.hour * 10000 + n.Timestamp.minute * 100 + n.Timestamp.second) AS maxTimestamp
            """)


def change_nan(entity):
    """
    Change specific property
    :param entity: the entity
    :return: the query
    """
    entity = entity.replace("'", "")
    return f"""
            MATCH (n:Event)
            SET n.{entity} = toString(n.{entity})
            """


def get_distinct_entities_keys():
    """
    Get distinct entities keys
    :return: the query
    """
    return ("""
            MATCH (n:Entity) 
            WITH DISTINCT n.Type as entityType
            RETURN entityType
            """)


def delete_event_graph_query():
    """
    Delete event graph query
    :return: the query
    """
    return "MATCH(e: Event) DETACH DELETE e"


def delete_entity_graph_query():
    """
    Delete entity graph query
    :return: the query
    """
    return "MATCH (e:Entity) DETACH DELETE e"
