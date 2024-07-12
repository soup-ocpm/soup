"""
-------------------------------
File : op_graph_controller.py
Description: Controller for standard graph operations
Date creation: 07-07-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""

# Import
from flask import Blueprint
from Services.op_graph_service import *
from Models.memgraph_connector_model import *

# Init the bp
op_graph_controller_bp = Blueprint('op_graph_controller_bp', __name__)

# Database information:
uri_mem = 'bolt://localhost:7687'
auth_mem = ("", "")
database_connector = MemgraphConnector(uri_mem, auth_mem)


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


@op_graph_controller_bp.route('/api/v2/graph', methods=['GET'])
def get_graph():
    return OperationGraphService.get_graph_s(database_connector)


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
