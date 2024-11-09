"""
------------------------------------------------------------------------
File : graph_service.py
Description: Service for graph controller
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import io
import pandas as pd

from flask import jsonify
from Services.generic_graph_service import GenericGraphService
from Models.file_manager_model import FileManager
from Models.docker_file_manager_model import DockerFileManager
from Models.api_response_model import ApiResponse


# The Service for graph controller
class GraphService:

    @staticmethod
    def create_new_dataset(file, copy_file, dataset_name, dataset_description, standard_column,
                           filtered_column, values_column, fixed_column, variable_column, container_id,
                           database_connector):

        apiResponse = ApiResponse(None, None, None)

        causality = None
        if not (fixed_column is None and values_column is None):
            causality = (fixed_column, variable_column)

        try:

            file_data = copy_file.read().decode('utf-8')
            df = pd.read_csv(io.StringIO(file_data))

            # 1. Process the csv file on Docker Container
            result = process_new_dataset_files(container_id, file, df, dataset_name, dataset_description,
                                               standard_column, filtered_column, values_column, fixed_column,
                                               variable_column, causality)

            if result != 'success':
                apiResponse.http_status_code = 500
                apiResponse.message = result
                apiResponse.response_data = []
                return jsonify(apiResponse.to_dict()), 500

            build_result = GenericGraphService.create_complete_graphs(container_id, database_connector, dataset_name)

            if build_result != 'success':
                folder_path = f'/soup/{dataset_name}'
                DockerFileManager.remove_container_file_folder(container_id, folder_path)
                apiResponse.http_status_code = 400
                apiResponse.message = 'Error while create the graph'
                apiResponse.response_data = build_result
                return jsonify(apiResponse.to_dict()), 400

            # 5. Finally success
            apiResponse.http_status_code = 201
            apiResponse.message = 'Create graph successfully'
            apiResponse.response_data = build_result
            return jsonify(apiResponse.to_dict()), 201

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f'Internal Server Error: {str(e)}.'
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 500
        finally:
            database_connector.close()


# 1. Process the file new Dataset file
def process_new_dataset_files(container_id, file, df, dataset_name, dataset_description, standard_columns,
                              filtered_columns, values_columns, fixed_columns, variable_columns, causality):
    try:
        # 1. Original csv file processes
        result, new_file_path = FileManager.copy_csv_file(file, dataset_name, False)
        if result is not "success" or new_file_path is None:
            return 'Error while copy the file on the Engine'

        result, new_docker_file_path = DockerFileManager.copy_file_to_container(container_id, dataset_name,
                                                                                new_file_path, False, False)
        if result != 'success' or new_docker_file_path is None:
            return 'Error while copy the original csv file on the Docker Container'

        result = FileManager.delete_csv_file(dataset_name, False)
        if result != 'success':
            return result

        # 2. Entity nodes csv file processes
        entities = filtered_columns
        unique_values_data = []
        for col in entities:
            if col not in standard_columns:
                unique_values = df[col].unique()
                for value in unique_values:
                    if not str(value) == "nan":
                        unique_values_data.append({'type': col, 'value': value})
        unique_values_df = pd.DataFrame(unique_values_data)

        result, new_entity_file_path = FileManager.copy_csv_file(unique_values_df, dataset_name, True)
        if result != 'success' or new_entity_file_path is None:
            return 'Error while copy the entity node csv on the Engine'

        result, new_entity_docker_file_path = DockerFileManager.copy_file_to_container(container_id, dataset_name,
                                                                                       new_entity_file_path, True)

        if result != 'success' or new_entity_docker_file_path is None:
            return result

        result = FileManager.delete_csv_file(dataset_name, True)

        if result != 'success':
            return result

        # 3. Configuration json file processes
        json_result = FileManager.create_json_file(dataset_name, dataset_description, standard_columns,
                                                   filtered_columns, values_columns, fixed_columns,
                                                   variable_columns, causality if causality else 0)
        if json_result is None:
            return 'Error while creating the json file configuration'

        result, new_json_config_path = FileManager.copy_json_file(json_result, dataset_name)
        if result != 'success' or new_json_config_path is None:
            return 'Error while copy the json file on the Engine directory'

        result, new_json_config_docker_file_path = DockerFileManager.copy_file_to_container(container_id,
                                                                                            dataset_name,
                                                                                            new_json_config_path,
                                                                                            False, True)
        if result != 'success' or new_json_config_docker_file_path is None:
            return result

        result = FileManager.delete_json_file(dataset_name)

        if result != 'success':
            return result

        return 'success'

    except Exception as e:
        return f'${e}'
