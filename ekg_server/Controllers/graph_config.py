import os
import datetime
import json
from Models.memgraph_connector_model import *


def get_db_connector(debug=False):
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
    return datetime.datetime.fromisoformat(timestamp_str)


def neo_datetime_conversion(time):
    '''
    From string or Neo4j datetime to datetime
    '''
    if isinstance(time, str):
        time = string_to_datetime(time)

    if not isinstance(time, datetime.datetime) or not isinstance(time, float):        
        millis = int(time.nanosecond / 1000)        
        t = datetime.datetime(time.year, time.month, time.day,
                              time.hour, time.minute, time.second, millis)
        return t
    else:
        raise ValueError("Timestamp format is not valid")


def serialize_datetime(obj):
    if isinstance(obj, datetime.datetime):
        return obj.isoformat()
    raise TypeError("Type not serializable")


def datetime_to_json(time):
    timestamp = neo_datetime_conversion(time)
    return serialize_datetime(timestamp)
