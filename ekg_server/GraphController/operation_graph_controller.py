"""
-------------------------------
File : upload_controller.py
Description: Main project
Date creation: 07/11/2023
Project : pserveraura
Author: DiscoHub12 - veronikamoriconi
License : MIT
-------------------------------
"""

# Import
import logging
import math
from flask import jsonify
from collections.abc import Iterable
from Models.neo4j_connector_model import Neo4jConnector
from Utils.query_library import get_df_node_rel_query, get_count_data_query, delete_graph_query, \
    get_df_2_node_rel_query

# Database information:
uri = 'bolt://localhost:7687'
username = 'neo4j'
password = 'Docker12Maria'
database_name = 'neo4j-test'
database_connection = Neo4jConnector(uri, username, password, database_name)


# Get standard graph (Event node and :DF Relationships)
def get_standard_graph_c():
    try:
        database_connection.connect()

        query = get_df_node_rel_query()
        result = database_connection.run_query(query)

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
        database_connection.close()


# Get Class Graph (Class nodes, DF_C Relationships)
def get_class_graph_c():
    try:
        database_connection.connect()

        query = get_df_2_node_rel_query()
        result = database_connection.run_query(query)

        df_data = []

        if not isinstance(result, Iterable):
            return jsonify({
                'status': 404,
                'message': 'Data not found',
                'error': 'No data found for the specified criteria.'
            })

        for record in result:
            result_data = record['result']
            node_id = result_data['nodeId']
            main_node = result_data['mainNode']
            type_rel = result_data['type']
            related_nodes = result_data['relatedNodes']

            for key, value in main_node.items():
                if isinstance(value, (int, float)) and math.isnan(value):
                    main_node[key] = None

            for related_node in related_nodes:
                for key, value in related_node['relatedNode'].items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        related_node['relatedNode'][key] = None

            df_data.append({
                'class': {
                    'id': node_id,
                    **main_node
                },
                'related_class': [
                    {
                        'id': related_node['nodeId'],
                        **related_node['relatedNode']
                    }
                    for related_node in related_nodes
                ],
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
        database_connection.close()


# Delete Graph
def delete_graph_c():
    try:
        database_connection.connect()

        query = delete_graph_query()
        database_connection.run_query(query)

        verification_query = get_count_data_query()
        result = database_connection.run_query(verification_query)

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
        database_connection.close()
