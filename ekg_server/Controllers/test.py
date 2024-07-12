from datetime import datetime
from pathlib import Path
import json
import subprocess
from flask import request, jsonify
from GraphController.operation_graph_controller import *

from Models.api_response_model import ApiResponse


# Create standard Graph function
def test_creation(database_connector):
    apiResponse = ApiResponse(None, None, None)

    if request.files['file'] is None:
        apiResponse.http_status_code = 400
        apiResponse.message = "Bad request"
        apiResponse.response_data = None
        return jsonify(apiResponse.to_dict()), 400

    file = request.files['file']

    if not file or not file.filename.endswith(".csv"):
        apiResponse.http_status_code = 400
        apiResponse.message = "Bad request"
        apiResponse.response_data = None
        return jsonify(apiResponse.to_dict()), 400

    filtered_column_json = request.form.get('filteredColumn')
    filtered_column = json.loads(filtered_column_json)

    values_column_json = request.form.get('valuesColumn')
    values_column = json.loads(values_column_json)

    fixed_column = request.form.get('fixed').replace('"', '')
    variable_column = request.form.get('variable').replace('"', '')

    project_dir = Path(__file__).parent
    print(f"Project directory: {project_dir}")

    temp_dir = project_dir / 'temp'
    if not temp_dir.exists():
        print(f"Creating directory: {temp_dir}")
        temp_dir.mkdir(parents=True)

    ct = datetime.now().strftime("%Y%m%d%H%M%S")
    file_name = f'{ct}_{file.filename}'
    temp_csv_path = temp_dir / file_name
    print(f"Temporary file path: {temp_csv_path}")

    file.save(temp_csv_path)
    print(f"File saved to: {temp_csv_path}")

    # pass into the call
    container_id = "ed9bff4dbe7193422e881f6caae50d69bf9f31a0cf26a1fd3c7711ea6fa5f445"

    container_csv_path = f'/tmp/{file_name}'

    subprocess.run(['docker', 'cp', str(temp_csv_path), f'{container_id}:{container_csv_path}'], check=True)
    print(f"File copied to container {container_id}: {container_csv_path}")

    result = subprocess.run(['docker', 'exec', container_id, 'ls', '/tmp'], capture_output=True, text=True)
    if file_name in result.stdout:
        print(f"File {file_name} exists in container {container_id}")
    else:
        print(f"File {file_name} does not exist in container {container_id}")
        return jsonify({'error': 'File not found in container'}), 500

    try:
        container_name = 'memgraph'

        container_csv_path = f'/tmp/{file_name}'
        subprocess.run(['docker', 'cp', str(temp_csv_path), f'{container_name}:{container_csv_path}'], check=True)
        print(f"File copied to container: {container_csv_path}")

        database_connector.connect()

        query = f"LOAD CSV FROM '{container_csv_path}' WITH HEADER AS row CREATE (n:Node {{EventId: row.event_id, Timestamp: row.timestamp, Activity: row.activity_name}});"

        database_connector.run_query_memgraph(query)

        apiResponse.http_status_code = 201
        apiResponse.message = 'Standard Graph created successfully.'
        print("CSV data loaded into Memgraph successfully.")

        subprocess.run(['docker', 'exec', container_id, 'rm', container_csv_path], check=True)
        print(f"File removed from container {container_id}: {container_csv_path}")

        return jsonify(apiResponse.to_dict()), 200

    except Exception as e:
        apiResponse.http_status_code = 500
        apiResponse.message = f'Error while importing data to Memgraph: {str(e)}.'
        apiResponse.response_data = None

        return jsonify(apiResponse.to_dict()), 500

    finally:
        if temp_csv_path.exists():
            temp_csv_path.unlink()
            print(f"File removed: {temp_csv_path}")
        database_connector.close()
