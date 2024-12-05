"""
------------------------------------------------------------------------
File : docker_file_manager_model.py
Description: Docker file manager model class
Date creation: 26-10-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import io
import json
import tarfile
import docker

from pathlib import Path
from typing import Optional


# Docker File Manager model class (csv file, json and other)
class DockerFileManager:

    @staticmethod
    def copy_file_to_container(container_id, dataset_name, file_path, is_entity=False, is_json=False):
        # 1. Check the file
        temp_path = Path(file_path)
        if not temp_path.exists():
            return "Error: The specified file does not exist."

        # 2. Determine the file name based on is_entity
        file_name = f'{dataset_name}.csv'

        if is_entity:
            file_name = f"{dataset_name}_entity.csv"
        elif is_json:
            file_name = f"{dataset_name}_config.json"

        try:
            # 3. Get the client Docker env
            client = docker.from_env()
            container = client.containers.get(container_id)

            # 4. Check the folder
            container_directory = f'/soup/{dataset_name}'
            result = container.exec_run(
                ['sh', '-c', f'if [ ! -d {container_directory} ]; then mkdir -p {container_directory}; fi'])
            print("Directory creation result:", result.output)

            # 5. Create a tar archive
            tarstream = io.BytesIO()
            with tarfile.open(fileobj=tarstream, mode='w') as tar:
                tar.add(temp_path, arcname=f"./{file_name}")
            tarstream.seek(0)

            # 6. Copy the content on the container
            print(f"Attempting to copy to: {container_directory}/{file_name}")
            success = container.put_archive(container_directory, tarstream)

            if not success:
                return f"Error: put_archive failed to copy the file to {container_directory}"

            container_file_path = f'{container_directory}/{file_name}'
            return "success", container_file_path

        except Exception as e:
            import traceback
            traceback.print_exc()
            return f"Error during file copy: {e}"

    @staticmethod
    def read_csv_file_from_container(container_id, dataset_name, is_entity=False):
        # 1. Check the suffix
        file_suffix = "_entity.csv" if is_entity else ".csv"
        csv_file_path = f'/soup/{dataset_name}/{dataset_name}{file_suffix}'

        try:
            client = docker.from_env()
            container = client.containers.get(container_id)

            # 4. Check the file
            result = container.exec_run(['ls', csv_file_path])
            if result.exit_code != 0:
                print(f"File {csv_file_path} does not exist in container {container_id}")
                return None

            # 5. Read the CSV content
            exec_result = container.exec_run(['cat', csv_file_path])
            if exec_result.exit_code != 0:
                print("Failed to read the CSV file")
                return None

            # 6. Return the content as a string
            return exec_result.output.decode('utf-8')

        except Exception as e:
            print(f"Error: {e}")
            return None

    @staticmethod
    def read_configuration_json_file(container_id, dataset_name):
        # Json file path
        json_file_path = f'/soup/{dataset_name}/{dataset_name}_config.json'

        try:
            client = docker.from_env()
            container = client.containers.get(container_id)

            # 3. Check if the file exists
            result = container.exec_run(['ls', json_file_path])
            if result.exit_code != 0:
                print(f"File {json_file_path} does not exist in container {container_id}")
                return None, None

            # 4. Read the JSON content file
            exec_result = container.exec_run(['cat', json_file_path])
            if exec_result.exit_code != 0:
                print("Failed to read the JSON file")
                return None, None

            json_content = exec_result.output.decode('utf-8')
            exec_config_data = json.loads(json_content)

            return 'success', exec_config_data

        except Exception as e:
            print(f"Error: {e}")
            return None, None

    @staticmethod
    def remove_container_file_folder(container_id, container_csv_path):
        client = docker.from_env()
        container = client.containers.get(container_id)

        result = container.exec_run(['rm', '-rf', container_csv_path])

        if result.exit_code != 0:
            print(f"Error: Unable to remove folder {container_csv_path} in container {container_id}")
            return 'error'

        return 'success'

    @staticmethod
    def get_dataset_file_path(container_id, dataset_name):
        # Folder path
        dataset_folder_path = f'/soup/{dataset_name}/'

        # File name
        main_csv_name = f'{dataset_name}.csv'
        entity_csv_name = f'{dataset_name}_entity.csv'
        config_json_name = f'{dataset_name}_config.json'

        try:
            client = docker.from_env()
            container = client.containers.get(container_id)

            # Main CSV file
            main_csv_path = DockerFileManager._find_file(container, dataset_folder_path, main_csv_name)
            if main_csv_path is None:
                print(f"File {main_csv_name} not found in {dataset_folder_path}")
                return None

            # Entity csv file
            entity_csv_path = DockerFileManager._find_file(container, dataset_folder_path, entity_csv_name)
            if entity_csv_path is None:
                print(f"File {entity_csv_name} not found in {dataset_folder_path}")
                return None

            # Json file
            config_json_path = DockerFileManager._find_file(container, dataset_folder_path, config_json_name)
            if config_json_path is None:
                print(f"File {config_json_name} not found in {dataset_folder_path}")
                return None

            return main_csv_path, entity_csv_path, config_json_path

        except Exception as e:
            print(f"Error: {e}")
            return None

    @staticmethod
    def get_dataset_folders(container_id):
        # Folder path
        dataset_folder_path = f'/soup'

        try:
            client = docker.from_env()
            container = client.containers.get(container_id)

            result = container.exec_run(f"ls {dataset_folder_path}")
            folder_list = result.output.decode().splitlines()

            return 'success', folder_list

        except Exception as e:
            print(f"Error: {e}")
            return None

    @staticmethod
    def _find_file(container, folder_path: str, file_name: str) -> Optional[str]:
        result = container.exec_run(['find', folder_path, '-name', file_name])
        if result.exit_code == 0:
            file_path = result.output.decode('utf-8').strip()
            return file_path if file_path else None
        return None
