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
from flask import Flask, jsonify
from flask_cors import CORS
from GraphController.create_graph_controller import create_graph_c
from GraphController.create_class_graph_controller import create_class_graph_c
from GraphController.operation_graph_controller import get_event_nodes_c, get_entity_nodes_c, get_corr_relationships_c, \
    get_df_relationships_c, get_graph_c, get_graph_details_c, \
    delete_graph_c
from GraphController.operation_class_graph_controller import get_class_graph_c, delete_class_graph_c

# App
app = Flask(__name__)
CORS(app)


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
    return create_graph_c()


@app.route('/api/v1/graph/nodes/event', methods=['GET'])
def get_event_nodes():
    return get_event_nodes_c()


@app.route('/api/v1/graph/nodes/entity', methods=['GET'])
def get_entity_nodes():
    return get_entity_nodes_c()


@app.route('/api/v1/graph/relationships/corr', methods=['GET'])
def get_corr_relationships():
    return get_corr_relationships_c()


@app.route('/api/v1/graph/relationships/df', methods=['GET'])
def get_df_relationships():
    return get_df_relationships_c()


@app.route('/api/v1/graph', methods=['GET'])
def get_graph():
    return get_graph_c()


@app.route('/api/v1/graph/details', methods=['GET'])
def get_graph_details():
    return get_graph_details_c()


@app.route('/api/v1/graph', methods=['DELETE'])
def delete_graph():
    return delete_graph_c()


# All API for Graph (Class)
@app.route('/api/v1/graph-class', methods=['POST'])
def create_class_graph():
    return create_class_graph_c()


@app.route('/api/v1/graph-class/nodes/class', methods=['GET'])
def get_class_nodes():
    return jsonify({
        'status': 500,
        'message': 'Not implemented yet'
    }), 500


@app.route('/api/v1/graph-class', methods=['GET'])
def get_class_graph():
    return get_class_graph_c()


@app.route('/api/v1/graph-class', methods=['DELETE'])
def delete_class_graph():
    return delete_class_graph_c


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
