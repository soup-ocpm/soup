"""
-------------------------------
File : class_graph_service.py
Description: Service for class graph
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
-------------------------------
"""

# Import
import json

from flask import jsonify
from datetime import datetime
from Services.docker_service import DockerService
from Models.api_response_model import ApiResponse
from Models.docker_file_manager_model import DockerFileManager
from Models.file_manager_model import FileManager


# The Service for dataset
class DatasetService:

    @staticmethod
    def get_dataset_info_s(dataset_name):
        response = ApiResponse()

        try:
            # Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = None
                return jsonify(response.to_dict()), 400

            result, exec_config_file = DockerFileManager.read_json_file_from_container(container_id, dataset_name)

            if result != 'success':
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = exec_config_file
                return jsonify(response.to_dict()), 202

            if not isinstance(exec_config_file, dict):
                exec_config_file = json.loads(exec_config_file)

            result, svg_content = DockerFileManager.get_svg_content_from_container(container_id, dataset_name)
            if result == 'success' and svg_content is not None:
                exec_config_file['svg_content'] = svg_content
            else:
                exec_config_file['svg_content'] = None

            response.http_status_code = 200
            response.message = 'Dataset retrieved successfully'
            response.response_data = exec_config_file
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

    @staticmethod
    def get_all_dataset_info_s():
        response = ApiResponse()

        try:
            # Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = None
                return jsonify(response.to_dict()), 400

            # 1. Get all datasets folder name
            result, container_folders = DockerFileManager.get_folder_files(container_id, '/soup')

            if result != 'success':
                response.http_status_code = 400
                response.message = 'Internal Server Error. Error while retrieving the Datasets'
                response.response_data = result
                return jsonify(response.to_dict()), 400

            datasets_data = []

            # 2. For each dataset, get the specific information
            for dataset_name in container_folders:
                # Retrieve configuration file
                result, exec_config_file = DockerFileManager.read_json_file_from_container(container_id, dataset_name)

                if result == 'success':
                    # Check if it is already a dictionary
                    if not isinstance(exec_config_file, dict):
                        exec_config_file = json.loads(exec_config_file)

                    # 2.1 Get the SVG file content if exists
                    result, svg_content = DockerFileManager.get_svg_content_from_container(container_id, dataset_name)
                    if result == 'success' and svg_content is not None:
                        exec_config_file['svg_content'] = svg_content
                    else:
                        exec_config_file['svg_content'] = None

                    datasets_data.append(exec_config_file)

            # 3. Check the data
            if len(datasets_data) == 0:
                response.http_status_code = 202
                response.message = 'No datasets'
                response.response_data = datasets_data
                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.message = 'Datasets retrieved successfully'
            response.response_data = datasets_data
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

    @staticmethod
    def update_dataset_info_s(dataset_name, dataset_description):
        response = ApiResponse()

        try:
            # Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = None
                return jsonify(response.to_dict()), 400

            result, exec_config_file = DockerFileManager.read_json_file_from_container(container_id, dataset_name)

            if result != 'success':
                response.http_status_code = 400
                response.message = 'Unable to update Dataset'
                response.response_data = result
                return jsonify(response.to_dict()), 400

            # Check if it is already a dictionary
            if not isinstance(exec_config_file, dict):
                exec_config_file = json.loads(exec_config_file)

            exec_config_file['dataset_description'] = dataset_description
            exec_config_file['date_modified'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

            result, new_json_config_path = FileManager.copy_json_file(exec_config_file, dataset_name)
            if result != 'success' or new_json_config_path is None:
                response.http_status_code = 500
                response.message = 'Unable to update Dataset. Error while saving the config file'
                response.response_data = result
                return jsonify(response.to_dict()), 500

            result, new_json_config_docker_file_path = DockerFileManager.copy_file_to_container(container_id,
                                                                                                dataset_name,
                                                                                                new_json_config_path,
                                                                                                False, True)

            if result != 'success' or new_json_config_docker_file_path is None:
                response.http_status_code = 500
                response.message = 'Unable to update Dataset. Error while saving the config file on Docker container'
                response.response_data = result
                return jsonify(response.to_dict()), 500

            FileManager.delete_file(dataset_name, "json", False)

            response.http_status_code = 200
            response.message = 'Dataset updated successfully'
            response.response_data = exec_config_file
            return jsonify(response.to_dict()), 200

        except Exception as e:
            print(f"Error: {e}")
            response.http_status_code = 500
            response.message = 'An unexpected error occurred'
            response.response_data = str(e)
            return jsonify(response.to_dict()), 500

    @staticmethod
    def delete_dataset_s(dataset_name):
        response = ApiResponse()

        try:
            # Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = None
                return jsonify(response.to_dict()), 400

            # 1. Delete the folder
            folder_path = f'/soup/{dataset_name}'
            result = DockerFileManager.remove_container_content_by_path(container_id, folder_path)

            if result != 'success':
                response.http_status_code = 404
                response.message = 'Unable to delete the dataset'
                response.response_data = None
                return jsonify(response.to_dict()), 404

            result, container_folders = DockerFileManager.get_folder_files(container_id, '/soup')

            if dataset_name in container_folders:
                response.http_status_code = 404
                response.message = 'Unable to delete the dataset'
                response.response_data = None
                return jsonify(response.to_dict()), 404

            response.http_status_code = 200
            response.message = 'Dataset deleted successfully'
            response.response_data = None
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

    @staticmethod
    def check_unique_dataset_name_s(dataset_name):
        response = ApiResponse()

        try:
            # Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = None
                return jsonify(response.to_dict()), 400

            result, container_folders = DockerFileManager.get_folder_files(container_id, '/soup')

            if dataset_name in container_folders:
                response.http_status_code = 200
                response.message = 'Dataset already exist'
                response.response_data = None
                return jsonify(response.to_dict()), 200

            response.http_status_code = 202
            response.message = 'No content'
            response.response_data = None
            return jsonify(response.to_dict()), 202

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error : {str(e)}"
            response.response_data = None
            return jsonify(response.to_dict()), 500
