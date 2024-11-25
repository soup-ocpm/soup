"""
------------------------------------------------------------------------
File : docker_controller.py
Description: Controller for docker containers
Date creation: 05-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Blueprint, request, jsonify
from Controllers.graph_config import get_container_id
from Models.api_response_model import ApiResponse
from Services.docker_service import DockerService

# Init the bp
docker_controller_bp = Blueprint('docker_controller_bp', __name__)


@docker_controller_bp.route('/api/v2/docker', methods=['GET'])
def get_all_containers():
    return DockerService.get_docker_containers_s()


@docker_controller_bp.route('/api/v2/docker/active', methods=['GET'])
def get_active_containers():
    return DockerService.get_active_docker_containers_s()


@docker_controller_bp.route('/api/v2/docker/exited', methods=['GET'])
def get_exited_containers():
    return DockerService.get_stopped_docker_containers_s()

@docker_controller_bp.route('/api/v2/docker/id', methods=['POST'])
def get_docker_container_id():
    data = request.get_json()
    container_name = data.get('container_name')
    response = ApiResponse()

    try:
        container_id = get_container_id(container_name)

        if container_id is None or container_id == '':
            response.http_status_code = 400
            response.response_data = None
            response.message = 'Container id not found'

        response.http_status_code = 200
        response.response_data = container_id
        response.message = 'Container id retrieve successful'

        return jsonify(response.to_dict()), 200

    except Exception as e:
        response.status_code = 500
        response.message = f'Internal Server Error: {e}'
        response.response_data = None


@docker_controller_bp.route('/api/v2/docker/start', methods=['POST'])
def run_container():
    data = request.get_json()
    container_id = data.get('container_id')

    return DockerService.start_container_s(container_id)


@docker_controller_bp.route('/api/v2/docker/stop', methods=['POST'])
def stop_container():
    data = request.get_json()
    container_id = data.get('container_id')

    return DockerService.stop_container_s(container_id)
