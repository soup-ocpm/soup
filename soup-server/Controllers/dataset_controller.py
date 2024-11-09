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
from flask import Blueprint, request
from Controllers.graph_config import get_db_connector
from Services.dataset_service import DatasetService

# Init the bp
dataset_controller_bp = Blueprint('dataset_controller_bp', __name__)

# Database information
database_connector = get_db_connector(debug=False)


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['GET'])
def get_dataset_info():
    container_id = request.args.get('container_id', type=str)
    dataset_name = request.args.get('dataset_name', type=str)

    return DatasetService.get_dataset_info_s(container_id, dataset_name)


@dataset_controller_bp.route('/api/v2/datasets', methods=['GET'])
def get_all_dataset_info():
    container_id = request.args.get('container_id', type=str)

    return DatasetService.get_all_dataset_info_s(container_id)


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['PUT'])
def update_dataset_info():
    data = request.get_json()
    container_id = data.get('container_id')
    dataset_name = data.get('dataset_name')
    dataset_description = data.get('dataset_description')

    return DatasetService.update_dataset_info_s(container_id, dataset_name, dataset_description)


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['DELETE'])
def delete_dataset():
    container_id = request.args.get('container_id')
    dataset_name = request.args.get('dataset_name')

    return DatasetService.delete_dataset_s(container_id, dataset_name)


@dataset_controller_bp.route('/api/v2/datasets/exist', methods=['POST'])
def check_unique_dataset():
    data = request.get_json()
    container_id = data.get('container_id')
    dataset_name = data.get('dataset_name')

    return DatasetService.check_unique_dataset_name_s(container_id, dataset_name)
