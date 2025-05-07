"""
------------------------------------------------------------------------
File : graph_service.py
Description: Service for standard graph
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
from Services.docker_service import DockerService
from Services.generic_graph_service import GenericGraphService
from Models.file_manager_model import FileManager
from Models.docker_file_manager_model import DockerFileManager
from Models.api_response_model import ApiResponse
from Models.logger_model import Logger

# Engine logger setup
logger = Logger()


# The Service for standard graph
class GraphService:

    # Create new dataset
    @staticmethod
    def create_new_dataset_s(file, copy_file, dataset_name, dataset_description, all_columns, standard_column,
                             filtered_column, values_column, trigger_target_rows, database_connector):

        response = ApiResponse()

        try:

            file_data = copy_file.read().decode('utf-8')
            df = pd.read_csv(io.StringIO(file_data))

            # 0. Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'SOUP Database is offline or does not exist'
                response.response_data = []

                logger.error('SOUP Database is offline or does not exist')
                return jsonify(response.to_dict()), 400

            # 1. Process the csv file on Docker Container
            result = process_new_dataset_files(container_id, file, df, dataset_name, dataset_description, all_columns,
                                               standard_column, filtered_column, values_column, trigger_target_rows)

            if result != 'success':
                response.http_status_code = 500
                response.message = result
                response.response_data = []

                logger.error(f'Failed to process new dataset files: {str(result)}')
                return jsonify(response.to_dict()), 500

            build_result = GenericGraphService.create_complete_graphs_s(container_id, database_connector, dataset_name)

            if build_result != 'success':
                folder_path = f'/soup/{dataset_name}'
                DockerFileManager.remove_container_content_by_path(container_id, folder_path)
                response.http_status_code = 400
                response.message = 'Error while create the graph'
                response.response_data = build_result

                logger.error(f'Error while create the graph: {str(build_result)}')
                return jsonify(response.to_dict()), 400

            # 5. Finally success
            response.http_status_code = 201
            response.message = 'Create graph successfully'
            response.response_data = build_result

            logger.info(f'Successfully created new dataset')
            return jsonify(response.to_dict()), 201

        except Exception as e:
            response.http_status_code = 500
            response.message = f'Internal Server Error: {str(e)}.'
            response.response_data = None

            logger.error(f'Internal Server Error: {str(e)}')
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()


# Process the file new Dataset file
def process_new_dataset_files(container_id, file, df, dataset_name, dataset_description, all_columns, standard_columns,
                              filtered_columns, values_columns, trigger_target_rows):
    try:
        # 1. Original csv file processes
        result, new_file_path = FileManager.copy_csv_file(file, dataset_name, False)

        if result != "success" or new_file_path is None:
            return 'Error while copy the file on the Engine'

        result, new_docker_file_path = DockerFileManager.copy_file_to_container(container_id, dataset_name,
                                                                                new_file_path, False,
                                                                                False)
        if result != 'success' or new_docker_file_path is None:
            logger.error('Error while copy the docker file on the Engine')
            return 'Error while copy the original csv file on the Docker Container'

        result = FileManager.delete_file(dataset_name, "csv", False)

        if result != 'success':
            logger.error('Error while delete the file on the Engine')
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
            logger.error(f'Error while copy the entity node csv on the Engine: {str(result)}')
            return 'Error while copy the entity node csv on the Engine'

        result, new_entity_docker_file_path = DockerFileManager.copy_file_to_container(container_id, dataset_name,
                                                                                       new_entity_file_path, True,
                                                                                       False)

        if result != 'success' or new_entity_docker_file_path is None:
            logger.error(f'Error while copy the entity node docker file on the Engine: {str(result)}')
            return result

        result = FileManager.delete_file(dataset_name, "csv", True)

        if result != 'success':
            logger.error(f'Error while delete the file on the Engine: {str(result)}')
            return result

        # 3. Configuration json file processes
        json_result = FileManager.create_json_file(dataset_name, dataset_description, all_columns, standard_columns,
                                                   filtered_columns, values_columns, trigger_target_rows)

        if json_result is None:
            logger.error('Error while create the json file configuration on the Engine')
            return 'Error while creating the json file configuration'

        result, new_json_config_path = FileManager.copy_json_file(json_result, dataset_name)

        if result != 'success' or new_json_config_path is None:
            logger.error(f'Error while copy the json file on the Engine directory: {str(result)}')
            return 'Error while copy the json file on the Engine directory'

        result, new_json_config_docker_file_path = DockerFileManager.copy_file_to_container(container_id, dataset_name,
                                                                                            new_json_config_path,
                                                                                            False, True)

        if result != 'success' or new_json_config_docker_file_path is None:
            logger.error(f'Error while copy the json file on the docker container: {str(result)}')
            return result

        result = FileManager.delete_file(dataset_name, "json", False)

        if result != 'success':
            logger.error(f'Error while delete the file on the Engine: {str(result)}')
            return result

        logger.info('Success process dataset files')
        return 'success'

    except Exception as e:
        logger.error(f'Error while process the dataset files: {str(e)}')
        return f'${e}'
