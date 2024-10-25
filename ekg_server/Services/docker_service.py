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
import io
import docker
import tarfile

from pathlib import Path
from flask import jsonify
from datetime import datetime
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

    @staticmethod
    def copy_csv_file(container_id, file):
        try:
            project_dir = Path(__file__).parent

            temp_dir = project_dir / 'temp_csv'

            # 1. Create temp directory
            if not temp_dir.exists():
                temp_dir.mkdir(parents=True)

            ct = datetime.now().strftime("%Y%m%d%H%M%S")
            file_name = f'{ct}_{file.filename}'
            temp_csv_path = temp_dir / file_name

            # 2. Save the file in the directory
            file.save(temp_csv_path)

            client = docker.from_env()
            container = client.containers.get(container_id)

            # 3. Create a tar archive of the file
            tarstream = io.BytesIO()
            with tarfile.open(fileobj=tarstream, mode='w') as tar:
                tar.add(temp_csv_path, arcname=file_name)
            tarstream.seek(0)

            # 4. Copy the tar archive into the container
            container.put_archive('/tmp', tarstream)
            container_csv_path = f'/tmp/{file_name}'

            # 5. Check if the file was copied or not
            result = container.exec_run(['ls', '/tmp'])
            if result.exit_code != 0:
                return 'error'

            if file_name in result.output.decode():
                print(f"File correctly imported: {file_name} exists in container {container_id}")
            else:
                print(f"File {file_name} does not exist in container {container_id}")
                return 'error'

            print(f'File saved on container with path: {container_csv_path}')
            return container_csv_path

        except Exception as e:
            print(e)
            return 'error'

    @staticmethod
    def copy_entity_csv_file(container_id, unique_values_df):
        try:
            project_dir = Path(__file__).parent
            temp_dir = project_dir / 'temp'

            if not temp_dir.exists():
                temp_dir.mkdir(parents=True)

            ct = datetime.now().strftime("%Y%m%d%H%M%S")
            file_name = f'{ct}_entities_unique_value.csv'
            temp_csv_path = temp_dir / file_name

            unique_values_df.to_csv(temp_csv_path, index=False)
            print(f'File saved in: {temp_csv_path}')

            # 2. Copy the file into the container
            client = docker.from_env()
            container = client.containers.get(container_id)

            # 3. Create a tar archive of the file
            tarstream = io.BytesIO()
            with tarfile.open(fileobj=tarstream, mode='w') as tar:
                tar.add(temp_csv_path, arcname=file_name)
            tarstream.seek(0)

            # 4. Copy the tar archive into the container
            container.put_archive('/tmp', tarstream)
            container_csv_path = f'/tmp/{file_name}'

            # 5. Check if the file was copied or not
            result = container.exec_run(['ls', '/tmp'])
            if result.exit_code != 0:
                return 'error'

            if file_name in result.output.decode():
                print(f"File correctly imported: {file_name} exists in container {container_id}")
            else:
                print(f"File {file_name} does not exist in container {container_id}")
                return 'error'

            print(f'File saved on container with path: {container_csv_path}')
            return container_csv_path
        except Exception as e:
            print(e)
            return 'error'

    @staticmethod
    def remove_csv_file(container_id, container_csv_path):
        client = docker.from_env()
        container = client.containers.get(container_id)
        container.exec_run(['rm', container_csv_path])
