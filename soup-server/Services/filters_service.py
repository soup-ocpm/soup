"""
------------------------------------------------------------------------
File : filters_service.py
Description: Service for graph filters
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import json

from collections.abc import *
from flask import jsonify
from Services.docker_service import DockerService
from Services.support_service import SupportService
from Services.generic_graph_service import GenericGraphService
from Models.docker_file_manager_model import DockerFileManager
from Models.file_manager_model import FileManager
from Models.api_response_model import ApiResponse
from Models.logger_model import Logger
from Utils.filter_query_lib import *
from Utils.aggregate_graph_query_lib import delete_class_graph_query
from Utils.graph_query_lib import get_limit_standard_graph_query, delete_event_graph_query, delete_entity_graph_query

# Engine logger setup
logger = Logger()


# The Service for graph filters
class FiltersService:

    # Process new analysis (list of filters)
    @staticmethod
    def process_new_analyses_s(database_connector, filters_data):
        response = ApiResponse()

        try:
            # 0. Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'SOUP Database is offline or does not exist'
                response.response_data = []

                logger.error('SOUP Database is offline or does not exist')
                return jsonify(response.to_dict()), 400

            # 1. Process the csv file on Docker Container
            result, new_analysis_name = process_new_analysis_file(container_id, filters_data)

            if result != 'success' or new_analysis_name is None:
                response.http_status_code = 500
                response.message = result
                response.response_data = None

                logger.error(f'Process analysis failed: {str(result)}')
                return jsonify(response.to_dict()), 500

            # 2. Proces the analysis
            dataset_name = filters_data.get("dataset_name")
            return FiltersService.process_analyses_s(database_connector, dataset_name, new_analysis_name)

        except Exception as e:
            response.response_data = None
            response.http_status_code = 500
            response.message = f'Internal Server Error: {str(e)}'

            logger.error(f'Internal Server Error: {str(e)}')
            return jsonify(response.to_dict()), 500

    # Process specific analysis
    @staticmethod
    def process_analyses_s(database_connector, dataset_name, analyses_name):
        response = ApiResponse()

        try:
            # 0. Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 500
                response.message = 'SOUP Database is offline or does not exist'
                response.response_data = []

                logger.error('SOUP Database is offline or does not exist')
                return jsonify(response.to_dict()), 500

            # 1. Process the analysis
            result, data = process_analysis(container_id, database_connector, dataset_name, analyses_name)

            # 2. Check the response content
            if result.startswith('error'):
                # Execute the rollback
                execute_rollback_data(container_id, database_connector, dataset_name)

                response.http_status_code = 404
                response.message = f'Error processing analysis. Probably an error occurred: {result}'
                response.response_data = None

                logger.error(f'Error processing analysis. Probably an error occurred: {result}')
                return jsonify(response.to_dict()), 404

            if result == 'nothing changed':
                # Execute the rollback
                execute_rollback_data(container_id, database_connector, dataset_name)

                response.http_status_code = 204
                response.message = 'Nothing changed'
                response.response_data = None

                logger.info('Nothing changed')
                return jsonify(response.to_dict()), 202

            if result == 'no content':
                # Execute the rollback
                execute_rollback_data(container_id, database_connector, dataset_name)

                response.http_status_code = 204
                response.message = 'No content available for the analysis'
                response.response_data = None

                logger.info('No content available for the analysis')
                return jsonify(response.to_dict()), 202

            if result == 'success':
                response.http_status_code = 201
                response.message = 'Analysis created successfully'
                response.response_data = data

                logger.info('Analysis created successfully')
                return jsonify(response.to_dict()), 201

            # Execute the rollback
            execute_rollback_data(container_id, database_connector, dataset_name)
            response.http_status_code = 500
            response.message = 'Unexpected error'
            response.response_data = None

            logger.error('Unexpected error')
            return jsonify(response.to_dict()), 500

        except Exception as e:
            response.response_data = None
            response.http_status_code = 500
            response.message = f'Internal Server Error: {str(e)}'

            logger.error(f'Internal Server Error: {str(e)}')
            return jsonify(response.to_dict()), 500

    # Get all dataset analysis
    @staticmethod
    def get_all_analyses_s(dataset_name):
        response = ApiResponse()

        try:
            # Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'SOUP Database is offline or does not exist'
                response.response_data = None

                logger.error('SOUP Database is offline or does not exist')
                return jsonify(response.to_dict()), 400

            # 1. Get all analyses
            result, analyses_folders = DockerFileManager.get_folder_files(container_id,
                                                                          f'/soup/{dataset_name}/Analyses')

            if result != 'success':
                response.http_status_code = 400
                response.message = f'Error while get folder files: {str(result)}'
                response.response_data = result

                logger.info(f'Error while get folder files: {str(result)}')
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

                logger.info('No content')
                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.message = 'Analyses retrieved successfully'
            response.response_data = analyses_data

            logger.info('Analyses retrieved successfully')
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.response_data = None
            response.http_status_code = 500
            response.message = f'Internal Server Error: {str(e)}'

            logger.error(f'Internal Server Error: {str(e)}')
            return jsonify(response.to_dict()), 500

    # Check unique analysis name
    @staticmethod
    def check_unique_analysis_name(dataset_name, analysis_name):
        response = ApiResponse()

        try:
            # Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'SOUP Database is offline or does not exist'
                response.response_data = None

                logger.error('SOUP Database is offline or does not exist')
                return jsonify(response.to_dict()), 400

            full_analysis_name = f'{analysis_name}.json'

            result, analyses_folder = DockerFileManager.get_folder_files(container_id,
                                                                         f'/soup/{dataset_name}/Analyses')

            if full_analysis_name not in analyses_folder:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = None

                logger.info('No content')
                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.message = 'Analysis name already exist'
            response.response_data = None

            logger.info('Analysis name already exist')
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.response_data = None
            response.http_status_code = 500
            response.message = f'Internal Server Error: {str(e)}'

            logger.error(f'Internal Server Error: {str(e)}')
            return jsonify(response.to_dict()), 500

    # Process frequency filter
    @staticmethod
    def process_frequency(database_connector, frequency):
        response = ApiResponse()

        try:
            database_connector.connect()

            # Execute the query
            query = frequency_filter_query(frequency)
            result = database_connector.run_query_memgraph(query)

            if len(result) == 0 or not isinstance(result, Iterable):
                response.http_status_code = 204
                response.response_data = None
                response.message = f"No content for {frequency} frequency"

                logger.error(f'No content for {frequency} frequency')
                return jsonify(response.to_dict()), 404

            # Process the result and structure the data
            data = []
            for row in result:
                activity = row.get('activities')
                freq = row.get('frequency')

                data.append({
                    'activity': activity,
                    'frequency': freq
                })

            response.http_status_code = 200
            response.response_data = data
            response.message = "Successfully retrieved frequency."

            logger.info('Frequency retrieved')
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error: {str(e)}"
            response.response_data = None

            logger.error(f"Internal Server Error : {str(e)}")
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Process variation filter
    @staticmethod
    def process_variation(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            # Execute the query
            query = variation_filter_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable) or not result:
                response.http_status_code = 404
                response.response_data = None
                response.message = "No activities found"

                logger.error('Activities not found')
                return jsonify(response.to_dict()), 404

            # Process the result and structure the data
            data = []

            for row in result:
                activities = row.get('activities')
                distinct_activities = row.get('distinct_activities')
                avg_duration = row.get('avg_duration')
                frequency = row.get('frequency')

                # Add the data
                data.append({
                    'activities': activities,
                    'distinct_activities': distinct_activities,
                    'avg_duration': avg_duration,
                    'frequency': frequency
                })

            response.http_status_code = 200
            response.response_data = data
            response.message = "Successfully retrieved activity variations."

            logger.info('Activity variations retrieved')
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error: {str(e)}"
            response.response_data = None

            logger.error(f"Internal Server Error : {str(e)}")
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Delete analysis
    @staticmethod
    def delete_analyses_s(dataset_name, analyses_name):
        response = ApiResponse()

        try:
            # 0. Retrieve the container id by the name
            container_id = DockerService.get_container_id_s('soup-database')

            if container_id is None or container_id == '':
                response.http_status_code = 400
                response.message = 'SOUP Database is offline or does not exist'
                response.response_data = None

                logger.error('SOUP Database is offline or does not exist')
                return jsonify(response.to_dict()), 400

            # 1. Delete the folder
            full_analysis_name = f'{analyses_name}.json'
            folder_path = f'/soup/{dataset_name}/Analyses/{full_analysis_name}'
            result = DockerFileManager.remove_container_content_by_path(container_id, folder_path)

            if result != 'success':
                response.http_status_code = 404
                response.message = f'Unable to delete the Analysis: {str(result)}'
                response.response_data = None

                logger.error(f'Unable to delete the Analysis: {str(result)}')
                return jsonify(response.to_dict()), 404

            result, container_folders = DockerFileManager.get_folder_files(container_id,
                                                                           f'/soup/{dataset_name}/Analyses/{full_analysis_name}')

            if analyses_name in container_folders:
                response.http_status_code = 404
                response.message = 'Unable to delete the Analysis'
                response.response_data = None

                logger.error('Unable to delete the Analysis')
                return jsonify(response.to_dict()), 404

            response.http_status_code = 200
            response.message = 'Analysis deleted successfully'
            response.response_data = None

            logger.info('Analysis deleted successfully')
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.response_data = None
            response.http_status_code = 500
            response.message = f'Internal Server Error: {str(e)}'

            logger.error(f'Internal Server Error: {str(e)}')
            return jsonify(response.to_dict()), 500


# Process the new analyses files
def process_new_analysis_file(container_id, filters_data):
    try:
        # 1. Save the json file
        dataset_name = filters_data.get("dataset_name")
        analysis_name = filters_data.get("analysis_name")

        result, new_json_config_path = FileManager.copy_json_file(filters_data, analysis_name)

        if result != 'success' or new_json_config_path is None:
            logger.error('Error while copying json file on the Engine')
            return 'Error while copy the analysis json file on the Engine directory', None

        # 2. Save the json file on the docker container
        result, container_file_path = DockerFileManager.copy_analysis_file_to_container(container_id,
                                                                                        new_json_config_path,
                                                                                        dataset_name, analysis_name)
        if result != 'success' or container_file_path is None:
            logger.error(f'Error while copying analysis file on the Engine: {str(result)}')
            return f'Error while copy the json file on the Engine directory: {str(result)}', None

        # 3. Remove the json file from the Engine
        result = FileManager.delete_file(analysis_name, "json", False)

        if result != 'success':
            logger.error('Error while deleting file on the Engine')
            return result

        return 'success', analysis_name

    except Exception as e:
        logger.error(f'Internal Server Error: {str(e)}')


# Process the analysis (filters)
def process_analysis(container_id, database_connector, dataset_name, analysis_name):
    try:
        # 1. Check the name and read configuration
        if not analysis_name.endswith(".json"):
            analysis_name = f'{analysis_name}.json'

        result, exec_config_file = DockerFileManager.read_json_file_from_container(container_id, dataset_name,
                                                                                   analysis_name)

        if result != 'success':
            logger.error(f'Error while reading json file on the Engine: {str(result)}')
            return result

        # 2. Check the instance
        if not isinstance(exec_config_file, dict):
            exec_config_file = json.loads(exec_config_file)
        analysis_data = exec_config_file

        # 3. Extract the filter
        timestamp_filters = analysis_data['timestamp']
        performance_filters = analysis_data['performance']
        include_filters = analysis_data['includeActivities']
        exclude_filters = analysis_data['excludeActivities']

        # 4. Save the current data from Memgraph
        node_counter, relationships_counter = get_node_and_relationship_count(database_connector)

        # 5. Connect to the Database and Run queries
        database_connector.connect()

        # 5.0 Remove the class graph
        query = delete_class_graph_query()
        database_connector.run_query_memgraph(query)

        # 5.1 Timestamp filter queries
        for current_timestamp_filter in timestamp_filters:
            start_date = current_timestamp_filter['startDate']
            end_date = current_timestamp_filter['endDate']
            query = timestamp_filter_delete_query(start_date, end_date)

            try:
                # Execute the query
                database_connector.run_query_memgraph(query)

            except Exception as e:
                logger.error(f'Timestmap Internal Server Error: {str(e)}')
                return f'error {e}', []

        # 5.2 Performance filter queries
        for current_performance_filter in performance_filters:
            start_activity = current_performance_filter['startActivity']
            end_activity = current_performance_filter['endActivity']
            seconds = current_performance_filter['seconds']
            query = performance_filter_delete_query(start_activity, end_activity, seconds)

            try:
                # Execute the query
                database_connector.run_query_memgraph(query)

            except Exception as e:
                logger.error(f'Performance Internal Server Error: {str(e)}')
                return f'error {e}', []

        # 5.3 Include activities filter queries
        for current_include_filter in include_filters:
            activities = current_include_filter['activities']
            query = include_activity_filter_delete_query(activities)

            try:
                # Execute the query
                database_connector.run_query_memgraph(query)

            except Exception as e:
                logger.error(f'Include Activities Internal Server Error: {str(e)}')
                return f'error {e}', []

        # 5.4 Exclude activities filter queries
        for current_exclude_filter in exclude_filters:
            activities = current_exclude_filter['activities']
            query = exclude_activity_filter_delete_query(activities)

            try:
                # Execute the query
                database_connector.run_query_memgraph(query)

            except Exception as e:
                logger.error(f'Exclude Activities Internal Server Error: {str(e)}')
                return f'error {e}', []

        # 6. Check the counter difference
        node_counter_updated, relationships_counter_updated = get_node_and_relationship_count(database_connector)

        if node_counter == node_counter_updated and relationships_counter == relationships_counter_updated:
            return 'nothing changed', []

        # 6. Get the updated and filtered EKG from the db
        limit = 300
        query_result = get_limit_standard_graph_query(limit)

        result = database_connector.run_query_memgraph(query_result)

        if len(result) == 0:
            return 'no content', []

        if not isinstance(result, Iterable):
            return 'error', []

        # Extract data information
        result = SupportService.extract_graph_data(result)
        graph_data = result['graph_data']

        if not graph_data:
            return 'no content', []

        return 'success', graph_data

    except Exception as e:
        logger.error(f'Internal Server Error: {str(e)}')
        return f'error: {e}', []


# Execute the rollback
def execute_rollback_data(container_id, database_connector, dataset_name):
    # 1. Clean the memgraph data
    event_node_delete_query = delete_event_graph_query()
    database_connector.run_query_memgraph(event_node_delete_query)

    entity_node_delete_query = delete_entity_graph_query()
    database_connector.run_query_memgraph(entity_node_delete_query)

    # 2. Reload the data
    GenericGraphService.create_complete_graphs_s(container_id, database_connector, dataset_name)


# Get the current data (node count and relationships count) inside Memgraph database
def get_node_and_relationship_count(database_connector):
    database_connector.connect()

    node_count_query = "MATCH (n) RETURN count(n) AS node_count"
    relationship_count_query = "MATCH ()-[r]->() RETURN count(r) AS relationship_count"

    try:
        # 1. Execute the query
        node_count_result = database_connector.run_query_memgraph(node_count_query)
        relationship_count_result = database_connector.run_query_memgraph(relationship_count_query)

        # 2. Extract and return the data
        node_count = node_count_result[0]['node_count'] if node_count_result else 0
        relationship_count = relationship_count_result[0]['relationship_count'] if relationship_count_result else 0

        return node_count, relationship_count
    except Exception as e:
        logger.error(f'Performance Internal Server Error: {str(e)}')
        return 0, 0
