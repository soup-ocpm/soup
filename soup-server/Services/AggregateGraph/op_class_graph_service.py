"""
------------------------------------------------------------------------
File : op_class_graph_service.py
Description: Service for operation class graph controller
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import jsonify
from Models.api_response_model import ApiResponse
from Utils.query_library import *


# The Service for operation class graph controller
class OperationClassGraphService:

    # Get count of class nodes
    @staticmethod
    def get_count_class_nodes_s(database_connector):
        try:
            query = get_count_nodes_class_query()
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'class_count' in result[0]:
                return result[0]['class_count']

            return 0
        except Exception as e:
            print(f"Error in get_count_nodes_class_query: {e}")
            return 0

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
            print(f"Error in get_count_obs_relationships_query: {e}")
            return 0

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
            print(f"Error in get_count_dfc_relationships_query: {e}")
            return 0

    # Delete Class Graph
    @staticmethod
    def delete_class_graph_s(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = delete_class_graph_query()
            database_connector.run_query_memgraph(query)

            verification_query = get_count_nodes_class_query()
            result = database_connector.run_query_memgraph(verification_query)

            if result and result[0]['count'] == 0:
                response.http_status_code = 200
                response.message = 'Class Graph deleted successfully !'
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
