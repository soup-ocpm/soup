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
from flask import Blueprint, request
from Services.Graph.op_graph_service import *
from Controllers.graph_config import get_db_connector

# Init the bp
op_graph_controller_bp = Blueprint('op_graph_controller_bp', __name__)

# Database information
database_connector = get_db_connector(debug=True)


@op_graph_controller_bp.route('/api/v2/graph/nodes/event', methods=['GET'])
def get_event_nodes():
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_event_nodes_s(database_connector, dataset_name)


@op_graph_controller_bp.route('/api/v2/graph/nodes/event_nodes_count', methods=['GET'])
def get_event_nodes_count():
    dataset_name = request.args.get('dataset_name')

    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = OperationGraphService.get_count_event_nodes_s(database_connector, dataset_name)

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
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_entity_nodes_s(database_connector, dataset_name)


@op_graph_controller_bp.route('/api/v2/graph/nodes/entity_nodes_count', methods=['GET'])
def get_entity_nodes_count():
    dataset_name = request.args.get('dataset_name')

    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        entity_nodes_count = OperationGraphService.get_count_entity_nodes_s(database_connector, dataset_name)

        apiResponse.http_status_code = 200
        apiResponse.response_data = entity_nodes_count
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
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_corr_relationships_s(database_connector, dataset_name)


@op_graph_controller_bp.route('/api/v2/graph/relationships/corr_rel_count', methods=['GET'])
def get_corr_relationships_count():
    dataset_name = request.args.get('dataset_name')

    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        corr_relationships_count = OperationGraphService.get_count_corr_relationships_s(database_connector,
                                                                                        dataset_name)

        apiResponse.http_status_code = 200
        apiResponse.response_data = corr_relationships_count
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
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_df_relationships_s(database_connector, dataset_name)


@op_graph_controller_bp.route('/api/v2/graph/relationships/df_rel_count', methods=['GET'])
def get_df_relationships_count():
    dataset_name = request.args.get('dataset_name')

    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        df_relationships_count = OperationGraphService.get_count_df_relationships_s(database_connector, dataset_name)

        apiResponse.http_status_code = 200
        apiResponse.response_data = df_relationships_count
        apiResponse.message = 'Retrieve :DF relationship count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@op_graph_controller_bp.route('/api/v2/graph/details/info', methods=['GET'])
def get_graph_details_info():
    dataset_name = request.args.get('dataset_name')

    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = OperationGraphService.get_count_event_nodes_s(database_connector, dataset_name)
        entity_nodes_count = OperationGraphService.get_count_entity_nodes_s(database_connector, dataset_name)
        corr_relationships_count = OperationGraphService.get_count_corr_relationships_s(database_connector,
                                                                                        dataset_name)
        df_relationships_count = OperationGraphService.get_count_df_relationships_s(database_connector, dataset_name)

        if event_nodes_count == 0 and entity_nodes_count == 0 and corr_relationships_count == 0 and df_relationships_count == 0:
            apiResponse.http_status_code = 202
            apiResponse.response_data = []
            apiResponse.message = 'No content'

            return jsonify(apiResponse.to_dict()), 202

        graph_info = [{
            'event_count': event_nodes_count,
            'entity_count': entity_nodes_count,
            'corr_count': corr_relationships_count,
            'df_count': df_relationships_count
        }]

        apiResponse.http_status_code = 200
        apiResponse.response_data = graph_info
        apiResponse.message = 'Retrieve graph information'

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
    limit = request.args.get('limit', type=int)
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_graph_details_s(database_connector, dataset_name, limit)


@op_graph_controller_bp.route('/api/v2/graph/delete', methods=['POST'])
def delete_graph():
    dataset_name = request.form.get('dataset_name')

    return OperationGraphService.delete_graph_s(database_connector, dataset_name)


@op_graph_controller_bp.route('/api/v2/support/entities_key', methods=['GET'])
def get_entities_key():
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_entities_key_s(database_connector, dataset_name)


@op_graph_controller_bp.route('/api/v2/support/null-entities', methods=['GET'])
def get_null_entities():
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_null_entities_s(database_connector, dataset_name)
