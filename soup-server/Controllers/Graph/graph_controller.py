"""
------------------------------------------------------------------------
File : graph_controller.py
Description: Controller for standard graph
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import json

from flask import Blueprint, request, jsonify
from Controllers.graph_config import get_db_connector
from Services.Graph.graph_service import GraphService
from Models.api_response_model import ApiResponse

# Init the bp
graph_controller_bp = Blueprint('graph_bp', __name__)

# Engine database setup
database_connector = get_db_connector(debug=False)


@graph_controller_bp.route('/api/v2/graph', methods=['POST'])
def create_graph():
    response = ApiResponse()

    # Check the file
    if request.files['file'] is None:
        response.http_status_code = 400
        response.message = "Bad request"
        response.response_data = None
        return jsonify(response.to_dict()), 400

    file = request.files['file']

    if not file or not file.filename.endswith(".csv"):
        response.http_status_code = 400
        response.message = "Bad request"
        response.response_data = None
        return jsonify(response.to_dict()), 400

    copy_file = request.files['copy_file']

    # Dataset information
    dataset_name = request.form.get('dataset_name')
    dataset_description = request.form.get('dataset_description')

    # All columns
    all_columns_json = request.form.get('all_columns')
    all_columns = json.loads(all_columns_json)

    # Standard column
    standard_column_json = request.form.get('standardColumn')
    standard_column = json.loads(standard_column_json)

    # Query properties
    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    values_column_json = request.form.get('valuesColumn')
    values_column = json.loads(values_column_json)

    # Column section
    # fixed_column = request.form.get('fixed').replace('"', '')
    # variable_column = request.form.get('variable').replace('"', '')

    # Extract Trigger and Target if exists
    trigger_target_rows = []
    index = 0

    if 'trigger_0' in request.form and 'target_0' in request.form:
        while f'trigger_{index}' in request.form and f'target_{index}' in request.form:
            trigger = request.form.get(f'trigger_{index}')
            target = request.form.get(f'target_{index}')
            trigger_target_rows.append({'trigger': trigger, 'target': target})
            index += 1

    return GraphService.create_new_dataset(file, copy_file, dataset_name, dataset_description, all_columns,
                                           standard_column, filtered_column, values_column, trigger_target_rows,
                                           database_connector)
