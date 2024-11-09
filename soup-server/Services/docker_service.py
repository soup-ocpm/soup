"""
------------------------------------------------------------------------
File : docker_service.py
Description: Service for Docker container controller
Date creation: 07-07-2024
Project : soup-server
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
            error = e.args[0]
            if "Error while fetching server API version" in error:
                apiResponse.http_status_code = 400
                apiResponse.response_data = None
                apiResponse.message = "Docker Engine is exited."
                return jsonify(apiResponse.to_dict()), 400
            else:
                apiResponse.http_status_code = 500
                apiResponse.response_data = None
                apiResponse.message = f"An unexpected error occurred: {str(e)}"
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

    @staticmethod
    def get_directory_content_s(container_id, path):
        apiResponse = ApiResponse(None, None, None)

        try:
            client = docker.from_env()
            container = client.containers.get(container_id)

            # Get the folders
            command_dirs = f"/bin/sh -c \"ls -l {path} | grep '^d' | awk '{{print $NF}}'\""
            exit_code_dirs, output_dirs = container.exec_run(command_dirs)

            if exit_code_dirs != 0:
                raise Exception(
                    f'Command for directories failed with exit code {exit_code_dirs}: {output_dirs.decode()}')

            # Get the container folder files
            command_files = f"/bin/sh -c \"ls -l {path} | grep -v '^d' | awk '{{print $NF}}'\""
            exit_code_files, output_files = container.exec_run(command_files)

            if exit_code_files != 0:
                raise Exception(f'Command for files failed with exit code {exit_code_files}: {output_files.decode()}')

            folder_names = output_dirs.decode().strip().split('\n') if output_dirs else []
            file_names = output_files.decode().strip().split('\n') if output_files else []

            if not any(folder_names) and not any(file_names):
                apiResponse.http_status_code = 202
                apiResponse.response_data = None
                apiResponse.message = 'No Content'
                return jsonify(apiResponse.to_dict()), 202

            response_data = {
                "container_id": container_id,
                "path": path,
                "directories": folder_names if any(folder_names) else [],
                "files": file_names if any(file_names) else []
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
