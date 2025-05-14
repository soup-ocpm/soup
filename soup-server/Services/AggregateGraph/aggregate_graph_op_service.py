"""
------------------------------------------------------------------------
File : aggregate_graph_op_service.py
Description: Service for aggregate (class) graph operations
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import math

from typing import Iterable
from flask import jsonify
from Shared.support_config import memgraph_datetime_to_string
from Services.support_service import SupportService
from Models.api_response_model import ApiResponse
from Models.logger_model import Logger
from Utils.aggregate_graph_query_lib import *

# Engine logger setup
logger = Logger()


# The Service for aggregate (class) graph operations
class OperationClassGraphService:

    # Get  Class nodes
    @staticmethod
    def get_class_nodes_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_nodes_class_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 204
                response.response_data = None
                response.message = "No content"

                logger.info("No content")
                return jsonify(response.to_dict()), 204

            graph_data = SupportService.extract_class_graph_data(result)

            if len(graph_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = graph_data

                logger.info("No content")
                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.message = 'Class nodes retrieve successfully'
            response.response_data = graph_data

            logger.info("Class nodes retrieve successfully")
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'

            logger.error(f"Internal Server Error : {str(e)}")
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Get count of Class nodes
    @staticmethod
    def get_count_class_nodes_s(database_connector):
        try:
            query = get_count_nodes_class_query()
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'class_count' in result[0]:
                return result[0]['class_count']

            return 0
        except Exception as e:
            logger.error(f"Internal Server Error : {str(e)}")
            return 0

    # Get :OBS relationships
    @staticmethod
    def get_obs_relationships_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_obs_relation_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"
                return jsonify(response.to_dict()), 404

            correlation_data = []
            correlation_count = 0

            for record in result:
                relation = record['obs']
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
                'obs_data': correlation_data,
                'corr_count': correlation_count,
            }

            if len(graph_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = graph_data

                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.response_data = graph_data
            response.message = 'Retrieve :OBS relationships'

            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Get count of :OBS relationships
    @staticmethod
    def get_count_obs_relationships_s(database_connector):
        try:
            query = get_count_obs_relationships_query()
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'obs_count' in result[0]:
                return result[0]['obs_count']

            return 0
        except Exception as e:
            logger.error(f"Internal Server Error : {str(e)}")
            return 0

    # Get :DFC relationships
    @staticmethod
    def get_dfc_relationships_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_dfc_relation_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 204
                response.response_data = None
                response.message = "No content"

                logger.info("No content")
                return jsonify(response.to_dict()), 204

            df_data = []
            df_count = 0

            for record in result:
                relation = record['dfc']
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
                'dfc_data': df_data,
                'dfc_count': df_count,
            }

            if len(graph_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = graph_data

                logger.info("No content")
                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.response_data = graph_data
            response.message = 'Retrieve :DFC relationships'

            logger.info("Retrieve :DFC relationships")
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'

            logger.error(f'Internal Server Error : {str(e)}')
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    # Get count of :DF_C relationships
    @staticmethod
    def get_count_dfc_relationships_s(database_connector):
        try:
            query = get_count_dfc_relationships_query()
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'dfc_count' in result[0]:
                return result[0]['dfc_count']

            return 0
        except Exception as e:
            logger.error(f"Internal Server Error : {str(e)}")
            return 0

    # Delete Class Graph
    @staticmethod
    def delete_class_graph_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = delete_class_graph_query()
            database_connector.run_query_memgraph(query)

            verification_query = get_count_class_nodes_query()
            result = database_connector.run_query_memgraph(verification_query)

            if result and result[0]['count'] == 0:
                response.http_status_code = 200
                response.message = 'Class Graph deleted successfully'
                response.response_data = None

                logger.info("Class Graph deleted successfully")
                return jsonify(response.to_dict()), 200
            else:
                response.http_status_code = 404
                response.message = 'Class graph not deleted'
                response.response_data = None

                logger.error("Class graph not deleted")
                return jsonify(response.to_dict()), 404

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error : {str(e)}"
            response.response_data = None

            logger.error(f"Internal Server Error : {str(e)}")
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()
