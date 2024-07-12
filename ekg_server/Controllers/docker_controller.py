"""
-------------------------------
File : docker_controller.py
Description: Controller for docker containers
Date creation: 05-07-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""

# Import
from flask import Blueprint, request
from Services.docker_service import *

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


@docker_controller_bp.route('/api/v2/docker/directories', methods=['GET'])
def get_container_directories():
    data = request.get_json()
    container_id = data.get('container_id')
    path = data.get('path', '/')

    return DockerService.get_container_directories_s(container_id, path)


@docker_controller_bp.route('/api/v2/docker/require-password', methods=['GET'])
def get_required_container():
    data = request.get_json()
    container_name = data.get('container_name')
    return DockerService.check_memgraph_password(container_name)


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
