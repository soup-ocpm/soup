"""
------------------------------------------------------------------------
File : onboarding_controller.py
Description: Controller for user experience interaction and tutorials
Date creation: 02-05-2025
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint, jsonify
from Shared.support_config import get_db_connector
from Services.onboarding_service import OnBoardingService
from Models.api_response_model import ApiResponse
from Models.logger_model import Logger

# Init the bp
onboarding_controller_bp = Blueprint('onboarding_controller_bp', __name__)

# Engine database setup
database_connector = get_db_connector()

# Engine logger setup
logger = Logger()


# Standard Graph JSON
@onboarding_controller_bp.route('/api/v2/onboarding/first-time', methods=['GET'])
def get_first_time_usage():
    """
    Check the user's first use
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OnBoardingService.get_first_time_usage_node(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500


@onboarding_controller_bp.route('/api/v2/onboarding/first-time', methods=['POST'])
def create_first_time_usage():
    """
    Check the user's first use
    :return: ApiResponse model
    """

    response = ApiResponse()

    try:
        # Execute service
        return OnBoardingService.create_first_time_usage_node(database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500
