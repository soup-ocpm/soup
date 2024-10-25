"""
------------------------------------------------------------------------
File : graph_json_controller.py
Description: Controller for graphs json operation
Date creation: 27-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint, request
from Controllers.graph_config import get_db_connector
from Services.graph_json_service import GraphJSONService
from Services.Graph.op_graph_service import OperationGraphService

# Init the bp
graph_json_controller_bp = Blueprint('graph_json_controller_bp', __name__)

# Database information
database_connector = get_db_connector(debug=True)


# Standard Graph JSON
@graph_json_controller_bp.route('/api/v2/json/graph/event-nodes', methods=['GET'])
def get_json_graph_event_nodes():
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_event_nodes_s(database_connector, dataset_name)


@graph_json_controller_bp.route('/api/v2/json/graph/entity-nodes', methods=['GET'])
def get_json_graph_entity_nodes():
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_entity_nodes_s(database_connector, dataset_name)


@graph_json_controller_bp.route('/api/v2/json/graph/corr-links', methods=['GET'])
def get_json_graph_corr_links():
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_corr_relationships_s(database_connector, dataset_name)


@graph_json_controller_bp.route('/api/v2/json/graph/df-links', methods=['GET'])
def get_json_graph_df_links():
    dataset_name = request.args.get('dataset_name')

    return OperationGraphService.get_df_relationships_s(database_connector, dataset_name)


# Class Graph JSON
@graph_json_controller_bp.route('/api/v2/json/class-graph/class-nodes', methods=['GET'])
def get_json_graph_class_nodes():
    dataset_name = request.args.get('dataset_name')

    return GraphJSONService.get_class_graph_nodes_json(database_connector, dataset_name)


@graph_json_controller_bp.route('/api/v2/json/class-graph/class-df-links', methods=['GET'])
def get_json_graph_df_c_nodes():
    dataset_name = request.args.get('dataset_name')

    return GraphJSONService.get_class_graph_df_links_json(database_connector, dataset_name)
