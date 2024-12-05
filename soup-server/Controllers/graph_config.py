"""
------------------------------------------------------------------------
File : graph_config.py
Description: Graph configuration functions
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


# Get the database connector configuration
def get_db_connector(debug=True):
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


# Convert string to datetime
def string_to_datetime(timestamp_str):
    return datetime.datetime.fromisoformat(timestamp_str)


# Convert string or Neo4j datetime to datetime object library
def neo_datetime_conversion(time):
    if isinstance(time, str):
        time = string_to_datetime(time)

    if isinstance(time, datetime.datetime):
        millis = int(time.nanosecond / 1000) if hasattr(time, 'nanosecond') else 0
        t = datetime.datetime(time.year, time.month, time.day,
                              time.hour, time.minute, time.second, millis)
        return t
    else:
        raise ValueError("Timestamp format is not valid")


# Serialize datetime
def serialize_datetime(obj):
    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    raise TypeError("Type not serializable")


# Datetime object to json
def datetime_to_json(time):
    timestamp = neo_datetime_conversion(time)
    return serialize_datetime(timestamp)


# Convert memgraph datetime to string
def memgraph_datetime_to_string(memgraph_datetime):
    datetime_str = (f"{memgraph_datetime.year:04d}-{memgraph_datetime.month:02d}-{memgraph_datetime.day:02d}T"
                    f"{memgraph_datetime.hour:02d}:{memgraph_datetime.minute:02d}:{memgraph_datetime.second:02d}")

    if hasattr(memgraph_datetime, 'nanosecond'):
        microseconds = memgraph_datetime.nanosecond // 1000
        datetime_str += f".{microseconds:06d}"

    return datetime_str
