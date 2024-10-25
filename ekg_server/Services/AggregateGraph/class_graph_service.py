"""
-------------------------------
File : class_graph_service.py
Description: Service for class graph
Date creation: 07-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
-------------------------------
"""

# Import
import time

from Services.AggregateGraph.op_class_graph_service import *
from Models.dataset_process_info_model import DatasetProcessInformation

# Global variable for socket
have_finished = False


# The Service for class graph
class ClassGraphService:

    # Create Class Graph function
    @staticmethod
    def create_class_graph_s(filtered_column, dataset_name, database_connector, socketio):
        global have_finished

        if have_finished:
            have_finished = False

        apiResponse = ApiResponse(None, None, None)
        process_info = DatasetProcessInformation()

        try:
            database_connector.connect()

            # Start the Socket IO for WebSocket
            # socketio.start_background_task(target=track_class_graph_creation_progress_c,
            # socketio=socketio,
            # db_connector=database_connector, dataset_name=dataset_name,
            # start_time=start_time)

            result = class_process_query_c(database_connector, process_info, filtered_column, dataset_name)

            have_finished = True

            if result != 'success':
                apiResponse.http_status_code = 400
                apiResponse.message = f'Error while importing data to Memgraph: {str(result)}.'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 400

            apiResponse.http_status_code = 201
            apiResponse.message = 'Class Graph created successfully.'
            apiResponse.response_data = result
            return jsonify(apiResponse.to_dict()), 201

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f'Error while importing data to Neo4j: {str(e)}.'
            apiResponse.response_data = None

            have_finished = True

            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()


def class_process_query_c(database_connector, process_info, filtered_columns, dataset_name):
    try:
        process_info.init_class_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        print("Current Init Time =", process_info.init_class_time)

        # 1. Check NaN entities with NaN values
        cypher_query = get_nan_entities(dataset_name)
        res = database_connector.run_query_memgraph(cypher_query)

        # 2. Cast value from Float to String
        process_info.init_class_node_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        for element in res:
            entity = element['prop']
            cypher_query = change_nan(dataset_name, entity)
            database_connector.run_query_memgraph(cypher_query)
        process_info.finish_class_node_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

        # 3. Create the :OBS relationships
        process_info.init_obs_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        cypher_query = create_class_multi_query(filtered_columns, dataset_name)
        database_connector.run_query_memgraph(cypher_query)

        cypher_query = set_class_weight(dataset_name)
        database_connector.run_query_memgraph(cypher_query)
        process_info.finish_obs_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

        # Create the :DF_C relationships
        process_info.init_dfc_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
        df_query = class_df_aggregation(dataset_name, rel_type='DF', class_rel_type='DF_C')
        database_connector.run_query_memgraph(df_query)
        process_info.finish_dfc_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

        process_info.finish_class_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

        # Finally update the Dataset node with new information
        class_nodes = OperationClassGraphService.get_count_class_nodes_s(database_connector, dataset_name)
        obs_rel = OperationClassGraphService.get_count_obs_relationships_s(database_connector, dataset_name)
        dfc_rel = OperationClassGraphService.get_count_dfc_relationships_s(database_connector, dataset_name)

        query = update_full_dataset_query(dataset_name, process_info, class_nodes, obs_rel, dfc_rel)
        database_connector.run_query_memgraph(query)

        return 'success'

    except Exception as e:
        return f'Error: {e}'


# For WebSocket tracking process (actually not use)
def track_class_graph_creation_progress_c(socketio, db_connector, dataset_name, start_time):
    try:
        while True:
            class_nodes_count = OperationClassGraphService.get_count_class_nodes_s(db_connector, dataset_name)

            obs_rel_count = OperationClassGraphService.get_count_obs_relationships_s(db_connector, dataset_name)
            dfc_rel_count = OperationClassGraphService.get_count_dfc_relationships_s(db_connector, dataset_name)

            total_relationships = obs_rel_count + dfc_rel_count

            socketio.emit('progress', {
                'class_nodes': class_nodes_count,
                'obs_relationships': obs_rel_count,
                'dfc_relationships': dfc_rel_count,
                'total_relationships': total_relationships,
                'elapsed_time': time.time() - start_time
            })

            if have_finished:
                break

            time.sleep(2)

        socketio.emit('complete', {
            'message': 'Graph creation complete',
            'class_nodes': class_nodes_count,
            'total_relationships': total_relationships,
            'total_time': time.time() - start_time
        })

    except Exception as ex:
        print(f"Error in track_graph_creation_progress: {ex}")
        socketio.emit('error', {'message': str(ex)})
