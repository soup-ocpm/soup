"""
------------------------------------------------------------------------
File : graph_controller.py
Description: Controller for standard graph
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

from flask import Blueprint, current_app, request, jsonify
from Models.api_response_model import ApiResponse
from Models.memgraph_connector_model import MemgraphConnector
from Services.graph_service import GraphService

# Init the bp
graph_controller_bp = Blueprint('graph_bp', __name__)

# Database information
memgraph_host = os.getenv("MEMGRAPH_HOST", "memgraph")
memgraph_port = int(os.getenv("MEMGRAPH_PORT", 7687))
uri_mem = f'bolt://{memgraph_host}:{memgraph_port}'
auth_mem = ("", "")
database_connector = MemgraphConnector(uri_mem, auth_mem)


@graph_controller_bp.route('/api/v2/graph', methods=['POST'])
def create_graph():
    socketio = current_app.config['socketio']

    apiResponse = ApiResponse(None, None, None)

    # Check the file
    if request.files['file'] is None:
        apiResponse.http_status_code = 400
        apiResponse.message = "Bad request"
        apiResponse.response_data = None
        return jsonify(apiResponse.to_dict()), 400

    file = request.files['file']

    if not file or not file.filename.endswith(".csv"):
        apiResponse.http_status_code = 400
        apiResponse.message = "Bad request"
        apiResponse.response_data = None
        return jsonify(apiResponse.to_dict()), 400

    copy_file = request.files['copy_file']

    # Creation method
    standardCreation = request.form.get('standardCreation')

    # Container
    container_id = request.form.get('container_id')

    # Standard column
    standard_column_json = request.form.get('standardColumn')
    standard_column = json.loads(standard_column_json)

    # Query properties
    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    values_column_json = request.form.get('valuesColumn')
    values_column = json.loads(values_column_json)

    # Column section
    fixed_column = request.form.get('fixed').replace('"', '')
    variable_column = request.form.get('variable').replace('"', '')

    return GraphService.create_graph_s(file, copy_file,
                                       standardCreation,
                                       standard_column,
                                       filtered_column,
                                       values_column,
                                       fixed_column,
                                       variable_column,
                                       container_id,
                                       database_connector,
                                       socketio)
