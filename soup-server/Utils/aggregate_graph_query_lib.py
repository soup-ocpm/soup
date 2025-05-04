"""
------------------------------------------------------------------------
File : aggregate_graph_query_lib.py
Description: Cypher query library for aggregated EKG
Date creation: 29-01-2025
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""


# ---------- Standard queries ----------

def create_class_multi_query(matching_perspectives):
    """
    Create aggregate multi graph query
    :param matching_perspectives: the perspectives to match
    :return: the complete query
    """

    class_type = "Class"

    # Event_Id based on matching_perspectives
    event_id_parts = [f'{p.lower()}' for p in matching_perspectives]
    event_id = '"c_" + ' + ' + "_" + '.join(event_id_parts)

    perspectives_dict = {p: f"{p.lower()}" for p in matching_perspectives}
    perspectives_dict["Event_Id"] = event_id
    perspectives_dict["Type"] = f'"{class_type}"'

    # get unique vlaues / p.lower() is the variable name
    class_properties = ", ".join([f"{key}: {value}" for key, value in perspectives_dict.items()])
    with_distinct = "WITH DISTINCT " + ", ".join([f"e.{p} AS {p.lower()}" for p in matching_perspectives])

    # MERGE class nodes
    class_creation = f"MERGE (c:Class {{{class_properties}}})"

    # retrieve events 
    match_events = "MATCH (e:Event {" + ", ".join([f"{p}: {p.lower()}" for p in matching_perspectives]) + "})"

    # infer OBS relationship 
    merge_relationship = "MERGE (e)-[:OBSERVED]->(c)"

    # create final query
    main_query = f"MATCH (e:Event)\n{with_distinct}\n{class_creation}\nWITH c, " + ", ".join(
        [f"{p.lower()}" for p in matching_perspectives]) + "\n"
    main_query += f"{match_events}\n{merge_relationship}"
    return main_query


def class_df_aggregation(rel_type, class_rel_type):
    """
    Create direct follow aggregation query
    :param rel_type: the type
    :param class_rel_type: the class relation tye
    :return: the complete query
    """

    return f"""
            MATCH (c1 : Class) <-[:OBSERVED]- (e1 : Event) 
            -[r]-> (e2 : Event) -[:OBSERVED]-> (c2 : Class)
            WHERE c1.Type = c2.Type and type(r) = '{rel_type}'
            WITH r.Type as CType, c1, count(r) AS df_freq, c2
            MERGE (c1) -[:{class_rel_type} {{Type:CType, edge_weight: df_freq}}]-> (c2)
            """


# ---------- Util queries ----------

def get_nodes_class_query():
    """
    Get all class nodes
    :return: the query
    """

    return "MATCH (e:Class) RETURN e AS node"


def get_count_nodes_class_query():
    """
    Get all class nodes count
    :return: the query
    """

    return "MATCH (c:Class) RETURN COUNT(c) as class_count"


def get_obs_relation_query():
    """
    Get all observation relations query
    :return: the query
    """

    return "MATCH (e:Event)-[obs:OBSERVED]->(c:Class) RETURN e, obs, c"


def get_count_obs_relationships_query():
    """
    Get all observation relationships count query
    :return: the query
    """

    return "MATCH (e:Event)-[obs:OBSERVED]->(c:Class) RETURN COUNT(obs) as obs_count"


def get_dfc_relation_query():
    """
    Get all dfc relation query
    :return: the query
    """

    return "MATCH (c1:Class)-[dfc:DF_C]->(c2:Class) RETURN c1, dfc, c2"


def get_count_dfc_relationships_query():
    """
    Get all dfc relationships count query
    :return: the query
    """

    return "MATCH (c1:Class)-[dfc:DF_C]->(c2:Class) RETURN COUNT(dfc) as dfc_count"


def get_complete_class_graph_query():
    """
    Get complete class graph query
    :return: the query
    """

    return ("""
            MATCH (c1:Class)-[r:DF_C]->(c2:Class)
            RETURN c1 as source, id(c1) as source_id, properties(r) as edge, 
            id(r) as edge_id, c2 as target, id(c2) as target_id
            """)


def get_limit_class_graph_query(limit):
    """
    Get complete class graph with limit query
    :param limit: the limit
    :return: the complete query
    """

    return (f"""
            MATCH (c1:Class)-[r:DF_C]->(c2:Class)
            RETURN c1 as source, id(c1) as source_id, properties(r) as edge, 
            id(r) as edge_id, c2 as target, id(c2) as target_id
            LIMIT {limit}
            """)


def set_class_weight():
    """
    Set class weight
    :return: the query
    """

    return ("""
            MATCH (:Event)-[obs:OBSERVED]->(c:Class)
            WITH c, COUNT(obs) as weight
            SET c.Count = weight
            """)


def delete_class_graph_query():
    """
    Delete class graph
    :return: the query
    """

    return "MATCH (n:Class) DETACH DELETE n"


def get_count_class_nodes_query():
    """
    Get count of database data
    :return: the query
    """

    return "MATCH (n: Class) RETURN count(n) as count"
