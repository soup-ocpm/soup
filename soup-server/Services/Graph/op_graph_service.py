"""
------------------------------------------------------------------------
File : op_graph_service.py
Description: Service for operation graph controller
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import math

from flask import jsonify
from collections.abc import Iterable
from Controllers.graph_config import memgraph_datetime_to_string
from Models.api_response_model import ApiResponse
from Models.docker_file_manager_model import DockerFileManager
from Models.file_manager_model import FileManager
from Services.docker_service import DockerService
from Utils.general_query_lib import *


# The Service for operation graph controller
class OperationGraphService:

    @staticmethod
    def get_event_nodes_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_nodes_event_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"
                return jsonify(response.to_dict()), 404

            graph_data = []

            for record in result:
                event_node = record['node']

                for key, value in event_node.items():
                    if 'Timestamp' in key:
                        timestamp = memgraph_datetime_to_string(value)
                        event_node[key] = timestamp

                for key, value in event_node.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        event_node[key] = None

                graph_data.append(event_node)

            if len(graph_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = graph_data

                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.message = 'Event nodes retrieve successfully'
            response.response_data = graph_data

            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Get count of event nodes
    @staticmethod
    def get_count_event_nodes_s(database_connector):
        try:
            query = get_count_nodes_event_query()
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'node_count' in result[0]:
                return result[0]['node_count']

            return 0
        except Exception as e:
            print(f"Error in get_count_event_nodes: {e}")
            return 0

    # Get entity nodes
    @staticmethod
    def get_entity_nodes_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_nodes_entity_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"
                return jsonify(response.to_dict()), 404

            graph_data = []

            for record in result:
                entity_node = record['node']

                for key, value in entity_node.items():
                    if 'Timestamp' in key:
                        timestamp = memgraph_datetime_to_string(value)
                        entity_node[key] = timestamp

                for key, value in entity_node.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        entity_node[key] = None

                graph_data.append(entity_node)

            if len(graph_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = graph_data

                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.message = 'Entity nodes retrieve successfully'
            response.response_data = graph_data

            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Get count of entity nodes
    @staticmethod
    def get_count_entity_nodes_s(database_connector):
        try:
            query = get_count_nodes_entity_query()
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'entity_count' in result[0]:
                return result[0]['entity_count']

            return 0
        except Exception as e:
            print(f"Error in get_count_event_nodes: {e}")
            return 0

    # Get :CORR relationships
    @staticmethod
    def get_corr_relationships_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_corr_relation_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"
                return jsonify(response.to_dict()), 404

            correlation_data = []
            correlation_count = 0

            for record in result:
                relation = record['corr']
                event = relation[0]
                relation_type = relation[1]
                related_event = relation[2]

                for key, value in event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        event[key] = None

                    if 'Timestamp' in key:
                        timestamp = memgraph_datetime_to_string(value)
                        event[key] = timestamp

                for key, value in related_event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        related_event[key] = None

                    if 'Timestamp' in key:
                        timestamp = memgraph_datetime_to_string(value)
                        related_event[key] = timestamp

                correlation_count = correlation_count + 1
                relation_id = correlation_count

                correlation_data.append({
                    'event': event,
                    'relation_type': relation_type,
                    'related_event': related_event,
                    'relation_id': relation_id
                })

            graph_data = {
                'corr_data': correlation_data,
                'corr_count': correlation_count,
            }

            if len(graph_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = graph_data

                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.response_data = graph_data
            response.message = 'Retrieve :CORR relationships'

            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Get count of :CORR relationships
    @staticmethod
    def get_count_corr_relationships_s(database_connector):
        try:
            query = get_count_corr_rel_query()
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'corr_count' in result[0]:
                return result[0]['corr_count']

            return 0
        except Exception as e:
            print(f"Error in get_count_event_nodes: {e}")
            return 0

    # Get :DF relationships
    @staticmethod
    def get_df_relationships_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_df_relation_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"
                return jsonify(response.to_dict()), 404

            df_data = []
            df_count = 0

            for record in result:
                relation = record['df']
                event = relation[0]
                relation_type = relation[1]
                related_event = relation[2]

                for key, value in event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        event[key] = None
                    if 'Timestamp' in key:
                        timestamp = memgraph_datetime_to_string(value)
                        event[key] = timestamp

                for key, value in related_event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        related_event[key] = None
                    if 'Timestamp' in key:
                        timestamp = memgraph_datetime_to_string(value)
                        related_event[key] = timestamp

                df_count = df_count + 1
                relation_id = df_count

                df_data.append({
                    'event': event,
                    'relation_type': relation_type,
                    'related_event': related_event,
                    'relation_id': relation_id
                })

            graph_data = {
                'df_data': df_data,
                'df_count': df_count,
            }

            if len(graph_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = graph_data

                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.response_data = graph_data
            response.message = 'Retrieve :DF relationships'

            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Get count of :DF relationships
    @staticmethod
    def get_count_df_relationships_s(database_connector):
        try:
            query = get_count_df_rel_query()
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'df_count' in result[0]:
                return result[0]['df_count']

            return 0
        except Exception as e:
            print(f"Error in get_count_event_nodes: {e}")
            return 0

    # Get the entity key
    @staticmethod
    def get_entities_key_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_distinct_entities_keys()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"
                return jsonify(response.to_dict()), 404

            entities_type = []

            for record in result:
                e_type = record['entityType']
                entities_type.append(e_type)

            response.http_status_code = 200
            response.response_data = entities_type
            response.message = "Retrieve distinct entities."
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error : {str(e)}"
            response.response_data = None
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Get the null entity
    @staticmethod
    def get_null_entities_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_nan_entities()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"
                return jsonify(response.to_dict()), 404

            null_node_entities = []

            for record in result:
                null_property_name = record['prop']
                node_count = record['nodeCount']

                null_node_entities.append({
                    'property_name': null_property_name,
                    'count_nodes': node_count
                })

            response.http_status_code = 200
            response.response_data = null_node_entities
            response.message = "Retrieve null values for node."
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error : {str(e)}"
            response.response_data = None
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def get_activities_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_activities_name_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable) or not result:
                response.http_status_code = 404
                response.response_data = None
                response.message = "No activity names found"
                return jsonify(response.to_dict()), 404

            activity_names = result[0]['activityNames']

            response.http_status_code = 200
            response.response_data = activity_names
            response.message = "Successfully retrieved activity names."
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error: {str(e)}"
            response.response_data = None
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def download_svg_s(dataset_name, svg_content):
        response = ApiResponse()

        container_id = DockerService.get_container_id_s('soup-database')

        if not container_id or container_id == '':
            response.http_status_code = 404
            response.response_data = None
            response.message = 'Container not found'
            return jsonify(response.to_dict()), 404

        # Create svg
        result, new_svg_file_path = FileManager.copy_svg_file(dataset_name, svg_content)
        if result != 'success' or new_svg_file_path is None:
            return 'Error while copying the entity node svg to the Engine'

        # Copy svg
        result, new_entity_docker_file_path = DockerFileManager.copy_file_to_container(container_id, dataset_name,
                                                                                       new_svg_file_path, False,
                                                                                       False, True)

        # Delete the
        result = FileManager.delete_svg_file(dataset_name)

        response.http_status_code = 200
        response.message = 'Event nodes retrieved successfully'
        response.response_data = result

        return jsonify(response.to_dict()), 200

    # Delete the complete graph
    @staticmethod
    def delete_graph_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            # Delete entity nodes
            query = delete_entity_graph_query()
            database_connector.run_query_memgraph(query)

            verification_query = get_count_nodes_entity_query()
            result_entity = database_connector.run_query_memgraph(verification_query)

            # Drop entity index
            database_connector.run_query_memgraph(drop_entity_index())

            # Delete event nodes
            query = delete_event_graph_query()
            database_connector.run_query_memgraph(query)

            verification_query = get_count_nodes_event_query()
            result_event = database_connector.run_query_memgraph(verification_query)

            if result_entity and result_event and result_entity[0]['count'] == 0 and result_event[0]['count'] == 0:
                response.http_status_code = 200
                response.message = 'Standard Graph deleted successfully !'
                response.response_data = None
                return jsonify(response.to_dict()), 200
            else:
                response.http_status_code = 404
                response.message = 'Data was not deleted!'
                response.response_data = None
                return jsonify(response.to_dict()), 404

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error : {str(e)}"
            response.response_data = None
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()
