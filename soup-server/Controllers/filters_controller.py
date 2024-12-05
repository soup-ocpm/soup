"""
------------------------------------------------------------------------
File : filters_controller.py
Description: Controller for apply filters in EKG
Date creation: 03-12-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint, request, jsonify
from Services.docker_service import DockerService
from Models.api_response_model import ApiResponse

# Init the bp
filters_controller_bp = Blueprint('filters_controller_bp', __name__)


@filters_controller_bp.route('/api/v2/docker', methods=['GET'])
def get_all_containers():
    return DockerService.get_docker_containers_s()
