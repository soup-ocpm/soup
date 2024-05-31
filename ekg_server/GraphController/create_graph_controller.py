"""
-------------------------------
File : create_graph_controller.py
Description: Controller for generate Graph (Standard)
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
import time
import pandas as pd
from datetime import datetime
from flask import request, jsonify
from Models.api_response_model import ApiResponse
from Utils.query_library import create_df_relation_query, create_node_event_query, create_node_entity_query, \
    create_corr_relation_query


# Create standard Graph function
def create_graph_c(database_connector):
    apiResponse = ApiResponse(None, None, None)

    if request.files['file'] is None:
        apiResponse.http_status_code = 400
        apiResponse.message = "Bad request"
        apiResponse.response_data = None
        return jsonify(apiResponse.to_dict()), 400

    file = request.files['file']

    if not file or not file.filename.endswith(".csv"):
        apiResponse.http_status_code = 400
        apiResponse.message = "Bad request"
        apiResponse.response_data = None
        return jsonify(apiResponse.to_dict()), 400

    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    values_column_json = request.form.get('valuesColumn')
    values_column = json.loads(values_column_json)

    fixed_column = request.form.get('fixed')
    variable_column = request.form.get('variable')

    print(fixed_column)
    print(variable_column)

    try:
        database_connector.connect()

        start_time = time.time()

        file_data = file.read().decode('utf-8')
        df = pd.read_csv(io.StringIO(file_data))
        standard_process_query_c(database_connector, df, filtered_column, values_column)

        stop_time = time.time()

        duration_time = stop_time - start_time

        apiResponse.http_status_code = 201
        apiResponse.message = 'Standard Graph created successfully.'
        apiResponse.response_data = f'Temp : {duration_time}'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.message = f'Error while importing data to Neo4j: {str(e)}.'
        apiResponse.response_data = None
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


# Process the .csv file and execute query for create standard Graph
def standard_process_query_c(database_connector, df, filtered_columns, values_column):
    try:
        now = datetime.now()

        current_time = now.strftime("%H:%M:%S")
        print("Current Init Time =", current_time)

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
                    if key in values_column:
                        cypher_properties.append(f"{key}: coalesce(${key}, '')")
                        parameters[key] = value
            cypher_query = create_node_event_query(cypher_properties)
            database_connector.run_query_memgraph(cypher_query, parameters)

            for key, value in row.items():
                if key not in [event_id_col, timestamp_col, activity_name_col] and key in filtered_columns:
                    entity_query = create_node_entity_query()
                    if type(value) is float:
                        if not math.isnan(value):
                            entity_parameters = {
                                "property_value": value,
                                "type_value": key
                            }
                            database_connector.run_query_memgraph(entity_query, entity_parameters)
                    elif ',' in value:  # check if entities are a set of elements
                        value = value.split(',')
                        for val in value:
                            entity_parameters = {
                                "property_value": val,
                                "type_value": key
                            }
                            database_connector.run_query_memgraph(entity_query, entity_parameters)
                    else:
                        entity_parameters = {
                            "property_value": value,
                            "type_value": key
                        }
                        database_connector.run_query_memgraph(entity_query, entity_parameters)

        for key in filtered_columns:
            if key not in [event_id_col, timestamp_col, activity_name_col]:
                correlation_query_corr = create_corr_relation_query(key)
                database_connector.run_query_memgraph(correlation_query_corr)

        for key in filtered_columns:
            if key not in [event_id_col, timestamp_col, activity_name_col]:
                correlation_query_df = create_df_relation_query(key)
                database_connector.run_query_memgraph(correlation_query_df)
        now = datetime.now()

        current_time = now.strftime("%H:%M:%S")
        print("Current End Time =", current_time)
    except Exception as e:
        return e
