"""
-------------------------------
File : graph_controller.py
Description: Controller for standard graph
Date creation: 07-07-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""
import json

# Import
from flask import Blueprint, current_app, request, jsonify
from Models.api_response_model import ApiResponse
from Services.graph_service import GraphService
from Models.memgraph_connector_model import MemgraphConnector

# Init the bp
graph_controller_bp = Blueprint('graph_bp', __name__)

# Database information:
uri_mem = 'bolt://localhost:7687'
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

    # Container
    container_name = request.form.get('container_name')
    real_container_name = container_name.replace("'", '"')
    container_id = request.form.get('container_id')
    real_container_id = container_id.replace("'", '"')

    # Query properties
    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    values_column_json = request.form.get('valuesColumn')
    values_column = json.loads(values_column_json)

    fixed_column = request.form.get('fixed').replace('"', '')
    variable_column = request.form.get('variable').replace('"', '')

    return GraphService.create_graph_s(file, filtered_column, values_column, fixed_column, variable_column,
                                       container_name,
                                       container_id,
                                       database_connector,
                                       socketio)
