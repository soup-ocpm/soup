"""
-------------------------------
File : create_class_graph_controller.py
Description: Controller for generate Graph (class)
Date creation: 23-02-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""

# Import
import json
import time

from flask import request
from Utils.query_library import *
from GraphController.operation_class_graph_controller import *

have_finished = False


# Create Class Graph function
def create_class_graph_c(database_connector, socketio):
    global have_finished

    if have_finished:
        have_finished = False

    apiResponse = ApiResponse(None, None, None)

    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    try:
        database_connector.connect()

        start_time = time.time()

        # Start the Socket IO for WebSocket
        socketio.start_background_task(target=track_class_graph_creation_progress, socketio=socketio,
                                       db_connector=database_connector, start_time=start_time)

        class_process_query_c(database_connector, filtered_column)

        stop_time = time.time()

        duration_time = stop_time - start_time

        apiResponse.http_status_code = 201
        apiResponse.message = 'Class Graph created successfully.'
        apiResponse.response_data = f'Temp : {duration_time}'

        have_finished = True

        return jsonify(apiResponse.to_dict()), 201

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.message = f'Error while importing data to Neo4j: {str(e)}.'
        apiResponse.response_data = None

        have_finished = True

        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


# Execute query for create Class Graph
def class_process_query_c(database_connector, filtered_columns):
    try:
        if (len(filtered_columns) > 1):
            # check nan entities with nan values if there are other column other than activity name
            cypher_query = get_nan_entities()
            res = database_connector.run_query_memgraph(cypher_query)

            # cast from float to string
            for element in res:
                entity = element['prop']
                cypher_query = change_nan(entity)
                database_connector.run_query_memgraph(cypher_query)

        cypher_query = create_class_multi_query(filtered_columns)
        database_connector.run_query_memgraph(cypher_query)

        df_query = class_df_aggregation(rel_type='DF', class_rel_type='DF_C')
        database_connector.run_query_memgraph(df_query)
    except Exception as e:
        print(f"Internal Server error: {str(e)}")
        raise


def track_class_graph_creation_progress(socketio, db_connector, start_time):
    try:
        while True:
            class_nodes_count = get_count_class_nodes_c(db_connector)

            obs_rel_count = get_count_obs_relationships_c(db_connector)
            dfc_rel_count = get_count_dfc_relationships_c(db_connector)

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
