"""
------------------------------------------------------------------------
File : op_graph_controller.py
Description: Controller for standard graph operations
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint, request
from Controllers.graph_config import get_db_connector
from Services.Graph.op_graph_service import *
from Services.generic_graph_service import GenericGraphService

# Init the bp
op_graph_controller_bp = Blueprint('op_graph_controller_bp', __name__)

# Engine database setup
database_connector = get_db_connector(debug=False)


@op_graph_controller_bp.route('/api/v2/graph/svg', methods=['POST'])
def download_svg():
    data = request.get_json()
    dataset_name = data.get('dataset_name')
    svg_content = data.get('svg')

    return OperationGraphService.download_svg_s(dataset_name, svg_content)


@op_graph_controller_bp.route('/api/v2/graph/nodes/event', methods=['GET'])
def get_event_nodes():
    return OperationGraphService.get_event_nodes_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/nodes/event/count', methods=['GET'])
def get_event_nodes_count():
    response = ApiResponse()

    try:
        database_connector.connect()

        event_nodes_count = OperationGraphService.get_count_event_nodes_s(database_connector)

        response.http_status_code = 200
        response.response_data = event_nodes_count
        response.message = 'Retrieve event nodes count'

        return jsonify(response.to_dict()), 200

    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@op_graph_controller_bp.route('/api/v2/graph/nodes/entity', methods=['GET'])
def get_entity_nodes():
    return OperationGraphService.get_entity_nodes_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/nodes/entity/count', methods=['GET'])
def get_entity_nodes_count():
    response = ApiResponse()

    try:
        database_connector.connect()

        entity_nodes_count = OperationGraphService.get_count_entity_nodes_s(database_connector)

        response.http_status_code = 200
        response.response_data = entity_nodes_count
        response.message = 'Retrieve entity nodes count'

        return jsonify(response.to_dict()), 200

    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@op_graph_controller_bp.route('/api/v2/graph/relationships/corr', methods=['GET'])
def get_corr_relationships():
    return OperationGraphService.get_corr_relationships_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/relationships/corr/count', methods=['GET'])
def get_corr_relationships_count():
    response = ApiResponse()

    try:
        database_connector.connect()

        corr_relationships_count = OperationGraphService.get_count_corr_relationships_s(database_connector)

        response.http_status_code = 200
        response.response_data = corr_relationships_count
        response.message = 'Retrieve :CORR relationship count'

        return jsonify(response.to_dict()), 200

    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@op_graph_controller_bp.route('/api/v2/graph/relationships/df', methods=['GET'])
def get_df_relationships():
    return OperationGraphService.get_df_relationships_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/relationships/df/count', methods=['GET'])
def get_df_relationships_count():
    response = ApiResponse()

    try:
        database_connector.connect()

        df_relationships_count = OperationGraphService.get_count_df_relationships_s(database_connector)

        response.http_status_code = 200
        response.response_data = df_relationships_count
        response.message = 'Retrieve :DF relationship count'

        return jsonify(response.to_dict()), 200

    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@op_graph_controller_bp.route('/api/v2/graph', methods=['DELETE'])
def delete_memgraph_graph():
    return GenericGraphService.delete_memgraph_graph_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/entities_key', methods=['GET'])
def get_entities_key():
    return OperationGraphService.get_entities_key_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/null-entities', methods=['GET'])
def get_null_entities():
    return OperationGraphService.get_null_entities_s(database_connector)
