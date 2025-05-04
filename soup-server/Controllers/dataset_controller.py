"""
------------------------------------------------------------------------
File : dataset_controller.py
Description: Controller for the Memgraph datasets
Date creation: 12-10-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint, request, jsonify
from Services.dataset_service import DatasetService
from Models.api_response_model import ApiResponse
from Models.logger_model import Logger

# Init the bp
dataset_controller_bp = Blueprint('dataset_controller_bp', __name__)

# Engine logger setup
logger = Logger()


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['GET'])
def get_dataset_info():
    """
    Get specific dataset info
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        dataset_name = request.args.get('dataset_name', type=str)

        # Execute service
        return DatasetService.get_dataset_s(dataset_name)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@dataset_controller_bp.route('/api/v2/datasets', methods=['GET'])
def get_all_dataset_info():
    """
    Get all dataset information
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return DatasetService.get_all_dataset_s()
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['PUT'])
def update_dataset_info():
    """
    Update specific dataset info
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        data = request.get_json()
        dataset_name = data.get('dataset_name')
        dataset_description = data.get('dataset_description')

        # Execute service
        return DatasetService.update_dataset_s(dataset_name, dataset_description)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@dataset_controller_bp.route('/api/v2/datasets/exist', methods=['POST'])
def check_unique_dataset():
    """
    Check the unique name for new dataset
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        data = request.get_json()
        dataset_name = data.get('dataset_name')

        # Execute service
        return DatasetService.check_unique_dataset_name_s(dataset_name)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['DELETE'])
def delete_dataset():
    """
    Delete specific dataset
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        dataset_name = request.args.get('dataset_name')

        # Execute service
        return DatasetService.delete_dataset_s(dataset_name)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500
