import os
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