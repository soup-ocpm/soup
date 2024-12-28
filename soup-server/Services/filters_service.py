"""
------------------------------------------------------------------------
File : filters_service.py
Description: Service for Filters controller
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import json

from flask import jsonify
from Models.docker_file_manager_model import DockerFileManager
from Models.file_manager_model import FileManager
from Services.docker_service import DockerService
from Models.api_response_model import ApiResponse
from Utils.filter_query_lib import prototype_combined_query


# The service for docker controller
class FiltersService:

    @staticmethod
    def process_new_analyses_s(database_connector, filters_data):
        response = ApiResponse()

        try:
            # 0. Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = []
                return jsonify(response.to_dict()), 400

            # 1. Process the csv file on Docker Container
            result, new_analysis_name = process_new_analysis_file(container_id, filters_data)

            if result != 'success' or new_analysis_name is None:
                response.http_status_code = 500
                response.message = result
                response.response_data = None
                return jsonify(response.to_dict()), 500

            # 2. Proces the analysis
            dataset_name = filters_data.get("dataset_name")
            return FiltersService.process_analyses_s(database_connector, dataset_name, new_analysis_name)

        except Exception as e:
            response.response_data = None
            response.http_status_code = 500
            response.message = f'{e}'

    @staticmethod
    def process_analyses_s(database_connector, dataset_name, analyses_name):
        response = ApiResponse()

        try:
            # 0. Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = []
                return jsonify(response.to_dict()), 400

            # 1. Process the analysis
            result = process_analysis(container_id, database_connector, dataset_name, analyses_name)

            if result != 'success':
                response.http_status_code = 500
                response.message = result
                response.response_data = None
                return jsonify(response.to_dict()), 500

            # 3. Finally success
            response.http_status_code = 201
            response.message = 'Analysis created successfully'
            response.response_data = result
            return jsonify(response.to_dict()), 201

        except Exception as e:
            response.response_data = None
            response.http_status_code = 500
            response.message = f'{e}'
            return response

    @staticmethod
    def get_all_analyses_s(dataset_name):
        response = ApiResponse()

        try:
            # Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = None
                return jsonify(response.to_dict()), 400

            # 1. Get all analyses
            result, analyses_folders = DockerFileManager.get_folder_files(container_id,
                                                                          f'/soup/{dataset_name}/Analyses')

            if result != 'success':
                response.http_status_code = 400
                response.message = 'Internal Server Error. Error while retrieving the Analyses'
                response.response_data = result
                return jsonify(response.to_dict()), 400

            analyses_data = []

            # 2. For each analysis, get the specific information
            for analyses_name in analyses_folders:
                result, exec_config_file = DockerFileManager.read_json_file_from_container(container_id,
                                                                                           dataset_name,
                                                                                           analyses_name)

                if result == 'success':
                    # Check if it is already a dictionary
                    if not isinstance(exec_config_file, dict):
                        exec_config_file = json.loads(exec_config_file)
                    analyses_data.append(exec_config_file)

            # 3. Check the data
            if len(analyses_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = analyses_data
                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.message = 'Analyses retrieved successfully'
            response.response_data = analyses_data
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

    @staticmethod
    def check_unique_analysis_name(dataset_name, analysis_name):
        response = ApiResponse()

        try:
            # Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = None
                return jsonify(response.to_dict()), 400

            full_analysis_name = f'{analysis_name}.json'

            result, analyses_folder = DockerFileManager.get_folder_files(container_id,
                                                                         f'/soup/{dataset_name}/Analyses')

            if full_analysis_name not in analyses_folder:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = None
                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.message = 'Analysis name already exist'
            response.response_data = None
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error : {str(e)}"
            response.response_data = None
            return jsonify(response.to_dict()), 500

    @staticmethod
    def delete_analyses_s(dataset_name, analyses_name):
        response = ApiResponse()

        try:
            # 0. Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'Container not found'
                response.response_data = None
                return jsonify(response.to_dict()), 400

            # 1. Delete the folder
            full_analysis_name = f'{analyses_name}.json'
            folder_path = f'/soup/{dataset_name}/Analyses/{full_analysis_name}'
            result = DockerFileManager.remove_container_content_by_path(container_id, folder_path)

            if result != 'success':
                response.http_status_code = 404
                response.message = 'Unable to delete the Analysis'
                response.response_data = None
                return jsonify(response.to_dict()), 404

            result, container_folders = DockerFileManager.get_folder_files(container_id,
                                                                           f'/soup/{dataset_name}/Analyses/{full_analysis_name}')

            if analyses_name in container_folders:
                response.http_status_code = 404
                response.message = 'Unable to delete the Analysis'
                response.response_data = None
                return jsonify(response.to_dict()), 404

            response.http_status_code = 200
            response.message = 'Analysis deleted successfully'
            response.response_data = None
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500


# Process the new analyses files
def process_new_analysis_file(container_id, filters_data):
    try:
        # 1. Save the json file
        dataset_name = filters_data.get("dataset_name")
        analysis_name = filters_data.get("analysis_name")

        result, new_json_config_path = FileManager.copy_json_file(filters_data, analysis_name)

        if result != 'success' or new_json_config_path is None:
            return 'Error while copy the analysis json file on the Engine directory', None

        # 2. Save the json file on the docker container
        result, container_file_path = DockerFileManager.copy_analysis_file_to_container(container_id,
                                                                                        new_json_config_path,
                                                                                        dataset_name, analysis_name)
        if result != 'success' or container_file_path is None:
            return 'Error while copy the json file on the Engine directory', None

        return 'success', analysis_name

    except Exception as e:
        return f'${e}', None


# Process the analysis (filters)
def process_analysis(container_id, database_connector, dataset_name, analysis_name):
    try:
        analysis_data = None

        # 1. Check the name
        if not analysis_name.endswith(".json"):
            analysis_name = f'{analysis_name}.json'

        result, exec_config_file = DockerFileManager.read_json_file_from_container(container_id, dataset_name,
                                                                                   analysis_name)

        if result != 'success':
            return result

        # Check the instance
        if not isinstance(exec_config_file, dict):
            exec_config_file = json.loads(exec_config_file)
        analysis_data = exec_config_file

        query = prototype_combined_query(analysis_data)

        return 'success', None

    except Exception as e:
        return f'${e}', None
