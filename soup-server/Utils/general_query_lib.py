"""
------------------------------------------------------------------------
File : general_query_lib.py
Description: Cypher query library for EKG
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

def drop_entity_index():
    """
    Drop entity index
    :return: the query
    """
    return "DROP INDEX ON :Entity(Value)"


def delete_all_data_query():
    """
    Delete all data inside database
    :return: the query
    """
    return "MATCH (n) DETACH DELETE n"
