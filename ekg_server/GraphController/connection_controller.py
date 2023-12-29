"""
-------------------------------
File : connection_controller.py
Description: Main project
Date creation: 07/10/2023
Project : pserveraura
Author: DiscoHub12 - veronikamoriconi
License : MIT
-------------------------------
"""

# IMPORT
from flask import request, jsonify
from py2neo import Graph


# Connect to specific Neo4j Database
def connect_c():
    data = request.get_json()

    required_fields = ['uri', 'instanceName', 'instanceId', 'username', 'password']
    if not all(field in data for field in required_fields):
        return jsonify({
            'status': 400,
            'message': 'Some fields are required'
        }), 400

    uri = data['uri']
    instance_name = data['instanceName']
    # instance_id = data['instanceId']
    username = data['username']
    password = data['password']

    try:
        graph = Graph(uri, name=instance_name, auth=(username, password))
        if graph is None:
            return jsonify({
                'status': 400,
                'message': 'Connection error.'
            }), 400

        # Do operation

        return jsonify({
            'status': 200,
            'message': 'Connected to Neo4j database successfully'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 500,
            'message': f'Failed to connect to Neo4j database: {str(e)}'
        }), 500
