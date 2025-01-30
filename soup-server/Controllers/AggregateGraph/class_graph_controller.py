"""
------------------------------------------------------------------------
File : class_graph_controller.py
Description: Controller for class graph
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
from Controllers.graph_config import get_db_connector
from Services.AggregateGraph.class_graph_service import *

# Init the bp
class_graph_controller_bp = Blueprint('class_graph_controller_bp', __name__)

# Engine database setup setup
database_connector = get_db_connector(debug=False)


@class_graph_controller_bp.route('/api/v2/graph/class', methods=['POST'])
def create_class_graph():
    """
    Create aggregate graph
    :return: ApiResponse object
    """
    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    return ClassGraphService.create_class_graph_s(filtered_column, database_connector)
