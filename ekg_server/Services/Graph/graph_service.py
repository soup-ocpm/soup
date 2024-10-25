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
import time
import shutil
import pandas as pd

from Services.Graph.op_graph_service import *
from Services.docker_service import *
from Utils.causal_query_lib import *
from Models.dataset_process_info_model import DatasetProcessInformation

# Global variable for socket
have_finished = False


# The Service for graph controller
class GraphService:

    @staticmethod
    def create_graph_s(file, copy_file, dataset_name, dataset_description, process_execution, standard_column,
                       filtered_column,
                       values_column,
                       fixed_column,
                       variable_column,
                       container_id,
                       database_connector,
                       socketio):

        global have_finished

        if have_finished:
            have_finished = False

        apiResponse = ApiResponse(None, None, None)
        process_info = DatasetProcessInformation()

        causality = None
        if not (fixed_column is None and values_column is None):
            causality = (fixed_column, variable_column)

        try:
            # 1. Copy the file on the container
            container_csv_path = DockerService.copy_csv_file(container_id, file)

            if container_csv_path == 'error':
                apiResponse.http_status_code = 500
                apiResponse.message = 'Failed to copy file in the container'
                return jsonify(apiResponse.to_dict()), 500

            database_connector.connect()

            # 3. Execute the query
            file_data = copy_file.read().decode('utf-8')
            df = pd.read_csv(io.StringIO(file_data))
            result = standard_process_query_c(socketio, process_info, database_connector, dataset_name,
                                              dataset_description, process_execution, df, container_id,
                                              container_csv_path,
                                              standard_column,
                                              filtered_column,
                                              values_column,
                                              causality)

            have_finished = True

            if result != 'success':
                apiResponse.http_status_code = 400
                apiResponse.message = f'Error while importing data to Memgraph: {str(result)}.'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 400

            # 5. Remove the file on the container
            DockerService.remove_csv_file(container_id, container_csv_path)

            # 6. Remove the temp folder
            # project_dir = Path(__file__).parent
            # temp_dir = project_dir / 'temp_csv'
            # shutil.rmtree(temp_dir)

            apiResponse.http_status_code = 201
            apiResponse.message = 'Standard Graph created successfully.'
            apiResponse.response_data = result
            return jsonify(apiResponse.to_dict()), 201

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f'Error while importing data to Memgraph: {str(e)}.'
            apiResponse.response_data = None
            have_finished = True
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()


# Process the .CSV file and execute query for create standard Graph
def standard_process_query_c(socketio, process_info, database_connector, dataset_name, dataset_description,
                             process_execution,
                             df,
                             container_id,
                             container_csv_path,
                             standard_column,
                             filtered_columns,
                             values_column, causality):
    try:
        # The current time
        process_info.init_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        print("Current Init Time =", process_info.init_time)

        # 2. Start the Socket IO for WebSocket
        # socketio.start_background_task(target=track_graph_creation_progress, socketio=socketio,
        # db_connector=database_connector, start_time=time.time(),
        # database_name=dataset_name)

        # 1. Execute the event nodes query and save the time
        cypher_properties = []
        for key in values_column:
            if key not in standard_column:
                if key not in ['event_id', 'timestamp', 'activity_name']:
                    cypher_properties.append(f"{key}: coalesce(row.{key}, '')")

        process_info.init_event_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        query = load_event_node_query(container_csv_path, 'event_id', 'timestamp', 'activity_name',
                                      dataset_name,
                                      cypher_properties)
        database_connector.run_query_memgraph(query)

        process_info.finish_event_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        print(f"Created event nodes in "
              f"{process_info.calculate_duration_in_seconds(process_info.init_event_time, process_info.finish_event_time)} "
              f"seconds")

        # 2. Execute the entity nodes query and save the time
        entities = filtered_columns
        unique_values_data = []
        for col in entities:
            if col not in standard_column:
                unique_values = df[col].unique()
                for value in unique_values:
                    if not str(value) == "nan":
                        unique_values_data.append({'type': col, 'value': value})
        unique_values_df = pd.DataFrame(unique_values_data)

        # Copy the entity csv file
        result = DockerService.copy_entity_csv_file(container_id, unique_values_df)

        if result == 'error':
            return 0

        process_info.init_entity_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

        query = load_entity_node_query(result, dataset_name)
        database_connector.run_query_memgraph(query)

        process_info.finish_entity_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

        print(f"Created entity nodes in "
              f"{process_info.calculate_duration_in_seconds(process_info.init_entity_time, process_info.finish_entity_time)} "
              f"seconds")

        # Create entities index to optimize :CORR creation
        database_connector.run_query_memgraph(create_entity_index())

        # 3. Create :CORR relationships
        process_info.init_corr_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

        for key in filtered_columns:
            if key not in ['event_id', 'timestamp', 'activity_name']:
                relation_query_corr = create_corr_relation_query(key, dataset_name)
                database_connector.run_query_memgraph(relation_query_corr)

        process_info.finish_corr_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        print(f"Created CORR relationships in "
              f"{process_info.calculate_duration_in_seconds(process_info.init_corr_time, process_info.finish_corr_time)} "
              f"seconds")

        # 4. Causality check
        process_info.init_df_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

        if causality is not None:
            # 4.1. Create :CAUS relationships
            queries = reveal_causal_rels(causality[0], causality[1])
            for query in queries:
                database_connector.run_query_memgraph(query)
            for key in filtered_columns:
                if key not in ['event_id', 'timestamp', 'activity_name', causality[0]]:
                    relation_query_df = create_df_relation_query(key, dataset_name)
                    database_connector.run_query_memgraph(relation_query_df)
        else:
            # 4.2. Create :DF relationships
            for key in filtered_columns:
                if key not in ['event_id', 'timestamp', 'activity_name']:
                    relation_query_df = create_df_relation_query(key, dataset_name)
                    database_connector.run_query_memgraph(relation_query_df)

        process_info.finish_df_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        print(f"Created :DF relationships in "
              f"{process_info.calculate_duration_in_seconds(process_info.init_df_time, process_info.finish_df_time)} "
              f"seconds")

        process_info.finish_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        print("Current End Time =", process_info.finish_time)

        event_nodes = OperationGraphService.get_count_event_nodes_s(database_connector, dataset_name)
        entity_nodes = OperationGraphService.get_count_entity_nodes_s(database_connector, dataset_name)
        corr_rel = OperationGraphService.get_count_corr_relationships_s(database_connector, dataset_name)
        df_rel = OperationGraphService.get_count_df_relationships_s(database_connector, dataset_name)

        query = create_dataset_full_node(process_execution, dataset_name, dataset_description, event_nodes,
                                         entity_nodes, corr_rel,
                                         df_rel, process_info)

        database_connector.run_query_memgraph(query)

        return 'success'

    except Exception as e:
        return f'Error: {e}'


# For WebSocket tracking process (actually not use)
def track_graph_creation_progress(socketio, db_connector, start_time, dataset_name):
    try:
        while True:
            event_nodes_count = OperationGraphService.get_count_event_nodes_s(db_connector, dataset_name)
            entity_nodes_count = OperationGraphService.get_count_entity_nodes_s(db_connector, dataset_name)

            total_nodes = event_nodes_count + entity_nodes_count

            corr_rel_count = OperationGraphService.get_count_corr_relationships_s(db_connector, dataset_name)
            df_rel_count = OperationGraphService.get_count_df_relationships_s(db_connector, dataset_name)

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
