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
from GraphController.build_graph_controller import create_standard_graph_c, create_class_graph_c
from GraphController.operation_graph_controller import delete_graph_c, get_standard_graph_c, get_class_graph_c
from GraphController.connection_controller import connect_c

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


# ALL API FOR GRAPH
@app.route('/api/v1/upload-csv', methods=['POST'])
def create_standard_graph():
    return create_standard_graph_c()


@app.route('/api/v1/upload-csv/class', methods=['POST'])
def create_class_graph():
    return create_class_graph_c()


@app.route('/api/v1/graph', methods=['GET'])
def get_graph():
    return get_standard_graph_c()


@app.route('/api/v1/graph-class', methods=['GET'])
def get_class_graph():
    return get_class_graph_c()


@app.route('/api/v1/graph', methods=['DELETE'])
def delete_graph():
    return delete_graph_c()


# ALL API FOR CONNECTION DB CHOICE
@app.route('/api/v1/connect')
def send_connection_info():
    return connect_c()


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
