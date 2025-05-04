"""
------------------------------------------------------------------------
File : aggregate_graph_controller.py
Description: Controller for aggregate (class) graph
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import json

from flask import Blueprint, request
from Shared.support_config import get_db_connector
from Services.AggregateGraph.aggregate_graph_service import *

# Init the bp
aggregate_graph_controller_bp = Blueprint('aggregate_graph_controller_bp', __name__)

# Engine database setup setup
database_connector = get_db_connector()

# Engine logger setup
logger = Logger()


@aggregate_graph_controller_bp.route('/api/v2/graph/class', methods=['POST'])
def create_class_graph():
    """
    Create aggregate graph
    :return: ApiResponse object
    """

    response = ApiResponse()

    try:
        # Retrieve data from request
        filtered_column_json = request.form.get('filteredColumn')
        filtered_column = json.loads(filtered_column_json)

        # Execute service
        return ClassGraphService.create_class_graph_s(filtered_column, database_connector)
    except Exception as e:
        response.http_status_code = 500
        response.response_data = None
        response.message = f'Internal Server Error : {str(e)}'

        logger.error(f'Internal Server Error : {str(e)}')
        return jsonify(response.to_dict()), 500
