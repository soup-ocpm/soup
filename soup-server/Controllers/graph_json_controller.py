"""
------------------------------------------------------------------------
File : graph_json_controller.py
Description: Controller for graphs json operation
Date creation: 27-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint
from Controllers.graph_config import get_db_connector
from Services.AggregateGraph.op_class_graph_service import OperationClassGraphService
from Services.Graph.op_graph_service import OperationGraphService
from Models.logger_model import Logger

# Init the bp
graph_json_controller_bp = Blueprint('graph_json_controller_bp', __name__)

# Engine database setup
database_connector = get_db_connector(debug=False)

# Engine logger setup
logger = Logger()


# Standard Graph JSON
@graph_json_controller_bp.route('/api/v2/json/graph/event-nodes', methods=['GET'])
def get_json_graph_event_nodes():
    """
    Get event nodes json
    :return: ApiResponse model
    """
    return OperationGraphService.get_event_nodes_s(database_connector)


@graph_json_controller_bp.route('/api/v2/json/graph/entity-nodes', methods=['GET'])
def get_json_graph_entity_nodes():
    """
    Get entity nodes json
    :return: ApiResponse model
    """
    return OperationGraphService.get_entity_nodes_s(database_connector)


@graph_json_controller_bp.route('/api/v2/json/graph/corr-links', methods=['GET'])
def get_json_graph_corr_rel():
    """
    Get :CORR relationships json
    :return: ApiResponse model
    """
    return OperationGraphService.get_corr_relationships_s(database_connector)


@graph_json_controller_bp.route('/api/v2/json/graph/df-links', methods=['GET'])
def get_json_graph_df_rel():
    """
    Get :DF relationships json
    :return: ApiResponse model
    """
    return OperationGraphService.get_df_relationships_s(database_connector)


# Class Graph JSON
@graph_json_controller_bp.route('/api/v2/json/class-graph/class-nodes', methods=['GET'])
def get_json_graph_class_nodes():
    """
    Get class nodes json
    :return: ApiResponse model
    """
    return OperationClassGraphService.get_class_nodes_s(database_connector)


@graph_json_controller_bp.route('/api/v2/json/class-graph/class-obs-links', methods=['GET'])
def get_json_graph_obs_rel():
    """
    Get :OBS relationships json
    :return: ApiResponse model
    """
    return OperationClassGraphService.get_obs_relationships_s(database_connector)


@graph_json_controller_bp.route('/api/v2/json/class-graph/class-df-links', methods=['GET'])
def get_json_graph_df_c_rel():
    """
    Get :DFC relationships json
    :return: ApiResponse model
    """
    return OperationClassGraphService.get_dfc_relationships_s(database_connector)
