"""
------------------------------------------------------------------------
File : support_config.py
Description: Graph configuration support functions
Date creation: 00-00-0000
Project : soup-server
Author: Sara Pettinari
Copyright: Copyright (c) 2024 Sara Pettinari <sara.pettinari@gssi.it>
License : MIT
------------------------------------------------------------------------
"""

# Import
import os
import datetime

from Models.memgraph_connector_model import MemgraphConnector

# Context variables
debug = False


def get_db_connector():
    """
    Get the database configuration
    :return: ApiResponse model
    """

    if not debug:
        memgraph_host = os.getenv("MEMGRAPH_HOST", "memgraph")
        memgraph_port = int(os.getenv("MEMGRAPH_PORT", 7687))
        uri_mem = f'bolt://{memgraph_host}:{memgraph_port}'
        auth_mem = ("", "")
        database_connector = MemgraphConnector(uri_mem, auth_mem)
    else:
        uri_mem = 'bolt://localhost:7687'
        auth_mem = ("", "")
        database_connector = MemgraphConnector(uri_mem, auth_mem)

    return database_connector


def string_to_datetime(timestamp_str):
    """
    Convert a string to datetime
    """

    return datetime.datetime.fromisoformat(timestamp_str)


def neo_datetime_conversion(time):
    """
    Convert string or Neo4j datetime to datetime object library
    """

    if isinstance(time, str):
        time = string_to_datetime(time)

    if isinstance(time, datetime.datetime):
        millis = int(time.nanosecond / 1000) if hasattr(time, 'nanosecond') else 0
        t = datetime.datetime(time.year, time.month, time.day,
                              time.hour, time.minute, time.second, millis)
        return t
    else:
        raise ValueError("Timestamp format is not valid")


def serialize_datetime(obj):
    """
    Serialize datetime object
    """

    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    raise TypeError("Type not serializable")


# Datetime object to json
def datetime_to_json(time):
    """
    Datetime object to json
    """

    timestamp = neo_datetime_conversion(time)
    return serialize_datetime(timestamp)


def memgraph_datetime_to_string(memgraph_datetime):
    """
    Convert memgraph datetime to string
    """

    datetime_str = (f"{memgraph_datetime.year:04d}-{memgraph_datetime.month:02d}-{memgraph_datetime.day:02d}T"
                    f"{memgraph_datetime.hour:02d}:{memgraph_datetime.minute:02d}:{memgraph_datetime.second:02d}")

    if hasattr(memgraph_datetime, 'nanosecond'):
        microseconds = memgraph_datetime.nanosecond // 1000
        datetime_str += f".{microseconds:06d}"

    return datetime_str
