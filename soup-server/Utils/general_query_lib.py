"""
------------------------------------------------------------------------
File : general_query_lib.py
Description: General Cypher queries
Date creation: 06-02-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""


# ---------- Generic query ----------


def get_count_data_query():
    """
    Get count of database data
    :return: the query
    """
    return "MATCH (n) RETURN count(n) as count"


def get_count_event_nodes_query():
    """
    Get count of database data
    :return: the query
    """
    return "MATCH (n: Event) RETURN count(n) as count"


def get_max_standard_graph_data():
    """
    Get max standard graph data to show
    :return: the query
    """

    return """
            MATCH (e1:Event)-[r:DF]->(e2:Event)
            WITH collect(DISTINCT e1) + collect(DISTINCT e2) AS allNodes, collect(DISTINCT r) AS allRels
            RETURN size(apoc.coll.toSet(allNodes)) AS totalNodes, size(allRels) AS totalRels
            """


def get_max_aggregate_graph_data():
    """
    Get max aggregate graph data to show
    :return: the query
    """

    return """
            MATCH (c1:Class)-[r:DF_C]->(c2:Class)
            WITH collect(DISTINCT c1) + collect(DISTINCT c2) AS allNodes, collect(DISTINCT r) AS allRels
            RETURN size(apoc.coll.toSet(allNodes)) AS totalNodes, size(allRels) AS totalRels
            """


def drop_entity_index():
    """
    Drop entity index
    :return: the query
    """
    return "DROP INDEX ON :Entity(Value)"


def drop_event_index():
    """
    Drop event index
    :return: the query
    """
    return "DROP INDEX ON :Event(Event_Id)"


def delete_all_data_query():
    """
    Delete all data inside database
    :return: the query
    """
    return "MATCH (n) DETACH DELETE n"


def create_first_time_node_query():
    """
    Create first time use node
    :return: the query
    """

    return ("MERGE (n:OnBoarding {id: 'global'}) ON CREATE "
            "SET n.FirstTime = true RETURN n")


def get_first_time_node_query():
    """
    Get first time use node
    :return: the query
    """

    return "MATCH (n:OnBoarding) RETURN n LIMIT 1"
