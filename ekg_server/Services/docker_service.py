"""
------------------------------------------------------------------------
File : docker_service.py
Description: Service for Docker container controller
Date creation: 07-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import docker

from flask import jsonify
from Models.api_response_model import ApiResponse


# The service for docker controller
class DockerService:

    @staticmethod
    def get_docker_containers_s():
        apiResponse = ApiResponse(None, None, None)

        try:
            client = docker.from_env()
            all_containers = client.containers.list(all=True)

            all_containers_info = [
                {
                    "name": container.name,
                    "id": container.id,
                    "status": container.status,
                    "image": container.image.tags[0] if container.image.tags else "unknown"
                }
                for container in all_containers
            ]

            response_data = {
                "all_containers": all_containers_info
            }

            apiResponse.http_status_code = 200
            apiResponse.response_data = response_data
            apiResponse.message = 'Success'
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def get_active_docker_containers_s():
        apiResponse = ApiResponse(None, None, None)

        try:
            client = docker.from_env()
            all_containers = client.containers.list(all=True)

            active_containers = [
                {"name": container.name, "id": container.id, "status": container.status}
                for container in all_containers if container.status == 'running'
            ]

            response_data = {
                "active_containers": active_containers
            }

            apiResponse.http_status_code = 200
            apiResponse.response_data = response_data
            apiResponse.message = 'Success'
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def get_stopped_docker_containers_s():
        apiResponse = ApiResponse(None, None, None)

        try:
            client = docker.from_env()
            all_containers = client.containers.list(all=True)

            stopped_containers = [
                {"name": container.name, "id": container.id, "status": container.status}
                for container in all_containers if container.status == 'exited'
            ]

            response_data = {
                "stopped_containers": stopped_containers
            }

            apiResponse.http_status_code = 200
            apiResponse.response_data = response_data
            apiResponse.message = 'Success'
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def get_container_directories_s(container_id, path):
        apiResponse = ApiResponse(None, None, None)

        try:
            client = docker.from_env()
            container = client.containers.get(container_id)
            exit_code, output = container.exec_run(f'ls -l {path}')

            if exit_code != 0:
                raise Exception(f'Command failed with exit code {exit_code}: {output.decode()}')

            directories = output.decode().strip().split('\n')

            response_data = {
                "container_id": container_id,
                "path": path,
                "directories": directories
            }

            apiResponse.http_status_code = 200
            apiResponse.response_data = response_data
            apiResponse.message = 'Success'
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def check_memgraph_password(container_name):
        apiResponse = ApiResponse(None, None, None)

        try:
            client = docker.from_env()
            all_containers = client.containers.list(all=True)

            memgraph_container_info = []

            for container in all_containers:
                if container_name in container.image.tags[0] if container.image.tags else "":
                    container_info = {
                        "name": container.name,
                        "id": container.id,
                        "status": container.status,
                        "image": container.image.tags[0] if container.image.tags else "unknown",
                        "requires_password": False
                    }

                    # Check if MEMGRAPH_PASSWORD environment variable is set
                    container_details = client.api.inspect_container(container.id)
                    env_vars = container_details['Config']['Env']
                    for env_var in env_vars:
                        if env_var.startswith('MEMGRAPH_PASSWORD='):
                            password_value = env_var.split('=')[1]
                            if password_value:
                                container_info["requires_password"] = True
                            break

                    memgraph_container_info.append(container_info)

            response_data = {
                "memgraph_containers": memgraph_container_info
            }

            apiResponse.http_status_code = 200
            apiResponse.response_data = response_data
            apiResponse.message = 'Success'
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error: {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def start_container_s(container_id):
        apiResponse = ApiResponse(None, None, None)

        try:
            client = docker.from_env()
            container = client.containers.get(container_id)
            container.start()
            container.reload()
            response_data = {
                "container_id": container.id,
                "name": container.name,
                "status": container.status,
                "image": container.image.tags[0] if container.image.tags else "unknown"
            }

            apiResponse.http_status_code = 200
            apiResponse.response_data = response_data
            apiResponse.message = 'Container started successfully'
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Failed to start container: {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def stop_container_s(container_id):
        apiResponse = ApiResponse(None, None, None)

        try:
            client = docker.from_env()
            container = client.containers.get(container_id)
            container.stop()
            container.reload()
            response_data = {
                "container_id": container.id,
                "name": container.name,
                "status": container.status,
                "image": container.image.tags[0] if container.image.tags else "unknown"
            }

            apiResponse.http_status_code = 200
            apiResponse.response_data = response_data
            apiResponse.message = 'Container stopped successfully'
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Failed to stop container: {str(e)}'
            return jsonify(apiResponse.to_dict()), 500
