"""
------------------------------------------------------------------------
File : dataset_controller.py
Description: Controller for the Memgraph datasets
Date creation: 12-10-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint, request
from Controllers.graph_config import get_db_connector
from Services.dataset_service import *

# Init the bp
dataset_controller_bp = Blueprint('dataset_controller_bp', __name__)

# Database information
database_connector = get_db_connector(debug=True)


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['GET'])
def get_dataset():
    dataset_name = request.args.get('dataset_name')

    return DatasetService.get_dataset_s(database_connector, dataset_name)


@dataset_controller_bp.route('/api/v2/datasets', methods=['GET'])
def get_all_dataset():
    return DatasetService.get_all_dataset_s(database_connector)


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['PUT'])
def update_dataset():
    dataset_name = request.form.get('dataset_name')
    dataset_description = request.form.get('dataset_description')

    return DatasetService.update_dataset_s(database_connector, dataset_name, dataset_description)


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['DELETE'])
def delete_dataset():
    dataset_name = request.args.get('dataset_name')

    return DatasetService.delete_dataset_s(database_connector, dataset_name)


@dataset_controller_bp.route('/api/v2/datasets/exist', methods=['POST'])
def check_unique_dataset():
    dataset_name = request.form.get('dataset_name')

    return DatasetService.check_unique_dataset_name_s(database_connector, dataset_name)
