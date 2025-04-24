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
from Controllers.graph_config import get_db_connector
from Services.filters_service import FiltersService
from Models.api_response_model import ApiResponse
from Models.logger_model import Logger

# Init the bp
filters_controller_bp = Blueprint('filters_controller_bp', __name__)

# Engine database setup
database_connector = get_db_connector(debug=False)

# Engine logger setup
logger = Logger()


@filters_controller_bp.route('/api/v2/analyses/new', methods=['POST'])
def create_new_analysis():
    """
    Create new analysis
    :return: ApiResponse model
    """
    response = ApiResponse()

    filters_data = request.get_json()

    # Check the content
    if not filters_data:
        response.http_status_code = 400
        response.message = "Bad request. Content not provided"
        response.response_data = None

        logger.error("Bad Request: Content not provided")
        return jsonify(response.to_dict()), 400

    return FiltersService.process_new_analyses_s(database_connector, filters_data)


@filters_controller_bp.route('/api/v2/analyses', methods=['POST'])
def process_analysis():
    """
    Process new analysis
    :return: ApiResponse model
    """
    response = ApiResponse()

    dataset_name = request.get_json()['dataset_name']
    analysis_name = request.get_json()['analysis_name']

    # Check the name
    if not analysis_name or not dataset_name:
        response.http_status_code = 400
        response.message = "Bad request. Content not provided"
        response.response_data = None

        logger.error("Bad Request: Content not provided")
        return jsonify(response.to_dict()), 400

    return FiltersService.process_analyses_s(database_connector, dataset_name, analysis_name)


@filters_controller_bp.route('/api/v2/analyses', methods=['GET'])
def get_all_analyses():
    """
    Get all analyses
    :return: ApiResponse model
    """
    response = ApiResponse()
    dataset_name = request.args.get('dataset_name', type=str)

    # Validate dataset_name
    if not dataset_name:
        response.http_status_code = 400
        response.message = "Bad request. Dataset name not provided."
        response.response_data = None

        logger.error("Bad Request: Dataset name not provided")
        return jsonify(response.to_dict()), 400

    try:
        # Call the service to get analyses
        result = FiltersService.get_all_analyses_s(dataset_name)

        return result

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

    dataset_name = request.get_json()['dataset_name']
    analysis_name = request.get_json()['analysis_name']

    # Check the name
    if not dataset_name or not analysis_name:
        response.http_status_code = 400
        response.message = "Bad request. Name not provided"
        response.response_data = None

        logger.error("Bad Request: Name not provided")
        return jsonify(response.to_dict()), 400

    return FiltersService.check_unique_analysis_name(dataset_name, analysis_name)


@filters_controller_bp.route('/api/v2/analyses/frequency', methods=['POST'])
def process_frequency_filter():
    """
    Process frequency filter
    :return: ApiResponse model
    """
    response = ApiResponse()

    frequency = request.get_json()['frequency']

    # Check the name
    if not frequency:
        response.http_status_code = 400
        response.message = "Bad request. Name not provided"
        response.response_data = None

        logger.error("Bad Request: Name not provided")
        return jsonify(response.to_dict()), 400

    return FiltersService.process_frequency(database_connector, frequency)


@filters_controller_bp.route('/api/v2/analyses/variation', methods=['GET'])
def process_variation_filter():
    """
    Process variation filter
    :return: ApiResponse model
    """

    return FiltersService.process_variation(database_connector)


@filters_controller_bp.route('/api/v2/analyses/delete', methods=['POST'])
def remove_analyses():
    """
    Remove specific analysis
    :return: ApiResponse model
    """
    response = ApiResponse()

    dataset_name = request.get_json()['dataset_name']
    analysis_name = request.get_json()['analysis_name']

    # Check the name
    if not analysis_name or not dataset_name:
        response.http_status_code = 400
        response.message = "Bad request. Name or Dataset name not provided"
        response.response_data = None

        logger.error("Bad Request: Name or Dataset name not provided")
        return jsonify(response.to_dict()), 400

    return FiltersService.delete_analyses_s(dataset_name, analysis_name)
