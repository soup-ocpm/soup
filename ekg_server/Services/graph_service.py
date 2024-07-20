"""
------------------------------------------------------------------------
File : graph_service.py
Description: Service for graph controller
Date creation: 07-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import io
import time
import subprocess
import pandas as pd

from pathlib import Path
from datetime import datetime
from Services.op_graph_service import *
from Utils.causal_query_lib import *

# Global variable for socket
have_finished = False


# The Service for graph controller
class GraphService:

    @staticmethod
    def create_graph_s(file, copy_file, standard_process, standard_column, filtered_column, values_column, fixed_column,
                       variable_column,
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
            container_csv_path = ''
            temp_csv_path = ''

            # 2 for LOAD CSV method, 1 otherwise
            if standard_process is "2":
                print('[EXECUTE - LOAD CSV METHOD] Pre-Load')
                project_dir = Path(__file__).parent

                temp_dir = project_dir / 'temp'

                # 1. Create temp directory
                if not temp_dir.exists():
                    temp_dir.mkdir(parents=True)

                ct = datetime.now().strftime("%Y%m%d%H%M%S")
                file_name = f'{ct}_{file.filename}'
                temp_csv_path = temp_dir / file_name

                # 2. Save the file in the directory
                file.save(temp_csv_path)
                print(f'File saved in: {temp_csv_path}')

                # 3. Copy the file in the container
                container_csv_path = f'/tmp/{file_name}'
                result = subprocess.run(['docker', 'exec', container_id, 'mkdir', '-p', '/tmp'], capture_output=True,
                                        text=True)
                if result.returncode != 0:
                    apiResponse.http_status_code = 500
                    apiResponse.message = 'Failed to create /temp directory'
                    apiResponse.response_data = None

                    have_finished = True

                    return apiResponse

                result = subprocess.run(['docker', 'cp', str(temp_csv_path), f'{container_id}:{container_csv_path}'],
                                        capture_output=True, text=True)
                if result.returncode != 0:
                    apiResponse.http_status_code = 500
                    apiResponse.message = 'Failed to copy the file in the container'
                    apiResponse.response_data = None

                    have_finished = True

                    return apiResponse

                # 4. Check if the file was copied or not
                result = subprocess.run(['docker', 'exec', container_id, 'ls', '/tmp'], capture_output=True, text=True)
                if result.returncode != 0:
                    apiResponse.http_status_code = 500
                    apiResponse.message = 'Failed to list files in the container'
                    apiResponse.response_data = None

                    have_finished = True

                    return apiResponse

                if file_name in result.stdout:
                    print(f"File correctly import : {file_name} exists in container {container_id}")
                else:
                    print(f"File {file_name} does not exist in container {container_id}")
                    apiResponse.http_status_code = 500
                    apiResponse.message = 'File not found in the container'
                    apiResponse.response_data = None

                    have_finished = True

                    return apiResponse

                print(f'File saved on container with path: {container_csv_path}')

            try:
                # 5. Process the graph creation
                database_connector.connect()

                start_time = time.time()

                # Start the Socket IO for WebSocket
                socketio.start_background_task(target=track_graph_creation_progress, socketio=socketio,
                                               db_connector=database_connector, start_time=start_time)

                # Process query
                file_data = copy_file.read().decode('utf-8')
                df = pd.read_csv(io.StringIO(file_data))

                standard_process_query_c(database_connector, standard_process, df, container_csv_path, standard_column,
                                         filtered_column,
                                         values_column,
                                         causality)

                stop_time = time.time()

                duration_time = stop_time - start_time

                if standard_process is "2":
                    print('[EXECUTE - LOAD CSV METHOD] Delete file')
                    # 6. Remove the file in the container
                    subprocess.run(['docker', 'exec', container_id, 'rm', container_csv_path], check=True)
                    print('File remove')

                    # 7. Remove the file in the /temp directory
                    temp_csv_path.unlink()
                    print('File remove on the container')

                    have_finished = True

                apiResponse.http_status_code = 201
                apiResponse.message = 'Standard Graph created successfully.'
                apiResponse.response_data = f'Temp : {duration_time}'

                return jsonify(apiResponse.to_dict()), 201

            except Exception as e:
                apiResponse.http_status_code = 500
                apiResponse.message = f'Error while importing data to Memgraph: {str(e)}.'
                apiResponse.response_data = None

                have_finished = True

                return jsonify(apiResponse.to_dict()), 500

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f'Error while importing data to Memgraph: {str(e)}.'
            apiResponse.response_data = None

            have_finished = True

            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()


# Process the .CSV file and execute query for create standard Graph
def standard_process_query_c(database_connector, standard_process, df, container_csv_path, standard_column,
                             filtered_columns,
                             values_column, causality):
    try:
        now = datetime.now()

        current_time = now.strftime("%H:%M:%S")
        print("Current Init Time =", current_time)

        event_id_col = 'event_id'
        timestamp_col = 'timestamp'
        activity_name_col = 'activity_name'

        if standard_process is "1":
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
        else:
            print('[EXECUTE - LOAD CSV METHOD] Process')
            cypher_properties = []

            for key in values_column:
                if key not in standard_column:
                    if key not in [event_id_col, timestamp_col, activity_name_col]:
                        cypher_properties.append(f"{key}: coalesce(row.{key}, '')")

            # 1. Create Event nodes
            query = load_event_node_query(container_csv_path, event_id_col, timestamp_col, activity_name_col,
                                          cypher_properties)
            database_connector.run_query_memgraph(query)

        # 2. Create Entity nodes
        for index, row in df.iterrows():
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

        # 3. Create corr relationships
        for key in filtered_columns:
            if key not in [event_id_col, timestamp_col, activity_name_col]:
                relation_query_corr = create_corr_relation_query(key)
                database_connector.run_query_memgraph(relation_query_corr)

        # 4. Causality check
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


# For WebSocket tracking process
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
