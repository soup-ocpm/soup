"""
------------------------------------------------------------------------
File : query_library.py
Description: Cypher query library for EKG
Date creation: 06-02-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from datetime import datetime


# ----------Query for Standard Graph----------

def load_event_node_query(container_csv_path, event_id_col, timestamp_col, activity_col, cypher_properties):
    properties_string = ', '.join(cypher_properties)
    return (f"LOAD CSV FROM '{container_csv_path}' WITH HEADER AS row "
            f"CREATE (e:Event {{EventID: row.{event_id_col}, Timestamp: localDateTime(row.{timestamp_col}), ActivityName: row.{activity_col}, {properties_string}}});")


def create_node_event_query(cypher_properties):
    return f"CREATE (e:Event {{EventID: $event_id, Timestamp: localDateTime($timestamp), ActivityName: $activity_name, {', '.join(cypher_properties)}}})"


def load_entity_node_query(container_csv_path):
    return (f"LOAD CSV FROM '{container_csv_path}' WITH HEADER AS row "
            f"MERGE (e:Entity {{Value: row.value, Type: row.type}})")


def create_node_entity_query():
    return "MERGE (e:Entity {Value: $property_value, Type: $type_value})"


def create_entity_from_events(entity_type):
    return f""" MATCH (e:Event) 
                UNWIND e[{entity_type}] AS entity_name
                WITH DISTINCT entity_name
                MERGE (n:Entity {{entity_id: entity_name, type: '{entity_type}'}})
                RETURN keys(n) LIMIT 1
            """


def create_entity_index():
    return ("""
           CREATE INDEX ON :Entity(Value)
           """)


def create_corr_relation_query(key):  # checks if an entity has multiple values
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
    return f"""
            MATCH (e:Event)-[:CORR]->(n:Entity)
            WHERE n.Type = '{key}'
            WITH n, e AS nodes ORDER BY e.Timestamp, ID(e)
            WITH n, collect(nodes) AS event_node_list
            UNWIND range(0, size(event_node_list)-2) AS i
            WITH n, event_node_list[i] AS e1, event_node_list[i+1] AS e2
            MERGE (e1)-[df:DF {{ Type:n.Type, ID:n.Value, edge_weight: 1}}]->(e2)
            """


def create_class_multi_query(matching_perspectives):
    class_type = 'Class'
    main_query = f'MATCH (e:Event) \n'

    perspectives_dict = {}
    event_id = '"c_" + '

    for i, p in enumerate(matching_perspectives):
        p_val = f'e.{p}'
        event_id += f' {p_val}'
        perspectives_dict[p] = p_val
        if i != len(matching_perspectives) - 1:
            event_id += ' + "_" +'

    perspectives_dict['Event_Id'] = event_id
    perspectives_dict['Type'] = f'"{class_type}"'

    res_dict = str(perspectives_dict).replace("'", "")

    class_creation = f'MERGE (c:Class {res_dict})'

    main_query += class_creation + '\n WITH c, e' + '\n MERGE (e) -[:OBSERVED]-> (c)'

    return main_query


def class_df_aggregation(rel_type, class_rel_type):
    return f"""
            MATCH (c1 : Class) <-[:OBSERVED]- (e1 : Event) 
            -[r]-> (e2 : Event) -[:OBSERVED]-> (c2 : Class)
            WHERE c1.Type = c2.Type and type(r) = '{rel_type}'
            WITH r.Type as CType, c1, count(r) AS df_freq, c2
            MERGE (c1) -[:{class_rel_type} {{Type:CType, edge_weight: df_freq}}]-> (c2)
            """


# ----------Utils query for Standard graph----------

def get_nodes_event_query():
    return f"""
            MATCH (e:Event) 
            RETURN e AS node
            """


def get_count_nodes_event_query():
    return f"""
            MATCH (n: Event)
            RETURN COUNT(n) as node_count
            """


def get_nodes_entity_query():
    return f"""
            MATCH (e:Entity)
            RETURN e AS node
            """


def get_count_nodes_entity_query():
    return f"""
            MATCH (n: Entity)
            RETURN COUNT(n) as entity_count
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


def get_nodes_details_length_query(limit):
    return f"""
            MATCH (event:Event)
            WITH collect(event) AS data, 'events' AS type, size(collect(event)) AS count
            RETURN data, type, count
            LIMIT {limit}
            UNION
            MATCH (entity:Entity)
            WITH collect(entity) AS data, 'entities' AS type, size(collect(entity)) AS count
            RETURN data, type, count
            LIMIT {limit}
            """


def get_corr_relation_query():
    return f"""
            MATCH (e:Event)-[corr:CORR]->(e1:Entity)
            RETURN e, corr, e1
            """


def get_count_corr_rel_query():
    return f"""
            MATCH (e:Event)-[corr:CORR]->(e1:Entity)
            RETURN COUNT(corr) as corr_count
            """


def get_df_relation_query():
    return f"""
            MATCH (e:Event)-[df:DF]->(e1:Event)
            RETURN e, df, e1
            """


def get_count_df_rel_query():
    return f"""
            MATCH (e:Event)-[df:DF]->(e1:Event)
            RETURN COUNT(df) as df_count
            """


def get_complete_standard_graph_query():
    return f"""
            MATCH (e1:Event)-[r:DF]->(e2:Event)
            RETURN e1 as source, id(e1) as source_id, properties(r) as edge, 
            id(r) as edge_id, e2 as target, id(e2) as target_id
            """


def get_limit_standard_graph_query(limit):
    return f"""
            MATCH (e1:Event)-[r:DF]->(e2:Event)
            RETURN e1 as source, id(e1) as source_id, properties(r) as edge, 
            id(r) as edge_id, e2 as target, id(e2) as target_id
            LIMIT {limit}
            """


