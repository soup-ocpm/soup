"""
------------------------------------------------------------------------
File : app.py
Description: Main project
Date creation: 20-02-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO

# Controllers
from Controllers.docker_controller import docker_controller_bp
from Controllers.Graph.graph_controller import graph_controller_bp
from Controllers.AggregateGraph.class_graph_controller import class_graph_controller_bp
from Controllers.generic_graph_controller import generic_graph_controller_bp
from Controllers.Graph.op_graph_controller import op_graph_controller_bp
from Controllers.AggregateGraph.op_class_graph_controller import op_class_graph_controller_bp
from Controllers.graph_json_controller import graph_json_controller_bp
from Controllers.dataset_controller import dataset_controller_bp

# App
app = Flask(__name__)

# Register the App Blueprint
app.register_blueprint(docker_controller_bp)
app.register_blueprint(dataset_controller_bp)
app.register_blueprint(graph_controller_bp)
app.register_blueprint(class_graph_controller_bp)
app.register_blueprint(generic_graph_controller_bp)
app.register_blueprint(op_graph_controller_bp)
app.register_blueprint(op_class_graph_controller_bp)
app.register_blueprint(graph_json_controller_bp)

# Init the Socket
socketio = SocketIO(app, cors_allowed_origins="*")

# Store the Socket in the app configuration
app.config['socketio'] = socketio

# Add application CORS
CORS(app)

# Configure SOuP Docker folder and volume
docker_soup_path = '/soup'

# Welcome API
@app.route('/api/v2/welcome', methods=['GET'])
def welcome_api():
    return jsonify({
        'http_status_code': 200,
        'message': 'Hello User'
    }), 200


# Main (run the Server on 8080)
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
    socketio.run(app, debug=True)
