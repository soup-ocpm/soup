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
    def copy_file_to_container(container_id, dataset_name, file_path, is_entity=False, is_json=False, is_svg=False):
        """
        Copy specific file to the docker container
        :param container_id: the container unique id
        :param dataset_name: the dataset name
        :param file_path: the file path
        :param is_entity: if the file is for entity
        :param is_json: if the file is json file
        :param is_svg: if the file is svg file
        :return: success or error message with content
        """
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
        elif is_svg:
            file_name = f"{dataset_name}_config.svg"

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
    def copy_analysis_file_to_container(container_id, file_path, dataset_name, analysis_name):
        """
        Copy new analysis to the docker container
        :param container_id: the container unique id
        :param file_path: the file path
        :param dataset_name: the dataset name
        :param analysis_name: the analysis name
        :return: success or error message with content
        """
        try:
            # 1. Check if the file exists
            analysis_file = Path(file_path)
            if not analysis_file.exists():
                return f"Error: The analysis file '{file_path}' does not exist.", None

            # 2. Connect to the Docker container
            client = docker.from_env()
            container = client.containers.get(container_id)

            # 3. Define directories in the container
            dataset_directory = f"/soup/{dataset_name}"
            analysis_directory = f"{dataset_directory}/Analyses"

            # 4. Create directories in the container
            for directory in [dataset_directory, analysis_directory]:
                result = container.exec_run(['sh', '-c', f'mkdir -p {directory}'])
                if result.exit_code != 0:
                    return f"Error: Failed to create directory {directory} in container.", None

            # 5. Prepare the tar archive
            tarstream = io.BytesIO()
            with tarfile.open(fileobj=tarstream, mode='w') as tar:
                tar.add(analysis_file, arcname=f"./{analysis_name}.json")
            tarstream.seek(0)

            # 6. Copy the file into the container
            container_file_path = f"{analysis_directory}/{analysis_name}.json"
            success = container.put_archive(analysis_directory, tarstream)

            if not success:
                return f"Error: Failed to copy the file to {container_file_path}", None

            return "success", container_file_path

        except Exception as e:
            import traceback
            traceback.print_exc()
            return f"Error during analysis file copy: {e}", None

    @staticmethod
    def read_json_file_from_container(container_id, dataset_name, analyses_name=None):
        """
        Read specific json file from the docker container
        :param container_id: the container unique id
        :param dataset_name: the dataset name
        :param analyses_name: the analysis name
        :return: the content or an error
        """
        # 0. Create the path
        if analyses_name:
            json_file_path = f'/soup/{dataset_name}/Analyses/{analyses_name}'
        else:
            json_file_path = f'/soup/{dataset_name}/{dataset_name}_config.json'

        try:
            client = docker.from_env()
            container = client.containers.get(container_id)

            # 1. Check the file
            result = container.exec_run(['ls', json_file_path])
            if result.exit_code != 0:
                print(f"File {json_file_path} does not exist in container {container_id}")
                return None, None

            # 2. Read the content
            exec_result = container.exec_run(['cat', json_file_path])
            if exec_result.exit_code != 0:
                print("Failed to read the JSON file")
                return None, None

            # 3. Decode json
            json_content = exec_result.output.decode('utf-8')
            exec_config_data = json.loads(json_content)

            return 'success', exec_config_data

        except Exception as e:
            print(f"Error: {e}")
            return None, None

    @staticmethod
    def remove_container_content_by_path(container_id, container_csv_path):
        """
        Remove specific content on specific docker container
        :param container_id: the container unique id
        :param container_csv_path: the path for the file or folder to remove
        :return: success or error message
        """
        client = docker.from_env()
        container = client.containers.get(container_id)

        result = container.exec_run(['rm', '-rf', container_csv_path])

        if result.exit_code != 0:
            print(f"Error: Unable to remove folder {container_csv_path} in container {container_id}")
            return 'error'

        return 'success'

    @staticmethod
    def get_dataset_file_path(container_id, dataset_name):
        """
        Get specific dataset files path
        :param container_id: the container unique id
        :param dataset_name: the dataset name
        :return: the content or an error
        """
        # Folder path
        dataset_folder_path = f'/soup/{dataset_name}/'

        # File name
        main_csv_name = f'{dataset_name}.csv'
        entity_csv_name = f'{dataset_name}_entity.csv'
        config_json_name = f'{dataset_name}_config.json'
        svg_name = f'{dataset_name}_config.svg'

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

            # SVG file
            svg_file_path = DockerFileManager._find_file(container, dataset_folder_path, svg_name)

            return main_csv_path, entity_csv_path, config_json_path, svg_file_path

        except Exception as e:
            print(f"Error: {e}")
            return None

    @staticmethod
    def get_svg_content_from_container(container_id, dataset_name):
        """
        Get specific svg content from docker container
        :param container_id: the container unique id
        :param dataset_name: the dataset name
        :return: the content or an error
        """
        try:
            client = docker.from_env()
            container = client.containers.get(container_id)

            container_svg_path = f'/soup/{dataset_name}/{dataset_name}_config.svg'
            result = container.exec_run(f"cat {container_svg_path}")

            svg_content = result.output.decode()

            if 'No such file or directory' in svg_content:
                return 'success', None

            return 'success', svg_content

        except Exception as e:
            print(f"Error: {e}")
            return 'Error', None

    @staticmethod
    def get_folder_files(container_id, directory):
        """
        Get all folder files from docker container
        :param container_id: the container unique id
        :param directory: the directory path
        :return: content or an error
        """
        try:
            client = docker.from_env()
            container = client.containers.get(container_id)

            result = container.exec_run(f"ls {directory}")
            folder_list = result.output.decode().splitlines()

            return 'success', folder_list

        except Exception as e:
            print(f"Error: {e}")
            return None

    @staticmethod
    def _find_file(container, folder_path: str, file_name: str) -> Optional[str]:
        """
        Find specific file on docker container
        :param container: the docker container
        :param folder_path: the folder path
        :param file_name: the file name
        :return: the content if exists
        """
        result = container.exec_run(['find', folder_path, '-name', file_name])
        if result.exit_code == 0:
            file_path = result.output.decode('utf-8').strip()
            return file_path if file_path else None
        return None
