"""
-------------------------------
File : graph_service.py
Description: Service for graph controller
Date creation: 07-07-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""

# Import
import io
import pandas as pd
import subprocess
from pathlib import Path
from datetime import datetime
from Utils.causal_query_lib import *
from Models.memgraph_connector_model import *
from Services.op_graph_service import *

# Global variable for socket
have_finished = False


# The Service for graph controller
class GraphService:

    @staticmethod
    def create_graph_s(file, filtered_column, values_column, fixed_column, variable_column, container_name,
                       container_id,
                       database_connector,
                       socketio):
        global have_finished

        if have_finished:
            have_finished = False

        apiResponse = ApiResponse(None, None, None)

        causality = None

        if not (fixed_column is None and values_column is None):
            causality = (fixed_column, variable_column)

        try:
            database_connector.connect()

            start_time = time.time()

            # Start the Socket IO for WebSocket
            socketio.start_background_task(target=track_graph_creation_progress, socketio=socketio,
                                           db_connector=database_connector, start_time=start_time)

            file_data = file.read().decode('utf-8')
            df = pd.read_csv(io.StringIO(file_data))
            standard_process_query_c(database_connector, df, filtered_column, values_column, causality)

            stop_time = time.time()

            duration_time = stop_time - start_time

            apiResponse.http_status_code = 201
            apiResponse.message = 'Standard Graph created successfully.'
            apiResponse.response_data = f'Temp : {duration_time}'

            have_finished = True

            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f'Error while importing data to Memgraph: {str(e)}.'
            apiResponse.response_data = None

            have_finished = True

            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()


# Process the .csv file and execute query for create standard Graph
def standard_process_query_c(database_connector, df, filtered_columns, values_column, causality=None):
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
                relation_query_corr = create_corr_relation_query(key)
                database_connector.run_query_memgraph(relation_query_corr)

        if causality is not None:
            queries = reveal_causal_rels(causality[0], causality[1])
            for query in queries:
                database_connector.run_query_memgraph(query)
            for key in filtered_columns:
                if key not in [event_id_col, timestamp_col, activity_name_col, causality[0]]:
                    relation_query_df = create_df_relation_query(key)
                    database_connector.run_query_memgraph(relation_query_df)
        else:
            for key in filtered_columns:
                if key not in [event_id_col, timestamp_col, activity_name_col]:
                    relation_query_df = create_df_relation_query(key)
                    database_connector.run_query_memgraph(relation_query_df)
        now = datetime.now()

        current_time = now.strftime("%H:%M:%S")
        print("Current End Time =", current_time)
    except Exception as e:
        return e


def copy_file(file):
    shared_dir = Path('shared-memgraph')

    if not shared_dir.exists():
        print(f"Creating directory : {shared_dir}")
        shared_dir.mkdir(parents=True)

    # Create the file name by the timestamp
    ct = datetime.now()
    file_name = f'csv_{ct}'

    # Create path and save the file
    dest_csv_path = shared_dir / file_name
    file.save(dest_csv_path)
    print(f"File saved to: {dest_csv_path}")

    return file.filename


def track_graph_creation_progress(socketio, db_connector, start_time):
    try:
        while True:
            event_nodes_count = OperationGraphService.get_count_event_nodes_s(db_connector)
            entity_nodes_count = OperationGraphService.get_count_entity_nodes_s(db_connector)

            total_nodes = event_nodes_count + entity_nodes_count

            corr_rel_count = OperationGraphService.get_count_corr_relationships_s(db_connector)
            df_rel_count = OperationGraphService.get_count_df_relationships_s(db_connector)

            total_relationships = corr_rel_count + df_rel_count

            socketio.emit('progress', {
                'event_nodes': event_nodes_count,
                'entity_nodes': entity_nodes_count,
                'corr_relationships': corr_rel_count,
                'df_relationships': df_rel_count,
                'total_nodes': total_nodes,
                'total_relationships': total_relationships,
                'elapsed_time': time.time() - start_time
            })

            if have_finished:
                break

            time.sleep(2)

        socketio.emit('complete', {
            'message': 'Graph creation complete',
            'total_nodes': total_nodes,
            'total_relationships': total_relationships,
            'total_time': time.time() - start_time
        })

    except Exception as ex:
        print(f"Error in track_graph_creation_progress: {ex}")
        socketio.emit('error', {'message': str(ex)})
