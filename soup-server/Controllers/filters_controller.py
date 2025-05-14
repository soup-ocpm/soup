"""
------------------------------------------------------------------------
File : filters_controller.py
Description: Controller for apply filters in EKG
Date creation: 03-12-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint, request, jsonify
from Shared.support_config import get_db_connector
from Services.filters_service import FiltersService
from Models.api_response_model import ApiResponse
from Models.logger_model import Logger

# Init the bp
filters_controller_bp = Blueprint('filters_controller_bp', __name__)

# Engine database setup
database_connector = get_db_connector()

# Engine logger setup
logger = Logger()


@filters_controller_bp.route('/api/v2/analyses/new', methods=['POST'])
def create_new_analysis():
    """
    Create new analysis
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        filters_data = request.get_json()

        # Check the content
        if not filters_data:
            response.http_status_code = 400
            response.message = "Bad request. Content not provided"
            response.response_data = None

            logger.error("Bad Request: Content not provided")
            return jsonify(response.to_dict()), 400

        # Execute service
        return FiltersService.process_new_analyses_s(database_connector, filters_data)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@filters_controller_bp.route('/api/v2/analyses', methods=['POST'])
def process_analysis():
    """
    Process new analysis
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        dataset_name = request.get_json()['dataset_name']
        analysis_name = request.get_json()['analysis_name']

        # Check the name
        if not analysis_name or not dataset_name:
            response.http_status_code = 400
            response.message = "Bad request. Content not provided"
            response.response_data = None

            logger.error("Bad Request: Content not provided")
            return jsonify(response.to_dict()), 400

        # Execute service
        return FiltersService.process_analyses_s(database_connector, dataset_name, analysis_name)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@filters_controller_bp.route('/api/v2/analyses', methods=['GET'])
def get_all_analyses():
    """
    Get all analyses
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        dataset_name = request.args.get('dataset_name', type=str)

        # Validate dataset_name
        if not dataset_name:
            response.http_status_code = 400
            response.message = "Bad request. Dataset name not provided."
            response.response_data = None

            logger.error("Bad Request: Dataset name not provided")
            return jsonify(response.to_dict()), 400

        # Execute service
        return FiltersService.get_all_analyses_s(dataset_name)
    except Exception as e:
        response.http_status_code = 500
        response.message = f"Internal server error: {str(e)}"
        response.response_data = None

        logger.error(f"Internal server error: {str(e)}")
        return jsonify(response.to_dict()), 500


@filters_controller_bp.route('/api/v2/analyses/unique', methods=['POST'])
def check_unique_analysis_name():
    """
    Check unique analysis name
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        dataset_name = request.get_json()['dataset_name']
        analysis_name = request.get_json()['analysis_name']

        # Check the name
        if not dataset_name or not analysis_name:
            response.http_status_code = 400
            response.message = "Bad request. Name not provided"
            response.response_data = None

            logger.error("Bad Request: Name not provided")
            return jsonify(response.to_dict()), 400

        # Execute service
        return FiltersService.check_unique_analysis_name(dataset_name, analysis_name)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@filters_controller_bp.route('/api/v2/analyses/frequency', methods=['POST'])
def process_frequency_filter():
    """
    Process frequency filter
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        frequency = request.get_json()['frequency']

        # Check the name
        if not frequency:
            response.http_status_code = 400
            response.message = "Bad request. Name not provided"
            response.response_data = None

            logger.error("Bad Request: Name not provided")
            return jsonify(response.to_dict()), 400

        # Execute service
        return FiltersService.process_frequency(database_connector, frequency)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@filters_controller_bp.route('/api/v2/analyses/variation', methods=['GET'])
def process_variation_filter():
    """
    Process variation filter
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return FiltersService.process_variation(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@filters_controller_bp.route('/api/v2/analyses/performance/avg', methods=['GET'])
def get_performance_entity_avg_duration():
    """
    Retrieve the avg entity type for the performance filter
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        entity_type = request.args.get('entity', type=str)

        # Execute service
        return FiltersService.get_performance_entities_avg(database_connector, entity_type)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@filters_controller_bp.route('/api/v2/analyses/frequency/occurrences', methods=['GET'])
def get_frequency_entity_occurrences():
    """
    Retrieve the entity activities occurrences
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        entity_type = request.args.get('entity', type=str)

        # Execute service
        return FiltersService.get_frequency_entities_activities_occurrences(database_connector, entity_type)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@filters_controller_bp.route('/api/v2/analyses/variation/occurrences', methods=['GET'])
def get_variation_entity_occurrences():
    """
    Retrieve the variation entity list
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        entity_type = request.args.get('entity', type=str)

        # Execute service
        return FiltersService.get_variation_entities_occurrences(database_connector, entity_type)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@filters_controller_bp.route('/api/v2/analyses/delete', methods=['POST'])
def remove_analyses():
    """
    Remove specific analysis
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        dataset_name = request.get_json()['dataset_name']
        analysis_name = request.get_json()['analysis_name']

        # Check the name
        if not analysis_name or not dataset_name:
            response.http_status_code = 400
            response.message = "Bad request. Name or Dataset name not provided"
            response.response_data = None

            logger.error("Bad Request: Name or Dataset name not provided")
            return jsonify(response.to_dict()), 400

        # Execute service
        return FiltersService.delete_analyses_s(dataset_name, analysis_name)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500
