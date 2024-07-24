"""
------------------------------------------------------------------------
File : op_graph_controller.py
Description: Controller for standard graph operations
Date creation: 07-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import os

from flask import Blueprint
from Services.op_graph_service import *
from Models.memgraph_connector_model import *
from Controllers.graph_config import get_db_connector

# Init the bp
op_graph_controller_bp = Blueprint('op_graph_controller_bp', __name__)

# Database information
database_connector = get_db_connector(debug=True)


@op_graph_controller_bp.route('/api/v2/graph/nodes/event', methods=['GET'])
def get_event_nodes():
    return OperationGraphService.get_event_nodes_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/nodes/event_nodes_count', methods=['GET'])
def get_event_nodes_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = OperationGraphService.get_count_event_nodes_s(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = event_nodes_count
        apiResponse.message = 'Retrieve event nodes count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@op_graph_controller_bp.route('/api/v2/graph/nodes/entity', methods=['GET'])
def get_entity_nodes():
    return OperationGraphService.get_entity_nodes_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/nodes/entity_nodes_count', methods=['GET'])
def get_entity_nodes_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = OperationGraphService.get_count_entity_nodes_s(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = event_nodes_count
        apiResponse.message = 'Retrieve entity nodes count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@op_graph_controller_bp.route('/api/v2/graph/relationships/corr', methods=['GET'])
def get_corr_relationships():
    return OperationGraphService.get_corr_relationships_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/relationships/corr_rel_count', methods=['GET'])
def get_corr_relationships_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = OperationGraphService.get_count_corr_relationships_s(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = event_nodes_count
        apiResponse.message = 'Retrieve :CORR relationship count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@op_graph_controller_bp.route('/api/v2/graph/relationships/df', methods=['GET'])
def get_df_relationships():
    return OperationGraphService.get_df_relationships_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph/relationships/df_rel_count', methods=['GET'])
def get_df_relationships_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = OperationGraphService.get_count_df_relationships_s(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = event_nodes_count
        apiResponse.message = 'Retrieve :DF relationship count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@op_graph_controller_bp.route('/api/v2/graph/details', methods=['GET'])
def get_graph_details():
    return OperationGraphService.get_graph_details_s(database_connector)


@op_graph_controller_bp.route('/api/v2/graph', methods=['DELETE'])
def delete_graph():
    return OperationGraphService.delete_graph_s(database_connector)


@op_graph_controller_bp.route('/api/v2/support/entities_key', methods=['GET'])
def get_entities_key():
    return OperationGraphService.get_entities_key_s(database_connector)


@op_graph_controller_bp.route('/api/v2/support/null-entities', methods=['GET'])
def get_null_entities():
    return OperationGraphService.get_null_entities_s(database_connector)
