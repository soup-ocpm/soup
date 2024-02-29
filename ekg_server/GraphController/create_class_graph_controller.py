"""
-------------------------------
File : create_class_graph_controller.py
Description: Controller for generate Graph (class)
Date creation: 23-02-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""

# Import
import json
from flask import request, jsonify

from Models.memgraph_connector_model import MemgraphConnector
from Models.api_response_model import ApiResponse
from Utils.query_library import create_class_df_relation_query, create_node_class_query, create_obs_relation_query, \
    create_full_obs_relation_query, create_full_obs_relation_query_two

# Database information:
uri_mem = 'bolt://localhost:7687'
auth_mem = ("", "")
database_connection_mem = MemgraphConnector(uri_mem, auth_mem)


# Create Class Graph function
def create_class_graph_c():
    apiResponse = ApiResponse(None, None, None)

    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    try:
        database_connection_mem.connect()
        class_process_query_c(filtered_column)

        apiResponse.http_status_code = 201
        apiResponse.message = 'Class Graph created successfully.'
        apiResponse.response_data = None

        return jsonify(apiResponse.to_dict()), 201

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.message = f'Error while importing data to Neo4j: {str(e)}.'
        apiResponse.response_data = None
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connection_mem.close()


# Execute query for create Class Graph
def class_process_query_c(filtered_columns):
    try:
        cypher_query = create_node_class_query(filtered_columns)
        database_connection_mem.run_query_memgraph(cypher_query)

        filtered_columns.remove("ActivityName")

        cypher_query = create_obs_relation_query(filtered_columns)
        database_connection_mem.run_query_memgraph(cypher_query)
        cypher_query = create_full_obs_relation_query_two(filtered_columns)
        database_connection_mem.run_query_memgraph(cypher_query)

        for key in filtered_columns:
            query = create_class_df_relation_query(key)
            database_connection_mem.run_query_memgraph(query)

    except Exception as e:
        print(f"Internal Server error: {str(e)}")
        raise
