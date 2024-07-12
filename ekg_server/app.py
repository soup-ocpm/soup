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
from flask_socketio import SocketIO

# Controllers
from Controllers.docker_controller import docker_controller_bp
from Controllers.graph_controller import graph_controller_bp
from Controllers.class_graph_controller import class_graph_controller_bp
from Controllers.op_graph_controller import op_graph_controller_bp
from Controllers.op_class_graph_controller import op_class_graph_controller_bp

# App
app = Flask(__name__)

# Register the App Blueprint
app.register_blueprint(docker_controller_bp)
app.register_blueprint(graph_controller_bp)
app.register_blueprint(class_graph_controller_bp)
app.register_blueprint(op_graph_controller_bp)
app.register_blueprint(op_class_graph_controller_bp)

# Init the Socket
socketio = SocketIO(app, cors_allowed_origins="*")

# Store the Socket in the app configuration
app.config['socketio'] = socketio

# Add application CORS
CORS(app)


# Welcome API
@app.route('/api/v1/welcome')
def welcome_api():
    return jsonify({
        'status': 200,
        'message': 'Hello User'
    })


# Main
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
    socketio.run(app, debug=True)
