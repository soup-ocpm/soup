"""
------------------------------------------------------------------------
File : generic_graph_controller.py
Description: Controller for generic graph operations
Date creation: 20-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint, request, jsonify
from Controllers.graph_config import get_db_connector
from Services.generic_graph_service import GenericGraphService
from Services.docker_service import DockerService
from Models.api_response_model import ApiResponse

# Init the bp
generic_graph_controller_bp = Blueprint('generic_graph_controller_bp', __name__)

# Engine database setup
database_connector = get_db_connector(debug=False)


@generic_graph_controller_bp.route('/api/v2/complete-graph/build', methods=['POST'])
def create_dataset_graphs():
    data = request.get_json()
    dataset_name = data.get('dataset_name')

    response = ApiResponse()

    try:
        container_id = DockerService.get_container_id('soup-database')

        if not container_id or container_id == '':
            response.http_status_code = 404
            response.response_data = None
            response.message = 'Container not found'
            return jsonify(response.to_dict()), 404

        result = GenericGraphService.create_complete_graphs(container_id, database_connector, dataset_name)

        if result != 'success':
            response.http_status_code = 404
            response.response_data = result
            response.message = 'Unable to create the Dataset graphs'
            return jsonify(response.to_dict()), 404

        response.http_status_code = 200
        response.response_data = result
        response.message = 'Successfully created the Dataset graphs'
        return jsonify(response.to_dict()), 200

    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'
        return jsonify(response.to_dict()), 500


@generic_graph_controller_bp.route('/api/v2/complete-graph', methods=['POST'])
def get_complete_graph():
    data = request.get_json()
    standard_graph = data.get('standard_graph')

    limit = request.args.get('limit', type=int)

    return GenericGraphService.get_graph_s(database_connector, standard_graph, limit)


@generic_graph_controller_bp.route('/api/v2/complete-graph', methods=['DELETE'])
def remove_memgraph_data():
    return GenericGraphService.delete_memgraph_graph_s(database_connector)
