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


def create_entity_from_events(entity_type):
    return f""" MATCH (e:Event) 
                UNWIND e[{entity_type}] AS entity_name
                WITH DISTINCT entity_name
                MERGE (n:Entity {{entity_id: entity_name, type: '{entity_type}'}})
                RETURN keys(n) LIMIT 1
            """


def create_corr_relation_query(key):
    return ("MATCH (e:Event) "
            "MATCH (en: Entity) "
            f"WHERE en.Value = e.{key} "
            "MERGE (e)-[:CORR { Type: en.Value }] -> (en) ")


def create_df_relation_query(key):
    return  f"""
            MATCH (e:Event)-[:CORR]->(n:Entity)
            WHERE n.Type = '{key}'
            WITH n, e AS nodes ORDER BY e.Timestamp, ID(e)
            WITH n, collect(nodes) AS event_node_list
            UNWIND range(0, size(event_node_list)-2) AS i
            WITH n, event_node_list[i] AS e1, event_node_list[i+1] AS e2
            MERGE (e1)-[df:DF {{ Type:n.Type, ID:n.entity_id, edge_weight: 1}}]->(e2)
            """


def create_class_multi_query(matching_perspectives):
    class_type = 'Class'
    main_query = 'MATCH (e:Event)\n'

    perspectives_dict = {}
    event_id = '"c_" + '
    for p in matching_perspectives:
        p_val = f'e.{p}'
        event_id += f' {p_val}'
        perspectives_dict[p] = p_val
        if p != matching_perspectives[-1]:
            event_id += ' + "_" +'

    perspectives_dict['Event_Id'] = event_id
    perspectives_dict['Type'] = f'"{class_type}"'
    res_dict = str(perspectives_dict).replace("'", "")

    class_creation = f'MERGE (c:Class {res_dict})'
    
    main_query += class_creation + '\n WITH c, e' + '\n MERGE (e) -[:OBSERVED]-> (c)' 

    return main_query


def class_df_aggregation(rel_type, class_rel_type):
    return f"""
                MATCH (c1 : Class) <-[:OBSERVED]- (e1 : Event) -[r]-> (e2 : Event) -[:OBSERVED]-> (c2 : Class)
                WHERE c1.Type = c2.Type and type(r) = '{rel_type}'
                WITH r.Type as CType, c1, count(r) AS df_freq, c2
                MERGE (c1) -[:{class_rel_type} {{Type:CType, edge_weight: df_freq}}]-> (c2)
            """



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
def delete_event_graph_query():
    return "MATCH(e: Event) DETACH DELETE e"


def get_count_graph_query():
    return "MATCH (n : Event) RETURN COUNT(n) AS count"


def delete_class_graph_query():
    return "MATCH(n: Class) DETACH DELETE n"


def get_count_class_graph_query():
    return "MATCH (c: Class) RETURN COUNT(c) AS count"


def delete_graph_query():
    return "MATCH (e) DETACH DELETE e"