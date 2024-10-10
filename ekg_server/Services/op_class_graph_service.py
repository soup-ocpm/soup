"""
------------------------------------------------------------------------
File : op_class_graph_service.py
Description: Service for operation class graph controller
Date creation: 07-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import jsonify
from Utils.query_library import *
from Models.api_response_model import *


# The Service for operation class graph controller
class OperationClassGraphService:

    # Get count of class nodes
    @staticmethod
    def get_count_class_nodes_s(database_connector, dataset_name):
        try:
            query = get_count_nodes_class_query(dataset_name)
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'class_count' in result[0]:
                return result[0]['class_count']

            return 0
        except Exception as e:
            print(f"Error in get_count_nodes_class_query: {e}")
            return 0

    # Get count of :OBS relationships
    @staticmethod
    def get_count_obs_relationships_s(database_connector, dataset_name):
        try:
            query = get_count_obs_relationships_query(dataset_name)
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'obs_count' in result[0]:
                return result[0]['obs_count']

            return 0
        except Exception as e:
            print(f"Error in get_count_obs_relationships_query: {e}")
            return 0

    # Get count of :DF_C relationships
    @staticmethod
    def get_count_dfc_relationships_s(database_connector, dataset_name):
        try:
            query = get_count_dfc_relationships_query(dataset_name)
            result = database_connector.run_query_memgraph(query)

            if isinstance(result, list) and len(result) > 0 and 'dfc_count' in result[0]:
                return result[0]['dfc_count']

            return 0
        except Exception as e:
            print(f"Error in get_count_dfc_relationships_query: {e}")
            return 0

    # Delete Class Graph
    @staticmethod
    def delete_class_graph_s(database_connector, dataset_name):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = delete_class_graph_query(dataset_name)
            database_connector.run_query_memgraph(query)

            verification_query = get_count_class_graph_query()
            result = database_connector.run_query_memgraph(verification_query)

            if result and result[0]['count'] == 0:
                apiResponse.http_status_code = 200
                apiResponse.message = 'Class Graph deleted successfully !'
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
