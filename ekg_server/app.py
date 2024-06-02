"""
-------------------------------
File : app.py
Description: Main project
Date creation: 20-02-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""

# Import
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from GraphController.create_graph_controller import create_graph_c
from GraphController.create_class_graph_controller import create_class_graph_c
from GraphController.operation_graph_controller import *
from GraphController.operation_class_graph_controller import *
from Models.memgraph_connector_model import MemgraphConnector

# App
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")
CORS(app)

# Database information:
uri_mem = 'bolt://localhost:7687'
auth_mem = ("", "")
database_connector = MemgraphConnector(uri_mem, auth_mem)


# WELCOME API
@app.route('/api/v1/welcome')
def welcome_api():
    return jsonify({
        'status': 200,
        'message': 'Hello User'
    })


# All API for Graph (Standard)
@app.route('/api/v1/graph', methods=['POST'])
def create_graph():
    return create_graph_c(database_connector, socketio)


@app.route('/api/v1/graph/nodes/event', methods=['GET'])
def get_event_nodes():
    return get_event_nodes_c(database_connector)


@app.route('/api/v1/graph/nodes/event_nodes_count', methods=['GET'])
def get_event_nodes_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = get_count_event_nodes_c(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = event_nodes_count
        apiResponse.message = 'Retrieve event nodes count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@app.route('/api/v1/graph/nodes/entity', methods=['GET'])
def get_entity_nodes():
    return get_entity_nodes_c(database_connector)


@app.route('/api/v1/graph/nodes/entity_nodes_count', methods=['GET'])
def get_entity_nodes_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = get_count_entity_nodes_c(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = event_nodes_count
        apiResponse.message = 'Retrieve entity nodes count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@app.route('/api/v1/graph/relationships/corr', methods=['GET'])
def get_corr_relationships():
    return get_corr_relationships_c(database_connector)


@app.route('/api/v1/graph/relationships/corr_rel_count', methods=['GET'])
def get_corr_relationships_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = get_count_corr_relationships_c(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = event_nodes_count
        apiResponse.message = 'Retrieve :CORR relationship count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@app.route('/api/v1/graph/relationships/df', methods=['GET'])
def get_df_relationships():
    return get_df_relationships_c(database_connector)


@app.route('/api/v1/graph/relationships/df_rel_count', methods=['GET'])
def get_df_relationships_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        event_nodes_count = get_count_df_relationships_c(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = event_nodes_count
        apiResponse.message = 'Retrieve :DF relationship count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@app.route('/api/v1/graph', methods=['GET'])
def get_graph():
    return get_graph_c(database_connector)


@app.route('/api/v1/graph/details', methods=['GET'])
def get_graph_details():
    return get_graph_details_c(database_connector)


@app.route('/api/v1/graph', methods=['DELETE'])
def delete_graph():
    return delete_all_graph_c(database_connector)


# All API for Graph (Class)
@app.route('/api/v1/graph-class', methods=['POST'])
def create_class_graph():
    return create_class_graph_c(database_connector, socketio)


@app.route('/api/v1/graph-class/nodes/class', methods=['GET'])
def get_class_nodes():
    return jsonify({
        'status': 500,
        'message': 'Not implemented yet'
    }), 500


@app.route('/api/v1/graph-class/nodes/class_nodes_count', methods=['GET'])
def get_class_nodes_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        class_nodes_count = get_count_class_nodes_c(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = class_nodes_count
        apiResponse.message = 'Retrieve class nodes count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@app.route('/api/v1/graph-class/relationships/obs_relationships_count', methods=['GET'])
def get_obs_relationships_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        obs_relationships_count = get_count_obs_relationships_c(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = obs_relationships_count
        apiResponse.message = 'Retrieve :OBS relationship count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@app.route('/api/v1/graph-class/relationships/dfc_relationships_count', methods=['GET'])
def get_dfc_relationships_count():
    apiResponse = ApiResponse(None, None, None)
    try:
        database_connector.connect()

        dfc_relationships_count = get_count_dfc_relationships_c(database_connector)

        apiResponse.http_status_code = 200
        apiResponse.response_data = dfc_relationships_count
        apiResponse.message = 'Retrieve :DF_C relationship count'

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.response_data = None
        apiResponse.message = f'Internal Server Error : {str(e)}'
        return jsonify(apiResponse.to_dict()), 500

    finally:
        database_connector.close()


@app.route('/api/v1/graph-class', methods=['GET'])
def get_class_graph():
    return get_class_graph_c(database_connector)


@app.route('/api/v1/graph-class', methods=['DELETE'])
def delete_class_graph():
    return delete_class_graph_c(database_connector)


# Other supports API
@app.route('/api/v1/support/entities_key', methods=['GET'])
def get_entities_key():
    return get_entities_key_c(database_connector)


@app.route('/api/v1/support/null-entities', methods=['GET'])
def get_null_entities():
    return get_null_entities_c(database_connector)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
    socketio.run(app, debug=True)
