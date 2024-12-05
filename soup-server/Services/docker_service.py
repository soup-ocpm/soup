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
import subprocess

from flask import jsonify
from Models.api_response_model import ApiResponse


# The service for docker controller
class DockerService:

    @staticmethod
    def get_docker_containers_s():
        response = ApiResponse()

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

            response.http_status_code = 200
            response.response_data = response_data
            response.message = 'Success'
            return jsonify(response.to_dict()), 200

        except Exception as e:
            error = e.args[0]
            if "Error while fetching server API version" in error:
                response.http_status_code = 400
                response.response_data = None
                response.message = "Docker Engine is exited."
                return jsonify(response.to_dict()), 400
            else:
                response.http_status_code = 500
                response.response_data = None
                response.message = f"An unexpected error occurred: {str(e)}"
                return jsonify(response.to_dict()), 500

    @staticmethod
    def get_active_docker_containers_s():
        response = ApiResponse()

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

            response.http_status_code = 200
            response.response_data = response_data
            response.message = 'Success'
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

    @staticmethod
    def get_stopped_docker_containers_s():
        response = ApiResponse()

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

            response.http_status_code = 200
            response.response_data = response_data
            response.message = 'Success'
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

    @staticmethod
    def start_container_s(container_id):
        response = ApiResponse()

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

            response.http_status_code = 200
            response.response_data = response_data
            response.message = 'Container started successfully'
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Failed to start container: {str(e)}'
            return jsonify(response.to_dict()), 500

    @staticmethod
    def stop_container_s(container_id):
        response = ApiResponse()

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

            response.http_status_code = 200
            response.response_data = response_data
            response.message = 'Container stopped successfully'
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Failed to stop container: {str(e)}'
            return jsonify(response.to_dict()), 500

    @staticmethod
    def get_directory_content_s(container_id, path):
        response = ApiResponse()

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
                response.http_status_code = 202
                response.response_data = None
                response.message = 'No Content'
                return jsonify(response.to_dict()), 202

            response_data = {
                "container_id": container_id,
                "path": path,
                "directories": folder_names if any(folder_names) else [],
                "files": file_names if any(file_names) else []
            }

            response.http_status_code = 200
            response.response_data = response_data
            response.message = 'Success'
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

    @staticmethod
    # Get the docker container id by the name
    def get_container_id(container_name="memgraph"):
        try:
            result = subprocess.run(
                ["docker", "inspect", "--format", "{{.Id}}", container_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True
            )
            container_id = result.stdout.decode('utf-8').strip()
            return container_id
        except subprocess.CalledProcessError as e:
            print(f"Error while retrieving docker container id: {e}")
            return None
