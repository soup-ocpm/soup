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
from Models.memgraph_connector_model import MemgraphConnector
from Models.api_response_model import ApiResponse
from Utils.query_library import get_df_class_relation_query, delete_class_graph_query, get_count_class_graph_query

# Database information:
uri_mem = 'bolt://localhost:7687'
auth_mem = ("", "")
database_connection_mem = MemgraphConnector(uri_mem, auth_mem)


# Get Class Graph (Class nodes, :DF_C Relationships)
def get_class_graph_c():
    apiResponse = ApiResponse(None, None, None)

    try:
        database_connection_mem.connect()

        query_result = get_df_class_relation_query()
        result = database_connection_mem.run_query_memgraph(query_result)

        if not isinstance(result, Iterable):
            apiResponse.http_status_code = 404
            apiResponse.response_data = None
            apiResponse.message = "Not found"
            return jsonify(apiResponse.to_dict()), 404

        graph_data = []

        for record in result:
            node_id = record['nodeId']
            main_node = record['mainNode']
            type_rel = record['type']
            related_node_id = record['relatedNodeId']

            related_node_data = next((item for item in result if item["nodeId"] == related_node_id), None)
            if related_node_data:
                related_node = related_node_data['mainNode']
                related_node['id'] = related_node_id
            else:
                related_node = None

            for key, value in main_node.items():
                if isinstance(value, (int, float)) and math.isnan(value):
                    main_node[key] = None

            graph_data.append({
                'class': {
                    'id': node_id,
                    **main_node
                },
                'related_class': related_node,
                'type': type_rel
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
        database_connection_mem.close()


# Delete Class Graph (Class nodes, :DF_C Relationships)
def delete_class_graph_c():
    apiResponse = ApiResponse(None, None, None)

    try:
        database_connection_mem.connect()

        query = delete_class_graph_query()
        database_connection_mem.run_query_memgraph(query)

        verification_query = get_count_class_graph_query()
        result = database_connection_mem.run_query_memgraph(verification_query)

        if result and result[0]['count'] == 0:
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
        database_connection_mem.close()
