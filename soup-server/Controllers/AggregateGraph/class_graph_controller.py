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
from flask import Blueprint, request
from Controllers.graph_config import get_db_connector
from Services.AggregateGraph.class_graph_service import *

# Init the bp
class_graph_controller_bp = Blueprint('class_graph_controller_bp', __name__)

# Database information
database_connector = get_db_connector(debug=True)


@class_graph_controller_bp.route('/api/v2/graph/class', methods=['POST'])
def create_class_graph():
    # socketio = current_app.config['socketio'] (add on the future)

    container_id = request.form.get('container_id')
    dataset_name = request.form.get('dataset_name')
    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    return ClassGraphService.create_class_graph_s(container_id, dataset_name, filtered_column, database_connector)
