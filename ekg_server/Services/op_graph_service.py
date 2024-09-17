"""
------------------------------------------------------------------------
File : op_graph_service.py
Description: Service for operation graph controller
Date creation: 07-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import math

from flask import jsonify
from collections.abc import Iterable
from Utils.query_library import *
from Models.api_response_model import ApiResponse
from Controllers.graph_config import datetime_to_json


# The Service for operation graph controller
class OperationGraphService:

    @staticmethod
    def get_event_nodes_s(database_connector):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = get_nodes_event_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

            graph_data = []

            for record in result:
                event_node = record['node']

                for key, value in event_node.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        event_node[key] = None

                graph_data.append(event_node)

            if len(graph_data) == 0:
                apiResponse.http_status_code = 202
                apiResponse.message = 'No content'
                apiResponse.response_data = graph_data

                return jsonify(apiResponse.to_dict()), 202

            apiResponse.http_status_code = 200
            apiResponse.message = 'Event nodes retrieve successfully'
            apiResponse.response_data = graph_data

            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

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
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = get_nodes_entity_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

            graph_data = []

            for record in result:
                event_node = record['node']

                for key, value in event_node.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        event_node[key] = None

                graph_data.append(event_node)

            if len(graph_data) == 0:
                apiResponse.http_status_code = 202
                apiResponse.message = 'No content'
                apiResponse.response_data = graph_data

                return jsonify(apiResponse.to_dict()), 202

            apiResponse.http_status_code = 200
            apiResponse.message = 'Entity nodes retrieve successfully'
            apiResponse.response_data = graph_data

            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

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
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = get_corr_relation_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

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

                for key, value in related_event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        related_event[key] = None

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
                apiResponse.http_status_code = 202
                apiResponse.message = 'No content'
                apiResponse.response_data = graph_data

                return jsonify(apiResponse.to_dict()), 202

            apiResponse.http_status_code = 200
            apiResponse.response_data = graph_data
            apiResponse.message = 'Retrieve :corr relationships'

            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

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
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = get_df_relation_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

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

                for key, value in related_event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        related_event[key] = None

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
                apiResponse.http_status_code = 202
                apiResponse.message = 'No content'
                apiResponse.response_data = graph_data

                return jsonify(apiResponse.to_dict()), 202

            apiResponse.http_status_code = 200
            apiResponse.response_data = graph_data
            apiResponse.message = 'Retrieve :df relationships'

            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

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

    # Get complete graph details
    @staticmethod
    def get_graph_details_s(database_connector, limit):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            if not limit:
                query = get_nodes_details_query()
            else:
                query = get_nodes_details_length_query(limit)

            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

            event_nodes = []
            entity_nodes = []
            event_count = 0
            entity_count = 0

            for record in result:
                if record['type'] == 'events':
                    event_nodes = record['data']
                    event_count = record['count']
                    event_nodes = [
                        {k: None if isinstance(v, (int, float)) and math.isnan(v) else v for k, v in node.items()} for
                        node in event_nodes]
                    for e in event_nodes:
                        e["Timestamp"] = datetime_to_json(e["Timestamp"])
                    # print(event_nodes)
                elif record['type'] == 'entities':
                    entity_nodes = record['data']
                    entity_count = record['count']
                    entity_nodes = [
                        {k: None if isinstance(v, (int, float)) and math.isnan(v) else v for k, v in node.items()} for
                        node
                        in entity_nodes]

            query = get_corr_relation_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

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
                    elif key == 'Timestamp':
                        event[key] = datetime_to_json(event[key])

                for key, value in related_event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        related_event[key] = None

                correlation_count = correlation_count + 1
                relation_id = correlation_count

                correlation_data.append({
                    'event': event,
                    'relation_type': relation_type,
                    'related_event': related_event,
                    'relation_id': relation_id
                })

            query = get_df_relation_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

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
                    elif key == 'Timestamp':
                        event[key] = datetime_to_json(event[key])

                for key, value in related_event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        related_event[key] = None
                    elif key == 'Timestamp':
                        related_event[key] = datetime_to_json(related_event[key])

                df_count = df_count + 1
                relation_id = df_count

                df_data.append({
                    'event': event,
                    'relation_type': relation_type,
                    'related_event': related_event,
                    'relation_id': relation_id
                })

            graph_data = {
                'event_nodes': event_nodes,
                'entity_nodes': entity_nodes,
                'event_count': event_count,
                'entity_count': entity_count,
                'correlation_data': correlation_data,
                'correlation_count': correlation_count,
                'df_data': df_data,
                'df_count': df_count,
            }

            if graph_data['entity_count'] == 0 and graph_data['event_count'] == 0 and graph_data[
                'correlation_count'] == 0 \
                    and graph_data['df_count'] == 0:
                apiResponse.http_status_code = 202
                apiResponse.message = 'No content'
                apiResponse.response_data = None

                return jsonify(apiResponse.to_dict()), 202

            apiResponse.http_status_code = 200
            apiResponse.response_data = graph_data
            apiResponse.message = "Retrieve Graph."
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()

    # Get the entity key
    @staticmethod
    def get_entities_key_s(database_connector):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = get_distinct_entities_keys()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

            entities_type = []

            for record in result:
                e_type = record['entityType']
                entities_type.append(e_type)

            apiResponse.http_status_code = 200
            apiResponse.response_data = entities_type
            apiResponse.message = "Retrieve distinct entities."
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f"Internal Server Error : {str(e)}"
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()

    # Get the null entity
    @staticmethod
    def get_null_entities_s(database_connector):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = get_nan_entities()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

            null_node_entities = []

            for record in result:
                null_property_name = record['prop']
                node_count = record['nodeCount']

                null_node_entities.append({
                    'property_name': null_property_name,
                    'count_nodes': node_count
                })

            apiResponse.http_status_code = 200
            apiResponse.response_data = null_node_entities
            apiResponse.message = "Retrieve null values for node."
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f"Internal Server Error : {str(e)}"
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()

    # Delete the complete graph
    @staticmethod
    def delete_graph_s(database_connector):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            # Delete entity nodes
            query = delete_entity_graph_query()
            database_connector.run_query_memgraph(query)
            
            verification_query = get_count_entity_query()
            result_entity = database_connector.run_query_memgraph(verification_query)
            
            # Drop entity index
            database_connector.run_query_memgraph(drop_entity_index())

            # Delete event nodes
            query = delete_event_graph_query()
            database_connector.run_query_memgraph(query)

            verification_query = get_count_event_query()
            result_event = database_connector.run_query_memgraph(verification_query)

            if result_entity and result_event and result_entity[0]['count'] == 0 and result_event[0]['count'] == 0:
                apiResponse.http_status_code = 200
                apiResponse.message = 'Standard Graph deleted successfully !'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 200
            else:
                apiResponse.http_status_code = 404
                apiResponse.message = 'Data was not deleted!'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 404

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f"Internal Server Error : {str(e)}"
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()

    # Delete all inside the database
    @staticmethod
    def delete_all_graph_s(database_connector):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = delete_graph_query()
            database_connector.run_query_memgraph(query)

            verification_query = get_count_node_query()
            result_node = database_connector.run_query_memgraph(verification_query)

            if result_node and result_node[0]['count'] == 0:
                apiResponse.http_status_code = 200
                apiResponse.message = 'Graph deleted successfully !'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 200
            else:
                apiResponse.http_status_code = 404
                apiResponse.message = 'Data was not deleted!'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 404

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f"Internal Server Error : {str(e)}"
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()
