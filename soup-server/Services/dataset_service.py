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
from Models.api_response_model import ApiResponse
from Models.file_manager_model import FileManager
from Models.docker_file_manager_model import DockerFileManager


# The Service for dataset
class DatasetService:

    @staticmethod
    def get_dataset_info_s(container_id, dataset_name):
        apiResponse = ApiResponse(None, None, None)

        try:
            result, exec_config_file = DockerFileManager.read_configuration_json_file(container_id, dataset_name)

            if result != 'success':
                apiResponse.http_status_code = 202
                apiResponse.message = 'No content'
                apiResponse.response_data = exec_config_file
                return jsonify(apiResponse.to_dict()), 202

            if not isinstance(exec_config_file, dict):
                exec_config_file = json.loads(exec_config_file)

            apiResponse.http_status_code = 200
            apiResponse.message = 'Dataset retrieved successfully'
            apiResponse.response_data = exec_config_file
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def get_all_dataset_info_s(container_id):
        apiResponse = ApiResponse(None, None, None)

        try:
            # 1. Get all datasets folder name
            result, container_folders = DockerFileManager.get_dataset_folders(container_id)

            if result != 'success':
                apiResponse.http_status_code = 400
                apiResponse.message = 'Internal Server Error. Error while retrieve the Datasets'
                apiResponse.response_data = result

            datasets_data = []

            # 2. For each dataset, get the specific information
            for dataset_name in container_folders:
                result, exec_config_file = DockerFileManager.read_configuration_json_file(container_id, dataset_name)
                if result == 'success':
                    # Check if it is already a dictionary
                    if not isinstance(exec_config_file, dict):
                        exec_config_file = json.loads(exec_config_file)
                    datasets_data.append(exec_config_file)

            # 3. Check the data
            if len(datasets_data) > 0:
                apiResponse.http_status_code = 200
                apiResponse.message = 'Datasets retrieved successfully'
                apiResponse.response_data = datasets_data
                return jsonify(apiResponse.to_dict()), 200

            apiResponse.http_status_code = 202
            apiResponse.message = 'No datasets'
            apiResponse.response_data = datasets_data
            return jsonify(apiResponse.to_dict()), 202

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def update_dataset_info_s(container_id, dataset_name, dataset_description):
        apiResponse = ApiResponse(None, None, None)

        try:
            result, exec_config_file = DockerFileManager.read_configuration_json_file(container_id, dataset_name)

            if result != 'success':
                apiResponse.http_status_code = 400
                apiResponse.message = 'Unable to update Dataset'
                apiResponse.response_data = result
                return jsonify(apiResponse.to_dict()), 400

            # Check if it is already a dictionary
            if not isinstance(exec_config_file, dict):
                exec_config_file = json.loads(exec_config_file)

            exec_config_file['dataset_description'] = dataset_description

            result, new_json_config_path = FileManager.copy_json_file(exec_config_file, dataset_name)
            if result != 'success' or new_json_config_path is None:
                apiResponse.http_status_code = 500
                apiResponse.message = 'Unable to update Dataset. Error while saving the config file'
                apiResponse.response_data = result
                return jsonify(apiResponse.to_dict()), 500

            result, new_json_config_docker_file_path = DockerFileManager.copy_file_to_container(
                container_id,
                dataset_name,
                new_json_config_path,
                False, True)

            if result != 'success' or new_json_config_docker_file_path is None:
                apiResponse.http_status_code = 500
                apiResponse.message = 'Unable to update Dataset. Error while saving the config file on Docker container'
                apiResponse.response_data = result
                return jsonify(apiResponse.to_dict()), 500

            FileManager.delete_json_file(dataset_name)

            apiResponse.http_status_code = 200
            apiResponse.message = 'Dataset updated successfully'
            apiResponse.response_data = exec_config_file
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            print(f"Error: {e}")
            apiResponse.http_status_code = 500
            apiResponse.message = 'An unexpected error occurred'
            apiResponse.response_data = str(e)
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def delete_dataset_s(container_id, dataset_name):
        apiResponse = ApiResponse(None, None, None)

        try:
            # 1. Delete the folder
            folder_path = f'/soup/{dataset_name}'
            result = DockerFileManager.remove_container_file_folder(container_id, folder_path)

            if result != 'success':
                apiResponse.http_status_code = 404
                apiResponse.message = 'Unable to delete the dataset'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 404

            result, container_folders = DockerFileManager.get_dataset_folders(container_id)

            if dataset_name in container_folders:
                apiResponse.http_status_code = 404
                apiResponse.message = 'Unable to delete the dataset'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 404

            apiResponse.http_status_code = 200
            apiResponse.message = 'Dataset deleted successfully'
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

    @staticmethod
    def check_unique_dataset_name_s(container_id, dataset_name):
        apiResponse = ApiResponse(None, None, None)

        try:
            result, container_folders = DockerFileManager.get_dataset_folders(container_id)

            if dataset_name in container_folders:
                apiResponse.http_status_code = 200
                apiResponse.message = 'Dataset already exist'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 200

            apiResponse.http_status_code = 202
            apiResponse.message = 'No content'
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 202

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f"Internal Server Error : {str(e)}"
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 500
