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
import subprocess
from pathlib import Path
from datetime import datetime, time
from Models.memgraph_connector_model import *
from Services.op_graph_service import *

# Global variable for socket
have_finished = False


# The Service for graph controller
class GraphServiceTwo:

    @staticmethod
    def create_graph_s(file, filtered_column, values_column, fixed_column, variable_column,
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

                stop_time = time.time()

                # Process query
                standard_process_query_c(database_connector, container_csv_path, filtered_column, values_column)

                duration_time = stop_time - start_time

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


# Process the .csv file and execute query for create standard Graph
def standard_process_query_c(database_connector, container_csv_path, filtered_columns, values_column):
    try:
        query = f"LOAD CSV FROM '{container_csv_path}' WITH HEADER AS row CREATE (n:Node {{EventId: row.event_id, Timestamp: row.timestamp, Activity: row.activity_name}});"
        database_connector.run_query_memgraph(query)

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
