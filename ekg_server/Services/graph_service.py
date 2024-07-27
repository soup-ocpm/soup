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
import tarfile
import time
import docker
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
            container = None

            # 2 for LOAD CSV method, 1 otherwise
            if standard_process == "2":
                print('[EXECUTE - LOAD CSV METHOD] Pre-Load')
                project_dir = Path(__file__).parent

                temp_dir = project_dir / 'temp_csv'

                # 1. Create temp directory
                if not temp_dir.exists():
                    temp_dir.mkdir(parents=True)

                ct = datetime.now().strftime("%Y%m%d%H%M%S")
                file_name = f'{ct}_{file.filename}'
                temp_csv_path = temp_dir / file_name

                # 2. Save the file in the directory
                file.save(temp_csv_path)
                print(f'File saved in: {temp_csv_path}')

                client = docker.from_env()
                container = client.containers.get(container_id)

                # 3. Create a tar archive of the file
                tarstream = io.BytesIO()
                with tarfile.open(fileobj=tarstream, mode='w') as tar:
                    tar.add(temp_csv_path, arcname=file_name)
                tarstream.seek(0)

                # 4. Copy the tar archive into the container
                container.put_archive('/tmp', tarstream)
                container_csv_path = f'/tmp/{file_name}'

                # 5. Check if the file was copied or not
                result = container.exec_run(['ls', '/tmp'])
                if result.exit_code != 0:
                    apiResponse.http_status_code = 500
                    apiResponse.message = 'Failed to list files in the container'
                    return jsonify(apiResponse.to_dict()), 500

                if file_name in result.output.decode():
                    print(f"File correctly imported: {file_name} exists in container {container_id}")
                else:
                    print(f"File {file_name} does not exist in container {container_id}")
                    apiResponse.http_status_code = 500
                    apiResponse.message = 'File not found in the container'
                    return jsonify(apiResponse.to_dict()), 500

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

                standard_process_query_c(database_connector, standard_process, df, container_id, container_csv_path,
                                         standard_column,
                                         filtered_column,
                                         values_column,
                                         causality)

                stop_time = time.time()

                duration_time = stop_time - start_time

                if standard_process == "2":

                    # 6. Remove the file in the container
                    result = container.exec_run(['rm', container_csv_path])
                    if result.exit_code != 0:
                        apiResponse.http_status_code = 500
                        apiResponse.message = 'Failed to remove file in the container'
                        return jsonify(apiResponse.to_dict()), 500
                    print('File removed in the container')

                    # 7. Remove the file in the /temp directory
                    temp_csv_path.unlink()
                    print('File removed on the container')

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
def standard_process_query_c(database_connector, standard_process, df, container_id, container_csv_path,
                             standard_column,
                             filtered_columns,
                             values_column, causality):
    try:
        now = datetime.now()

        current_time = now.strftime("%H:%M:%S")
        print("Current Init Time =", current_time)

        event_id_col = 'event_id'
        timestamp_col = 'timestamp'
        activity_name_col = 'activity_name'

        # 1. Create Event nodes
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

            event_time_start = datetime.now()

            for key in values_column:
                if key not in standard_column:
                    if key not in [event_id_col, timestamp_col, activity_name_col]:
                        cypher_properties.append(f"{key}: coalesce(row.{key}, '')")

            query = load_event_node_query(container_csv_path, event_id_col, timestamp_col, activity_name_col,
                                          cypher_properties)
            database_connector.run_query_memgraph(query)

            event_time_end = datetime.now()
            event_diff = (event_time_end - event_time_start).total_seconds()
            print(f"Created :Event nodes in {event_diff} seconds")

        # 2. Create Entity nodes
        if standard_process is "1":
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
        else:
            ent_time_start = datetime.now()

            entities = filtered_columns
            unique_values_data = []
            for col in entities:
                unique_values = df[col].unique()
                for value in unique_values:
                    if not str(value) == "nan":
                        unique_values_data.append({'type': col, 'value': value})
            unique_values_df = pd.DataFrame(unique_values_data)

            # 1. Copy the file in /temp folder
            project_dir = Path(__file__).parent

            temp_dir = project_dir / 'temp'

            if not temp_dir.exists():
                temp_dir.mkdir(parents=True)

            ct = datetime.now().strftime("%Y%m%d%H%M%S")
            file_name = f'{ct}_entities_unique_value.csv'
            temp_csv_path = temp_dir / file_name

            unique_values_df.to_csv(temp_csv_path, index=False)
            print(f'File saved in: {temp_csv_path}')

            # 2. Copy the file into the container
            client = docker.from_env()
            container = client.containers.get(container_id)

            # 3. Create a tar archive of the file
            tarstream = io.BytesIO()
            with tarfile.open(fileobj=tarstream, mode='w') as tar:
                tar.add(temp_csv_path, arcname=file_name)
            tarstream.seek(0)

            # 4. Copy the tar archive into the container
            container.put_archive('/tmp', tarstream)
            container_csv_path = f'/tmp/{file_name}'

            query = load_entity_node_query(container_csv_path)
            database_connector.run_query_memgraph(query)

            ent_time_end = datetime.now()
            ent_diff = (ent_time_end - ent_time_start).total_seconds()
            print(f"Created :Entity nodes in {ent_diff} seconds")

        corr_time_start = datetime.now()
        # 3. Create :CORR relationships
        for key in filtered_columns:
            if key not in [event_id_col, timestamp_col, activity_name_col]:
                relation_query_corr = create_corr_relation_query(key)
                database_connector.run_query_memgraph(relation_query_corr)
        corr_time_end = datetime.now()
        corr_diff = (corr_time_end - corr_time_start).total_seconds()
        print(f"Created :CORR relationships in {corr_diff} seconds")

        # 4. Causality check
        df_time_start = datetime.now()
        if causality is not None:
            # 4.1. Create :CAUS relationships
            queries = reveal_causal_rels(causality[0], causality[1])
            for query in queries:
                database_connector.run_query_memgraph(query)
            for key in filtered_columns:
                if key not in [event_id_col, timestamp_col, activity_name_col, causality[0]]:
                    relation_query_df = create_df_relation_query(key)
                    database_connector.run_query_memgraph(relation_query_df)
        else:
            # 4.2. Create :DF relationships
            for key in filtered_columns:
                if key not in [event_id_col, timestamp_col, activity_name_col]:
                    relation_query_df = create_df_relation_query(key)
                    database_connector.run_query_memgraph(relation_query_df)
            df_time_end = datetime.now()
            df_diff = (df_time_end - df_time_start).total_seconds()
        print(f"Created :DF relationships in {df_diff} seconds")

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
