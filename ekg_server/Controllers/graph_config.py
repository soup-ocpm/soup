import os
import datetime
import json 
from Models.memgraph_connector_model import *


def get_db_connector(debug = False):
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


def neo_datetime_conversion(Time):
    '''
    From Neo4j datetime to datetime
    '''
    if type(Time) != float:
        millis = int(Time.nanosecond/1000)
        t = datetime.datetime(Time.year, Time.month, Time.day,
                              Time.hour, Time.minute, Time.second, millis)
        return t

def serialize_datetime(obj): 
    if isinstance(obj, datetime.datetime): 
        return obj.isoformat() 
    raise TypeError("Type not serializable") 

def datetime_to_json(time):
    timestamp = neo_datetime_conversion(time)
    json_time = json.dumps(timestamp, default=serialize_datetime) 
    return json_time
