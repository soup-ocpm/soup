"""
-------------------------------
File : build_graph_controller.py
Description: Graph controller for generate EKG
Date creation: 06-02-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""

# Import
import io
import json
import math
import pandas as pd
from flask import request, jsonify

from Models.memgraph_connector_model import MemgraphConnector
from Utils.query_library import create_df_rel_query, create_observe_rel_one_two_query, create_nodes_event_query, \
    create_df_c_query, create_nodes_entity_query, create_corr_rel_two_query, create_class_nodes_query, \
    create_observe_rel_two_two_query, create_observe_rel_query, create_observe_rel_two_query

# Database information:
uri_mem = 'bolt://localhost:7687'
auth_mem = ("", "")
database_connection_mem = MemgraphConnector(uri_mem, auth_mem)


# Create standard Graph function
def create_standard_graph_c():
    file = request.files['file']

    if not file or not file.filename.endswith(".csv"):
        return jsonify({
            'status': 400,
            'message': 'File error'
        }), 400

    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    try:
        database_connection_mem.connect()
        file_data = file.read().decode('utf-8')
        df = pd.read_csv(io.StringIO(file_data))
        standard_process_query_c(df, filtered_column)
        return jsonify({
            'status': 200,
            'message': 'Data imported to Neo4j successfully'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 500,
            'message': f'Error while importing data to Neo4j: {str(e)}.'
        }), 500
    finally:
        database_connection_mem.close()


# Create Class Graph function
def create_class_graph_c():
    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    try:
        database_connection_mem.connect()
        class_process_query_c(filtered_column)
        return jsonify({
            'status': 200,
            'message': 'Data imported to Neo4j successfully'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 500,
            'message': f'Error while importing data to Neo4j: {str(e)}.'
        }), 500
    finally:
        database_connection_mem.close()


# Process the .csv file and execute query for create standard Graph
def standard_process_query_c(df, filtered_columns):
    try:
        event_id_col = None
        timestamp_col = None
        activity_name_col = None

        for index, column_name in enumerate(df.columns):
            if column_name.lower() == 'event_id':
                event_id_col = column_name
            elif column_name.lower() == 'timestamp':
                timestamp_col = column_name
            elif column_name.lower() == 'activity_name':
                activity_name_col = column_name

        if not (event_id_col and timestamp_col and activity_name_col):
            raise Exception("Event_id, Timestamp, or Activity_Name columns not found in the DataFrame.")

        for index, row in df.iterrows():
            event_id = row[event_id_col]
            time_stamp = row[timestamp_col]
            activity_name = row[activity_name_col]

            parameters = {
                "event_id": event_id,
                "timestamp": time_stamp,
                "activity_name": activity_name
            }

            cypher_properties = []

            for key, value in row.items():
                if key not in [event_id_col, timestamp_col, activity_name_col]:
                    if key in filtered_columns:
                        cypher_properties.append(f"{key}: coalesce(${key}, '')")
                        parameters[key] = value
            cypher_query = create_nodes_event_query(cypher_properties)
            database_connection_mem.run_query_memgraph(cypher_query, parameters)

            for key, value in row.items():
                if key not in [event_id_col, timestamp_col, activity_name_col] and key in filtered_columns:
                    entity_query = create_nodes_entity_query()
                    if type(value) is float:
                        if not math.isnan(value):
                            entity_parameters = {
                                "property_value": value,
                                "type_value": key
                            }
                            database_connection_mem.run_query_memgraph(entity_query, entity_parameters)
                    else:
                        entity_parameters = {
                            "property_value": value,
                            "type_value": key
                        }
                        database_connection_mem.run_query_memgraph(entity_query, entity_parameters)

        for key in filtered_columns:
            if key not in [event_id_col, timestamp_col, activity_name_col]:
                correlation_query_corr = create_corr_rel_two_query(key)
                database_connection_mem.run_query_memgraph(correlation_query_corr)

        for key in filtered_columns:
            if key not in [event_id_col, timestamp_col, activity_name_col]:
                correlation_query_df = create_df_rel_query(key)
                database_connection_mem.run_query_memgraph(correlation_query_df)

    except Exception as e:
        return e


# Execute query for create Class Graph
def class_process_query_c(filtered_columns):
    try:
        cypher_query = create_class_nodes_query(filtered_columns)
        database_connection_mem.run_query_memgraph(cypher_query)

        filtered_columns.remove("ActivityName")

        cypher_query = create_observe_rel_query(filtered_columns)
        database_connection_mem.run_query_memgraph(cypher_query)
        cypher_query = create_observe_rel_two_query(filtered_columns)
        database_connection_mem.run_query_memgraph(cypher_query)

        for key in filtered_columns:
            query = create_df_c_query(key)
            database_connection_mem.run_query_memgraph(query)

    except Exception as e:
        print(f"Internal Server error: {str(e)}")
