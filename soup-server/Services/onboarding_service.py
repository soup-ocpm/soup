"""
------------------------------------------------------------------------
File : onboarding_service.py
Description: Service for user experience interaction and tutorials
Date creation: 02-05-2025
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import jsonify
from Models.logger_model import Logger
from Models.api_response_model import ApiResponse
from Utils.general_query_lib import get_first_time_node_query, create_first_time_node_query

# Engine logger setup
logger = Logger()


# The Service for user experience interaction and tutorials
class OnBoardingService:

    @staticmethod
    def get_first_time_usage_node(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()
            query = get_first_time_node_query()
            result = database_connector.run_query_memgraph(query)

            is_first_time = not result or len(result) == 0

            response.http_status_code = 200
            response.response_data = is_first_time
            response.message = 'Retrieved first-time usage status'
            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error: {e}"
            response.response_data = None
            logger.error(f'Internal Server Error: {e}')
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def create_first_time_usage_node(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()
            query = create_first_time_node_query()
            result = database_connector.run_query_memgraph(query)
            print(result)

            if not result or not isinstance(result, list) or 'n' not in result[0]:
                response.http_status_code = 500
                response.message = "Unexpected result structure from database"
                response.response_data = result
                logger.error("Invalid structure returned from create query")
                return jsonify(response.to_dict()), 500

            node = result[0]['n']
            first_time = node.get('FirstTime', None)

            if first_time is True:
                response.http_status_code = 201
                response.message = "First-time usage node created"
            elif first_time is False:
                response.http_status_code = 200
                response.message = "First-time usage node already existed"
            else:
                response.http_status_code = 202
                response.message = "Node created but status unclear"

            response.response_data = node
            return jsonify(response.to_dict()), response.http_status_code

        except Exception as e:
            response.http_status_code = 500
            response.message = f"Internal Server Error: {e}"
            response.response_data = None
            logger.error(f'Internal Server Error: {e}')
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()
