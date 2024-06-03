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
from Models.api_response_model import ApiResponse
from Utils.query_library import *


# Create Class Graph function
def create_class_graph_c(database_connector):
    apiResponse = ApiResponse(None, None, None)

    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    try:
        database_connector.connect()
        class_process_query_c(database_connector, filtered_column)

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
        database_connector.close()


# Execute query for create Class Graph
def class_process_query_c(database_connector, filtered_columns):
    try:
        if (len(filtered_columns) > 1):
            # check nan entities with nan values if there are other column other than activity name
            cypher_query = get_nan_entities()
            res = database_connector.run_query_memgraph(cypher_query)

            # cast from float to string
            for element in res:
                entity = element['prop']
                cypher_query = change_nan(entity)
                database_connector.run_query_memgraph(cypher_query)

        cypher_query = create_class_multi_query(filtered_columns)
        database_connector.run_query_memgraph(cypher_query)

        df_query = class_df_aggregation(rel_type='DF', class_rel_type='DF_C')
        database_connector.run_query_memgraph(df_query)
    except Exception as e:
        print(f"Internal Server error: {str(e)}")
        raise
