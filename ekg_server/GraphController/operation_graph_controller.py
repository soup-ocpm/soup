"""
-------------------------------
File : operation_graph_controller.py
Description: Operation graph controller
Date creation: 06-02-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""

# Import
import logging
import math
from flask import jsonify
from collections.abc import Iterable
from Models.memgraph_connector_model import MemgraphConnector
from Utils.query_library import get_df_node_rel_query, get_count_data_query, delete_graph_query, \
    get_df_2_node_rel_query

# Database information:
uri_mem = 'bolt://localhost:7687'
auth_mem = ("", "")
database_connection_mem = MemgraphConnector(uri_mem, auth_mem)


# Get standard graph (Event node and :DF Relationships)
def get_standard_graph_c():
    try:
        database_connection_mem.connect()

        query = get_df_node_rel_query()
        result = database_connection_mem.run_query_memgraph(query)

        if not isinstance(result, Iterable):
            return jsonify({
                'status': 404,
                'message': 'Data not found',
                'error': 'No data found for the specified criteria.'
            })

        graph_data = []

        for record in result:
            event_data = record['e']
            relation_type = record['type']
            related_event_data = record['e1']

            for key, value in event_data.items():
                if isinstance(value, (int, float)) and math.isnan(value):
                    event_data[key] = None

            for key, value in related_event_data.items():
                if isinstance(value, (int, float)) and math.isnan(value):
                    related_event_data[key] = None
            relation_id = f"{event_data['EventID']}_{related_event_data['EventID']}"

            graph_data.append({
                'node': event_data,
                'relation_node': related_event_data,
                'type': relation_type,
                'relationId': relation_id
            })

        if not graph_data:
            return jsonify({
                'status': 404,
                'message': 'Data not found',
                'error': 'No data found for the specified criteria.'
            })

        return jsonify({
            'status': 200,
            'message': 'Retrieve graph.',
            'graph_data': graph_data
        })
    except Exception as e:
        logging.error(f'Internal Server Error: {str(e)}')
        return jsonify({
            'status': 500,
            'message': 'Internal Server Error',
            'error': str(e)
        })
    finally:
        database_connection_mem.close()


# Get Class Graph (Class nodes, DF_C Relationships)
def get_class_graph_c():
    try:
        database_connection_mem.connect()

        query_result = get_df_2_node_rel_query()
        result = database_connection_mem.run_query_memgraph(query_result)

        df_data = []

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

            df_data.append({
                'class': {
                    'id': node_id,
                    **main_node
                },
                'related_class': related_node,
                'type': type_rel
            })

        return jsonify({
            'status': 200,
            'message': 'Retrieve graph.',
            'df_c_data': df_data
        })

    except Exception as e:
        logging.error(f'Internal Server Error: {str(e)}')
        return jsonify({
            'status': 500,
            'message': 'Internal Server Error',
            'error': str(e)
        })
    finally:
        database_connection_mem.close()


# Delete Graph
def delete_graph_c():
    try:
        database_connection_mem.connect()

        query = delete_graph_query()
        database_connection_mem.run_query_memgraph(query)

        verification_query = get_count_data_query()
        result = database_connection_mem.run_query_memgraph(verification_query)

        if result and result[0]['count'] == 0:
            return jsonify({
                'status': 200,
                'message': 'Database deleted successfully'
            }), 200
        else:
            return jsonify({
                'status': 500,
                'message': 'Data was not deleted as expected'
            }), 500
    except Exception as e:
        return jsonify({
            'status': 500,
            'message': f"Internal Server Error : {str(e)}"
        }), 500
    finally:
        database_connection_mem.close()
