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
from Services.dataset_service import DatasetService

# Init the bp
dataset_controller_bp = Blueprint('dataset_controller_bp', __name__)


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['GET'])
def get_dataset_info():
    """
    Get specific dataset info
    :return: ApiResponse model
    """
    dataset_name = request.args.get('dataset_name', type=str)
    return DatasetService.get_dataset_info_s(dataset_name)


@dataset_controller_bp.route('/api/v2/datasets', methods=['GET'])
def get_all_dataset_info():
    """
    Get all dataset information
    :return: ApiResponse model
    """
    return DatasetService.get_all_dataset_info_s()


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['PUT'])
def update_dataset_info():
    """
    Update specific dataset info
    :return: ApiResponse model
    """
    data = request.get_json()
    dataset_name = data.get('dataset_name')
    dataset_description = data.get('dataset_description')

    return DatasetService.update_dataset_info_s(dataset_name, dataset_description)


@dataset_controller_bp.route('/api/v2/datasets/exist', methods=['POST'])
def check_unique_dataset():
    """
    Check the unique name for new dataset
    :return: ApiResponse model
    """
    data = request.get_json()
    dataset_name = data.get('dataset_name')

    return DatasetService.check_unique_dataset_name_s(dataset_name)


@dataset_controller_bp.route('/api/v2/datasets/single', methods=['DELETE'])
def delete_dataset():
    """
    Delete specific dataset
    :return: ApiResponse model
    """
    dataset_name = request.args.get('dataset_name')

    return DatasetService.delete_dataset_s(dataset_name)
