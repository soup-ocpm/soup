"""
-------------------------------
File : operation_graph_controller.py
Description: Controller for standard operation in Graph (Class)
Date creation: 23-02-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""

# Import
import math
from flask import jsonify
from collections.abc import Iterable
from Models.api_response_model import ApiResponse
from Utils.query_library import get_class_graph_query, get_count_nodes_class_query, get_count_obs_relationships_query, \
    get_count_dfc_relationships_query, delete_class_graph_query, \
    get_count_class_graph_query


# Get Class Graph (Class nodes, :DF_C Relationships)
def get_class_graph_c(database_connector):
    apiResponse = ApiResponse(None, None, None)

    try:
        database_connector.connect()

        query_result = get_class_graph_query()
        result = database_connector.run_query_memgraph(query_result)

        if not isinstance(result, Iterable):
            apiResponse.http_status_code = 404
            apiResponse.response_data = None
            apiResponse.message = "Not found"
            return jsonify(apiResponse.to_dict()), 404

        graph_data = []

        for record in result:
            source = record['source']
            source['id'] = record['source_id']
            edge = record['edge']
            edge['id'] = record['edge_id']
            target = record['target']
            target['id'] = record['target_id']

            for key, value in source.items():
                if isinstance(value, (int, float)) and math.isnan(value):
                    source[key] = None

            for key, value in target.items():
                if isinstance(value, (int, float)) and math.isnan(value):
                    target[key] = None

            graph_data.append({
                'node_source': source,
                'edge': edge,
                'node_target': target
            })

        if not graph_data:
            apiResponse.http_status_code = 404
            apiResponse.response_data = None
            apiResponse.message = "Not found"
            return jsonify(apiResponse.to_dict()), 404

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


# Get count of Event nodes in specific time
def get_count_class_nodes_c(database_connector):
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
def get_count_obs_relationships_c(database_connector):
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
def get_count_dfc_relationships_c(database_connector):
    try:
        query = get_count_dfc_relationships_query()
        result = database_connector.run_query_memgraph(query)

        if isinstance(result, list) and len(result) > 0 and 'dfc_count' in result[0]:
            return result[0]['dfc_count']

        return 0
    except Exception as e:
        print(f"Error in get_count_dfc_relationships_query: {e}")
        return 0


# Delete Class Graph (Class nodes, :DF_C Relationships)
def delete_class_graph_c(database_connector):
    apiResponse = ApiResponse(None, None, None)

    try:
        database_connector.connect()

        query = delete_class_graph_query()
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
