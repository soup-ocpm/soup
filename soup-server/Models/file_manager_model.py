"""
------------------------------------------------------------------------
File : file_manager_model.py
Description: File manager model class
Date creation: 26-10-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import json

from pathlib import Path


# File Manager model class (csv file, json and other)
class FileManager:
    # The folder name for the csv files
    csv_folder_name = 'FileData/temp_csv'

    # The folder name for the csv entity file
    csv_entity_folder_name = 'FileData/temp_csv_entity'

    # The folder name for the json files
    json_folder_name = 'FileData/temp_json'

    @staticmethod
    def copy_csv_file(file, file_name, entity_folder):
        project_dir = Path(__file__).parent.parent
        folder_name = FileManager.csv_folder_name

        if entity_folder is True:
            folder_name = FileManager.csv_entity_folder_name

        temp_dir = project_dir / folder_name

        # 1. Check and create the folder "temp_csv"
        if not temp_dir.exists():
            temp_dir.mkdir(parents=True)

        complete_file_name = f'{file_name}.csv'
        new_file_path = temp_dir / complete_file_name

        try:
            # 2. Save the file on the directory
            if entity_folder is True:
                file.to_csv(new_file_path)
            else:
                file.save(new_file_path)

            # 3. Check if the file is correctly saved or not
            if new_file_path.exists() and new_file_path.stat().st_size > 0:
                return f"success", new_file_path
            else:
                return "Error while copy the file", None

        except Exception as e:
            return f"Error while copy the file: {e}", None

    @staticmethod
    def delete_csv_file(file_name, entity_folder):
        project_dir = Path(__file__).parent.parent
        folder_name = FileManager.csv_folder_name

        if entity_folder is True:
            folder_name = FileManager.csv_entity_folder_name

        temp_dir = project_dir / folder_name

        complete_file_name = f'{file_name}.csv'
        temp_csv_path = temp_dir / complete_file_name

        try:
            # Check the file and then delete
            if temp_csv_path.exists():
                temp_csv_path.unlink()
                return f"success"
            else:
                return f"Error while delete the file"
        except Exception as e:
            return f"Error while delete the file: {e}"

    @staticmethod
    def copy_json_file(json_content, file_name):
        project_dir = Path(__file__).parent.parent
        temp_dir = project_dir / FileManager.json_folder_name

        if not temp_dir.exists():
            temp_dir.mkdir(parents=True)

        complete_file_name = f'{file_name}.json'
        new_file_path = temp_dir / complete_file_name

        try:
            with open(new_file_path, 'w', encoding='utf-8') as f:
                json.dump(json_content, f, ensure_ascii=False, indent=4)

            if new_file_path.exists() and new_file_path.stat().st_size > 0:
                return "success", new_file_path
            else:
                return "Error while copying the file", None

        except Exception as e:
            return f"Error while copying the file: {e}", None

    @staticmethod
    def delete_json_file(file_name):
        project_dir = Path(__file__).parent.parent
        temp_dir = project_dir / FileManager.json_folder_name

        complete_file_name = f'{file_name}.json'
        temp_json_path = temp_dir / complete_file_name

        try:
            # Check the file and then delete
            if temp_json_path.exists():
                temp_json_path.unlink()
                return "success"
            else:
                return "Error while deleting the file"

        except Exception as e:
            return f"Error while deleting the file: {e}"

    @staticmethod
    def create_json_file(dataset_name, dataset_description, all_columns, standard_columns, filtered_columns,
                         values_columns=None, trigger_target_rows=None, event_nodes=None,
                         entity_nodes=None, corr_rel=None, df_rel=None, date_created=None, date_modified=None,
                         process_info=None):

        # Dictionary
        optional_fields = {
            "values_columns": values_columns or [],
            "trigger_target_rows": trigger_target_rows or [],
            "event_nodes": event_nodes or 0,
            "entity_nodes": entity_nodes or 0,
            "corr_rel": corr_rel or 0,
            "df_rel": df_rel or 0,
            "date_created": date_created or 0,
            "date_modified": date_modified or 0,
            "process_info": process_info or 0
        }

        # Create the Json
        json_data = {
            "dataset_name": dataset_name,
            "dataset_description": dataset_description,
            "all_columns": all_columns,
            "standard_columns": standard_columns,
            "filtered_columns": filtered_columns,
            **optional_fields
        }

        # Finally create dictionary
        return json.dumps(json_data, indent=4)

    @staticmethod
    def update_json_file(existing_json_data, dataset_name=None, standard_columns=None, filtered_columns=None,
                         values_columns=None, trigger_target_rows=None):
        # 1. Load the JSON data
        json_data = json.loads(existing_json_data)

        # 2. Update the values
        if dataset_name is not None:
            json_data["dataset_name"] = dataset_name
        if standard_columns is not None:
            json_data["standard_column"] = standard_columns
        if filtered_columns is not None:
            json_data["filtered_column"] = filtered_columns
        if values_columns is not None:
            json_data["values_column"] = values_columns
        if trigger_target_rows is not None:
            json_data["trigger_target_rows"] = trigger_target_rows

        # 3. Return the update json
        updated_json_string = json.dumps(json_data, indent=4)
        return updated_json_string

    @staticmethod
    def parse_json_content(json_content):
        try:
            # 1. Convert JSON in a dictionary
            json_data = json.loads(json_content)

            # 2. Extract
            dataset_name = json_data.get("dataset_name", "")
            all_columns = json_data.get("all_columns", [])
            standard_columns = json_data.get("standard_column", [])
            filtered_columns = json_data.get("filtered_column", [])
            values_columns = json_data.get("values_column", [])
            trigger_target_rows = json_data.get("trigger_target_rows", [])
            causality_graph_columns = json_data.get("causality", [])
            date_created = json_data.get("date_created", 0)
            date_modified = json_data.get("date_modified", 0)

            # 3. Return the content
            return {
                "dataset_name": dataset_name,
                "all_columns": all_columns,
                "standard_columns": standard_columns,
                "filtered_columns": filtered_columns,
                "values_columns": values_columns,
                "trigger_target_rows": trigger_target_rows,
                "causality": causality_graph_columns,
                "date_created": date_created,
                "date_modified": date_modified,
            }

        except json.JSONDecodeError as e:
            print(f"Error parsing JSON content: {e}")
            return None
