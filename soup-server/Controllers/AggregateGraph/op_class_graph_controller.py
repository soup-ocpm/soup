"""
------------------------------------------------------------------------
File : op_class_graph_controller.py
Description: Controller for class graph operations
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint
from Controllers.graph_config import get_db_connector
from Services.AggregateGraph.op_class_graph_service import *

# Init the bp
op_class_graph_controller_bp = Blueprint('op_class_graph_controller_bp', __name__)

# Database information
database_connector = get_db_connector(debug=True)


@op_class_graph_controller_bp.route('/api/v2/graph/class/nodes', methods=['GET'])
def get_class_nodes():
    return jsonify({
        'status': 500,
        'message': 'Not implemented yet'
    }), 500


@op_class_graph_controller_bp.route('/api/v2/graph/class/nodes/count', methods=['GET'])
def get_class_nodes_count():
    apiResponse = ApiResponse(None, None, None)

    try:
        database_connector.connect()

        class_nodes_count = OperationClassGraphService.get_count_class_nodes_s(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = class_nodes_count
        apiResponse.message = 'Retrieve class nodes count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@op_class_graph_controller_bp.route('/api/v2/graph/class/obs', methods=['GET'])
def get_obs_relationships():
    # Todo: implement
    return None


@op_class_graph_controller_bp.route('/api/v2/graph/class/obs/count', methods=['GET'])
def get_obs_relationships_count():
    apiResponse = ApiResponse(None, None, None)

    try:
        database_connector.connect()

        obs_relationships_count = OperationClassGraphService.get_count_obs_relationships_s(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = obs_relationships_count
        apiResponse.message = 'Retrieve :OBS relationship count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@op_class_graph_controller_bp.route('/api/v2/graph/class/dfc', methods=['GET'])
def get_dfc_relationships():
    # Todo: implement
    return None


@op_class_graph_controller_bp.route('/api/v2/graph/class/dfc/count', methods=['GET'])
def get_dfc_relationships_count():
    apiResponse = ApiResponse(None, None, None)

    try:
        database_connector.connect()

        dfc_relationships_count = OperationClassGraphService.get_count_dfc_relationships_s(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = dfc_relationships_count
        apiResponse.message = 'Retrieve :DF_C relationship count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@op_class_graph_controller_bp.route('/api/v2/graph/class', methods=['DELETE'])
def delete_class_graph():
    return OperationClassGraphService.delete_class_graph_s(database_connector)
