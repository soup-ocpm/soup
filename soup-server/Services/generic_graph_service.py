"""
------------------------------------------------------------------------
File : docker_service.py
Description: Service generic graph operations
Date creation: 20-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import json

from datetime import datetime
from flask import jsonify
from collections.abc import *
from Services.Graph.op_graph_service import OperationGraphService
from Services.support_service import SupportService
from Models.api_response_model import ApiResponse
from Models.dataset_process_info_model import DatasetProcessInformation
from Models.docker_file_manager_model import DockerFileManager
from Models.file_manager_model import FileManager
from Models.logger_model import Logger
from Utils.graph_query_lib import *
from Utils.general_query_lib import *
from Utils.aggregate_graph_query_lib import *
from Utils.causal_query_lib import *

# Engine logger setup
logger = Logger()


# The Service generic graph operations
class GenericGraphService:

    # Create complete graph
    @staticmethod
    def create_complete_graphs_s(container_id, database_connector, dataset_name):
        process_info = DatasetProcessInformation()

        try:
            # The current time
            process_info.init_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

            # 1. Get the dataset files (from the Docker container)
            main_csv_path, entity_csv_path, config_json_path, svg_path = DockerFileManager.get_dataset_file_path(
                container_id,
                dataset_name)

            if not main_csv_path or not entity_csv_path or not config_json_path:
                logger.error('Unable to load the Dataset files')
                return 'Unable to load the Dataset files'

            # 2. Read the config file for get the configuration
            result, exec_config_file = DockerFileManager.read_json_file_from_container(container_id, dataset_name)

            if result != 'success':
                logger.error(f'Unable to read the json file from container: {str(result)}')
                return result

            # Check if it is already a dictionary
            if not isinstance(exec_config_file, dict):
                exec_config_file = json.loads(exec_config_file)

            dataset_name = exec_config_file["dataset_name"]
            dataset_description = exec_config_file["dataset_description"]
            all_columns = exec_config_file["all_columns"]
            standard_columns = exec_config_file["standard_columns"]
            filtered_columns = exec_config_file["filtered_columns"]
            values_columns = exec_config_file["values_columns"]
            trigger_target_rows = exec_config_file["trigger_target_rows"]
            date_created = exec_config_file['date_created']
            date_modified = exec_config_file['date_modified']

            try:
                database_connector.connect()

                # 3. Execute the event nodes query and save the time
                cypher_properties = []
                for key in values_columns:
                    if key not in standard_columns:
                        if key not in ['event_id', 'timestamp', 'activity_name']:
                            cypher_properties.append(f"{key}: coalesce(row.{key}, '')")

                process_info.init_event_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
                query = load_event_node_query(main_csv_path, standard_columns[0], standard_columns[1],
                                              standard_columns[2],
                                              cypher_properties)
                database_connector.run_query_memgraph(query)
                process_info.finish_event_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

                # 4. Execute the entity nodes query
                process_info.init_entity_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
                query = load_entity_node_query(entity_csv_path)
                database_connector.run_query_memgraph(query)
                process_info.finish_entity_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

                # 5. Create entities index to optimize :CORR creation
                database_connector.run_query_memgraph(create_entity_index())
                # + Create event index to optimize search and manipulation
                database_connector.run_query_memgraph(create_event_index())
                # database_connector.run_query_memgraph(create_event_index_time())
                # database_connector.run_query_memgraph(create_event_index_id())

                # 6. Create :CORR relationships
                process_info.init_corr_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

                for key in filtered_columns:
                    if key not in ['event_id', 'timestamp', 'activity_name']:
                        if key not in standard_columns:
                            relation_query_corr = create_corr_relation_query(key)
                            database_connector.run_query_memgraph(relation_query_corr)

                process_info.finish_corr_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

                process_info.init_df_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

                # 7. Trigger and Target check
                if len(trigger_target_rows) > 0:
                    for pair in trigger_target_rows:
                        trigger = pair['trigger']
                        target = pair['target']

                        queries = reveal_causal_rels(trigger, target)
                        for query in queries:
                            database_connector.run_query_memgraph(query)

                        for key in filtered_columns:
                            if key not in ['event_id', 'timestamp', 'activity_name', trigger, target]:
                                relation_query_df = create_df_relation_query(key)
                                database_connector.run_query_memgraph(relation_query_df)
                else:
                    # 7.2. Create :DF relationships
                    for key in filtered_columns:
                        if key not in ['event_id', 'timestamp', 'activity_name']:
                            relation_query_df = create_df_relation_query(key)
                            database_connector.run_query_memgraph(relation_query_df)

                process_info.finish_df_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
                process_info.finish_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

            except Exception as e:
                logger.error(f'Internal error: {str(e)}')
                return f'Error: {e}'

            # Finally get the information and save the new json
            event_nodes = OperationGraphService.get_count_event_nodes_s(database_connector)
            entity_nodes = OperationGraphService.get_count_entity_nodes_s(database_connector)
            corr_rel = OperationGraphService.get_count_corr_relationships_s(database_connector)
            df_rel = OperationGraphService.get_count_df_relationships_s(database_connector)

            if date_created is None or date_created == 0:
                date_created = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
                date_modified = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

            new_json_configuration = FileManager.create_json_file(dataset_name, dataset_description, all_columns,
                                                                  standard_columns, filtered_columns, values_columns,
                                                                  trigger_target_rows, event_nodes, entity_nodes,
                                                                  corr_rel, df_rel, date_created, date_modified,
                                                                  process_info.to_dict())

            if new_json_configuration is None:
                logger.error('Error while creating the json file configuration')
                return 'Error while creating the json file configuration'

            result, new_json_config_path = FileManager.copy_json_file(new_json_configuration, dataset_name)

            if result != 'success' or new_json_config_path is None:
                logger.error('Error while copy the json file on the Engine directory')
                return 'Error while copy the json file on the Engine directory'

            result, new_json_config_docker_file_path = DockerFileManager.copy_file_to_container(container_id,
                                                                                                dataset_name,
                                                                                                new_json_config_path,
                                                                                                False, True)

            if result != 'success' or new_json_config_path is None:
                logger.error(f'Error while copy the docker file on the Engine directory: {str(result)}')
                return result

            result = FileManager.delete_file(dataset_name, "json", False)

            if result != 'success':
                logger.error(f'Error while delete the file on the Engine directory: {str(result)}')
                return result

            return 'success'

        except Exception as e:
            logger.error(f'Internal error: {str(e)}')
            return f'Error: {e}'

    # Get complete graph (standard or class)
    @staticmethod
    def get_graph_s(database_connector, standard_graph, limit):
        response = ApiResponse()

        try:
            database_connector.connect()

            if standard_graph == "1":
                if not limit:
                    query_result = get_complete_standard_graph_query()
                else:
                    query_result = get_limit_standard_graph_query(limit)
            else:
                if not limit:
                    query_result = get_complete_class_graph_query()
                else:
                    query_result = get_limit_class_graph_query(limit)

            result = database_connector.run_query_memgraph(query_result)

            if len(result) == 0:
                response.http_status_code = 204
                response.response_data = None
                response.message = "No content"

                logger.info('No content')
                return jsonify(response.to_dict()), 204

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"

                logger.error('Not found')
                return jsonify(response.to_dict()), 404

            # Extract data information
            result = SupportService.extract_graph_data(result)

            graph_data = result['graph_data']
            nodes_count = result['unique_nodes_count']
            edges_count = result['unique_edges_count']

            if not graph_data or nodes_count < 1 or edges_count < 1:
                response.http_status_code = 204
                response.response_data = None
                response.message = "No content"

                logger.info('No content')
                return jsonify(response.to_dict()), 204

            response.http_status_code = 200
            response.response_data = result
            response.message = "Retrieve Graph"

            logger.info('Retrieve Graph')
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'

            logger.error(f'Internal Server Error : {str(e)}')
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def get_max_data_to_show(database_connector, standard_graph):
        response = ApiResponse()

        try:
            database_connector.connect()

            if standard_graph == "1":
                query_result = get_max_standard_graph_data()
            else:
                query_result = get_max_aggregate_graph_data()

            result = database_connector.run_query_memgraph(query_result)
            max_data = result[0]['totalNodes'] + result[0]['totalRels']

            response.http_status_code = 200
            response.response_data = max_data
            response.message = "Retrieve max data to show"

            logger.info('Retrieve maximum data to show')
            return jsonify(response.to_dict()), 200
        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'

            logger.error(f'Internal Server Error : {str(e)}')
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Delete all graphs inside the database
    @staticmethod
    def delete_memgraph_graph_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            # 1. Remove the event nodes
            event_node_delete_query = delete_event_graph_query()
            database_connector.run_query_memgraph(event_node_delete_query)

            verification_query = get_count_event_nodes_query()
            result_node = database_connector.run_query_memgraph(verification_query)

            # Check the data
            if not result_node or result_node[0]['count'] != 0:
                response.http_status_code = 500
                response.message = 'Internal Server Error. Unable to delete the event nodes'
                response.response_data = None

                logger.error('Internal Server Error. Unable to delete the event nodes')
                return jsonify(response.to_dict()), 500

            # 2. Remove the entity nodes
            entity_node_delete_query = delete_entity_graph_query()
            database_connector.run_query_memgraph(entity_node_delete_query)

            verification_query = get_count_event_nodes_query()
            result_node = database_connector.run_query_memgraph(verification_query)

            # Check the data
            if not result_node or result_node[0]['count'] != 0:
                response.http_status_code = 500
                response.message = 'Internal Server Error. Unable to delete the entity nodes'
                response.response_data = None

                logger.error('Internal Server Error. Unable to delete the entity nodes')
                return jsonify(response.to_dict()), 500

            # 3. Remove the aggregate graph (if exists)
            aggregate_graph_delete_query = delete_class_graph_query()
            database_connector.run_query_memgraph(aggregate_graph_delete_query)

            verification_query = get_count_class_nodes_query()
            result_node = database_connector.run_query_memgraph(verification_query)

            # Check the data
            if not result_node or result_node[0]['count'] != 0:
                response.http_status_code = 500
                response.message = 'Internal Server Error. Unable to delete the class nodes'
                response.response_data = None

                logger.error('Internal Server Error. Unable to delete the class nodes')
                return jsonify(response.to_dict()), 500

            response.http_status_code = 200
            response.message = 'Data deleted successfully'
            response.response_data = None

            logger.info('Data deleted successfully')
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error : {str(e)}"
            response.response_data = None

            logger.error(f'Internal Server Error : {str(e)}')
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()
