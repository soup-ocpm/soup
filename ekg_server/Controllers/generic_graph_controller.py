"""
------------------------------------------------------------------------
File : generic_graph_controller.py
Description: Controller for generic graph operations
Date creation: 20-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import os

from flask import Blueprint, request
from Services.generic_graph_service import *
from Models.memgraph_connector_model import *
from Controllers.graph_config import get_db_connector


# Init the bp
generic_graph_controller_bp = Blueprint('generic_graph_controller_bp', __name__)

# Database information
database_connector = get_db_connector(debug=True)


@generic_graph_controller_bp.route('/api/v2/complete-graph', methods=['POST'])
def get_complete_graph():
    data = request.get_json()
    standard_graph = data.get('standard_graph')
    print(standard_graph)

    return GenericGraphService.get_class_graph_s(database_connector, standard_graph)