def get_nan_entities():
    return f"""
            MATCH (e:Event)
            WITH e, properties(e) AS props
            UNWIND keys(props) AS prop
            WITH e, prop, props[prop] AS value
            WHERE toString(value) = 'nan' OR toString(value) = ''
            WITH DISTINCT prop, count(DISTINCT e) AS nodeCount
            RETURN prop, nodeCount
    """


def change_nan(entity):
    entity = entity.replace("'", "")
    return f"""
            MATCH (n:Event)
            SET n.{entity} = toString(n.{entity})
            """


def get_distinct_entities_keys():
    return f"""
            MATCH (n:Entity) 
            WITH DISTINCT n.Type as entityType
            RETURN entityType
            """


# ----------Utils query for Class graph----------

def get_nodes_class_query():
    return f"""
            MATCH (e:Class) 
            RETURN e AS node
            """


def get_count_nodes_class_query():
    return f"""
            MATCH (c:Class)
            RETURN COUNT(c) as class_count
    """


def get_count_obs_relationships_query():
    return f"""
    MATCH (e:Event)-[obs:OBSERVED]->(c:Class)
    RETURN COUNT(obs) as obs_count
    """


def get_count_dfc_relationships_query():
    return f"""
    MATCH (c1:Class)-[dfc:DF_C]->(c2:Class)
    RETURN COUNT(dfc) as dfc_count
    """


def get_complete_class_graph_query():
    return f"""
            MATCH (c1:Class)-[r:DF_C]->(c2:Class)
            RETURN c1 as source, id(c1) as source_id, properties(r) as edge, 
            id(r) as edge_id, c2 as target, id(c2) as target_id
            """


def get_limit_class_graph_query(limit):
    return f"""
            MATCH (c1:Class)-[r:DF_C]->(c2:Class)
            RETURN c1 as source, id(c1) as source_id, properties(r) as edge, 
            id(r) as edge_id, c2 as target, id(c2) as target_id
            LIMIT {limit}
            """


def get_df_class_relation_simple_query():
    return f"""
            MATCH (c:Class)-[df_c:DF_C]->(c1:Class)
            RETURN c, df_c, c1
            """


def get_df_class_relation_query():
    return """
            MATCH (e:Class)-[r:DF_C]->(dfRelated)
            RETURN ID(e) AS nodeId, e AS mainNode, r.Type AS type, ID(dfRelated) AS relatedNodeId
            """


def set_class_weight():
    return f"""
            MATCH (:Event)-[obs:OBSERVED]->(c:Class)
            WITH c, COUNT(obs) as weight
            SET c.Count = weight
            """


# ----------Utils query for Filters SOuP Filters----------


def timestamp_filter_query(start_timestamp, end_timestamp):
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE e1.Timestamp >= localDateTime({start_timestamp}) AND e1.Timestamp <= localDateTime({end_timestamp}) "
            f"AND e2.Timestamp >= localDateTime({start_timestamp}) AND e2.Timestamp <= localDateTime({end_timestamp}) "
            f"RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
            f"id(r) as edge_id, e2 as target, id(e2) as target_id ")


def performance_filter_name_query(start_activity_name, end_activity_name, duration):
    return (f"MATCH (start: Event {{ActivityName: '{start_activity_name}'}}) "
            f"MATCH (end: Event {{ActivityName: '{end_activity_name}'}}) "
            f"WHERE start.Timestamp < end.Timestamp "
            f"WITH start, end, duration.between(start.Timestamp, end.Timestamp) "
            f"AS duration "
            f"WHERE duration.seconds > {duration} "
            f"MERGE (start)-[r:HAS_DURATION {{duration_seconds: duration.seconds}}]->(end) "
            f"RETURN start, r, end")


def include_activity_filter_query(activities):
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE e1.ActivityName = '{activities}' AND e2.ActivityName = '{activities}' "
            f"RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
            f"id(r) as edge_id, e2 as target, id(e2) as target_id ")


def exclude_activity_filter_query(activities):
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE NOT (e1.ActivityName = '{activities}' AND e2.ActivityName = '{activities}') "
            f"RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
            f"id(r) as edge_id, e2 as target, id(e2) as target_id ")


def frequency_filter_query(frequency):
    return (f"MATCH (e1:Event) "
            f"WITH e.ActivityName AS activities, COUNT(e) AS frequency "
            f"WHERE frequency >= {frequency} "
            f"RETURN activities, frequency "
            f"ORDER BY frequency ASC ")


def variation_filter_query():
    query = """
    MATCH (start:Event)-[:DF*]->(end:Event)
    WITH start.EventID AS caseId, COLLECT(start.ActivityName) + COLLECT(end.ActivityName) AS activities,
    duration.between(start.Timestamp, end.Timestamp) AS duration
    RETURN activities, AVG(duration.seconds) AS avg_duration, COUNT(*) AS frequency
    ORDER BY avg_duration ASC;
    """
    return query


# ----------Utils query for graph----------


def get_count_data_query():
    return "MATCH (n) RETURN count(n) as count"


# ----------Delete query----------

def delete_event_graph_query():
    return (f"MATCH(e: Event) "
            f"DETACH DELETE e")


def delete_entity_graph_query():
    return f"""
    MATCH (e:Entity)
    DETACH DELETE e
    """


def drop_entity_index():
    return "DROP INDEX ON :Entity(Value)"


def delete_class_graph_query():
    return f"""
    MATCH (n:Class)
    DETACH DELETE n
    """


def delete_all_data_query():
    return "MATCH (n) DETACH DELETE n"
