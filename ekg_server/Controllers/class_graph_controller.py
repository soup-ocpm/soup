"""
------------------------------------------------------------------------
File : class_graph_controller.py
Description: Controller for class graph
Date creation: 07-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import os
import json

from flask import Blueprint, current_app, request
from Services.class_graph_service import *
from Models.memgraph_connector_model import *

# Init the bp
class_graph_controller_bp = Blueprint('class_graph_controller_bp', __name__)

# Database information
memgraph_host = os.getenv("MEMGRAPH_HOST", "memgraph")
memgraph_port = int(os.getenv("MEMGRAPH_PORT", 7687))
uri_mem = f'bolt://{memgraph_host}:{memgraph_port}'
auth_mem = ("", "")
database_connector = MemgraphConnector(uri_mem, auth_mem)


@class_graph_controller_bp.route('/api/v2/graph-class', methods=['POST'])
def create_class_graph():
    socketio = current_app.config['socketio']

    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    return ClassGraphService.create_class_graph_s(filtered_column, database_connector, socketio)
