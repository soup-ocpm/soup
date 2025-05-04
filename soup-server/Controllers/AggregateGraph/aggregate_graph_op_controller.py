"""
------------------------------------------------------------------------
File : aggregate_graph_op_controller.py
Description: Controller for aggregate (class) graph operations
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint
from Shared.support_config import get_db_connector
from Services.AggregateGraph.aggregate_graph_op_service import *
from Models.logger_model import Logger

# Init the bp
aggregate_graph_op_controller_bp = Blueprint('aggregate_graph_op_controller_bp', __name__)

# Engine database setup
database_connector = get_db_connector()

# Engine logger setup
logger = Logger()


@aggregate_graph_op_controller_bp.route('/api/v2/graph/class/nodes', methods=['GET'])
def get_class_nodes():
    """
    Get class nodes
    :return: ApiResponse object
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationClassGraphService.get_class_nodes_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@aggregate_graph_op_controller_bp.route('/api/v2/graph/class/nodes/count', methods=['GET'])
def get_class_nodes_count():
    """
    Get class nodes count
    :return: ApiResponse object
    """
    response = ApiResponse()

    try:
        # Connect to the database
        database_connector.connect()

        # Execute the query
        class_nodes_count = OperationClassGraphService.get_count_class_nodes_s(database_connector)

        response.http_status_code = 200
        response.response_data = class_nodes_count
        response.message = 'Retrieve class nodes count'

        logger.info('Retrieve class nodes count')
        return jsonify(response.to_dict()), 200
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@aggregate_graph_op_controller_bp.route('/api/v2/graph/class/obs', methods=['GET'])
def get_obs_relationships():
    """
    Get :OBS relationships
    :return: ApiResponse object
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationClassGraphService.get_obs_relationships_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@aggregate_graph_op_controller_bp.route('/api/v2/graph/class/obs/count', methods=['GET'])
def get_obs_relationships_count():
    """
    Get :OBS relationships count
    :return: ApiResponse object
    """

    response = ApiResponse()

    try:
        # Connect to the database
        database_connector.connect()

        # Execute the query
        obs_relationships_count = OperationClassGraphService.get_count_obs_relationships_s(database_connector)

        response.http_status_code = 200
        response.response_data = obs_relationships_count
        response.message = 'Retrieve :OBS relationship count'

        logger.info('Retrieve :OBS relationship count')
        return jsonify(response.to_dict()), 200
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@aggregate_graph_op_controller_bp.route('/api/v2/graph/class/dfc', methods=['GET'])
def get_dfc_relationships():
    """
    Get :DFC relationships
    :return: ApiResponse object
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationClassGraphService.get_dfc_relationships_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@aggregate_graph_op_controller_bp.route('/api/v2/graph/class/dfc/count', methods=['GET'])
def get_dfc_relationships_count():
    """
    Get :DFC relationships count
    :return: ApiResponse object
    """

    response = ApiResponse()

    try:
        # Connect to the database
        database_connector.connect()

        # Execute the query
        dfc_relationships_count = OperationClassGraphService.get_count_dfc_relationships_s(database_connector)

        response.http_status_code = 200
        response.response_data = dfc_relationships_count
        response.message = 'Retrieve :DF_C relationship count'

        logger.info('Retrieve :DF_C relationship count')
        return jsonify(response.to_dict()), 200
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@aggregate_graph_op_controller_bp.route('/api/v2/graph/class', methods=['DELETE'])
def delete_class_graph():
    """
    Delete class graph
    :return: ApiResponse object
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationClassGraphService.delete_class_graph_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500
