"""
------------------------------------------------------------------------
File : graph_op_controller.py
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
from Shared.support_config import get_db_connector
from Services.Graph.op_graph_service import *
from Services.generic_graph_service import GenericGraphService
from Models.logger_model import Logger

# Init the bp
graph_op_controller_bp = Blueprint('graph_op_controller_bp', __name__)

# Engine database setup
database_connector = get_db_connector()

# Engine logger setup
logger = Logger()


@graph_op_controller_bp.route('/api/v2/graph/nodes/event', methods=['GET'])
def get_event_nodes():
    """
    Get event nodes
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationGraphService.get_event_nodes_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@graph_op_controller_bp.route('/api/v2/graph/nodes/event/count', methods=['GET'])
def get_event_nodes_count():
    """
    Get event nodes count
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Connect to the database
        database_connector.connect()

        # Execute the query
        event_nodes_count = OperationGraphService.get_count_event_nodes_s(database_connector)

        response.http_status_code = 200
        response.response_data = event_nodes_count
        response.message = 'Retrieve event nodes count'

        logger.info('Retrieve event nodes count')
        return jsonify(response.to_dict()), 200
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@graph_op_controller_bp.route('/api/v2/graph/nodes/entity', methods=['GET'])
def get_entity_nodes():
    """
    Get entity nodes
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationGraphService.get_entity_nodes_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@graph_op_controller_bp.route('/api/v2/graph/nodes/entity/count', methods=['GET'])
def get_entity_nodes_count():
    """
    Get entity nodes count
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Connect to the database
        database_connector.connect()

        # Execute the query
        entity_nodes_count = OperationGraphService.get_count_entity_nodes_s(database_connector)

        response.http_status_code = 200
        response.response_data = entity_nodes_count
        response.message = 'Retrieve entity nodes count'

        logger.info('Retrieve entity nodes count')
        return jsonify(response.to_dict()), 200
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@graph_op_controller_bp.route('/api/v2/graph/relationships/corr', methods=['GET'])
def get_corr_relationships():
    """
    Get :CORR relationships
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationGraphService.get_corr_relationships_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@graph_op_controller_bp.route('/api/v2/graph/relationships/corr/count', methods=['GET'])
def get_corr_relationships_count():
    """
    Get :CORR relationships count
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Connect to the database
        database_connector.connect()

        # Execute query
        corr_relationships_count = OperationGraphService.get_count_corr_relationships_s(database_connector)

        response.http_status_code = 200
        response.response_data = corr_relationships_count
        response.message = 'Retrieve :CORR relationship count'

        logger.info('Retrieve :CORR relationship count')
        return jsonify(response.to_dict()), 200
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@graph_op_controller_bp.route('/api/v2/graph/relationships/df', methods=['GET'])
def get_df_relationships():
    """
    Get :DF relationships
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationGraphService.get_df_relationships_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@graph_op_controller_bp.route('/api/v2/graph/relationships/df/count', methods=['GET'])
def get_df_relationships_count():
    """
    Get :DF relationships count
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Connect to the database
        database_connector.connect()

        # Execute query
        df_relationships_count = OperationGraphService.get_count_df_relationships_s(database_connector)

        response.http_status_code = 200
        response.response_data = df_relationships_count
        response.message = 'Retrieve :DF relationship count'

        logger.info('Retrieve :DF relationship count')
        return jsonify(response.to_dict()), 200
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500

    finally:
        database_connector.close()


@graph_op_controller_bp.route('/api/v2/graph/entities_key', methods=['GET'])
def get_entities_key():
    """
    Get entity keys
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationGraphService.get_entities_key_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@graph_op_controller_bp.route('/api/v2/graph/null-entities', methods=['GET'])
def get_null_entities():
    """
    Get entity with null values
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationGraphService.get_null_entities_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@graph_op_controller_bp.route('/api/v2/graph/activities', methods=['GET'])
def get_all_activities_name():
    """
    Get all activities name
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationGraphService.get_activities_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@graph_op_controller_bp.route('/api/v2/graph/timestamps', methods=['GET'])
def get_min_max_timestamp_information():
    """
    Get min and max timestamp for event
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OperationGraphService.get_min_max_timestamp(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@graph_op_controller_bp.route('/api/v2/graph/svg', methods=['POST'])
def download_svg():
    """
    Download the svg graph preview
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        data = request.get_json()
        dataset_name = data.get('dataset_name')
        svg_content = data.get('svg')

        # Execute service
        return OperationGraphService.download_svg_s(dataset_name, svg_content)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@graph_op_controller_bp.route('/api/v2/graph', methods=['DELETE'])
def delete_memgraph_graph():
    """
    Delete the memgraph graph
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return GenericGraphService.delete_memgraph_graph_s(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500
