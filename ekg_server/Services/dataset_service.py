"""
-------------------------------
File : class_graph_service.py
Description: Service for class graph
Date creation: 07-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
-------------------------------
"""

# Import
from Services.Graph.op_graph_service import *
from Models.api_response_model import ApiResponse
from neo4j.time import DateTime


# The Service for class graph
class DatasetService:

    @staticmethod
    def get_dataset_s(database_connector, dataset_name):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = get_dataset_query(dataset_name)
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

            dataset = None

            for record in result:
                dataset_node = record['n']

                for key, value in dataset_node.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        dataset_node[key] = None
                    elif isinstance(value, DateTime):
                        dataset_node[key] = memgraph_datetime_to_string(value)

                dataset = dataset_node

            apiResponse.http_status_code = 200
            apiResponse.message = 'Dataset retrieved successfully'
            apiResponse.response_data = dataset
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def get_all_dataset_s(database_connector):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = get_datasets_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

            graph_data = []

            for record in result:
                dataset_node = record['n']

                for key, value in dataset_node.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        dataset_node[key] = None
                    elif isinstance(value, DateTime):
                        dataset_node[key] = memgraph_datetime_to_string(value)

                graph_data.append(dataset_node)

            if len(graph_data) == 0:
                apiResponse.http_status_code = 202
                apiResponse.message = 'No content'
                apiResponse.response_data = graph_data
                return jsonify(apiResponse.to_dict()), 202

            graph_data = sorted(graph_data, key=lambda x: x['DateCreated'])

            apiResponse.http_status_code = 200
            apiResponse.message = 'Dataset nodes retrieved successfully'
            apiResponse.response_data = graph_data
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def update_dataset_s(database_connector, dataset_name, dataset_description):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = update_dataset_description_query(dataset_name, dataset_description)
            response = database_connector.run_query_memgraph(query)

            apiResponse.http_status_code = 200
            apiResponse.message = 'Dataset update successfully'
            apiResponse.response_data = response
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def delete_dataset_s(database_connector, dataset_name):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            # Delete entity nodes
            query = delete_entity_graph_query(dataset_name)
            database_connector.run_query_memgraph(query)

            # Drop entity index
            database_connector.run_query_memgraph(drop_entity_index())

            # Delete event nodes
            query = delete_event_graph_query(dataset_name)
            database_connector.run_query_memgraph(query)

            query = delete_class_graph_query(dataset_name)
            database_connector.run_query_memgraph(query)

            query = drop_dataset_node_query(dataset_name)
            database_connector.run_query_memgraph(query)

            apiResponse.http_status_code = 200
            apiResponse.message = 'Dataset deleted successfully'
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def check_unique_dataset_name_s(database_connector, dataset_name):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            query = check_unique_dataset_name_query(dataset_name)
            result = database_connector.run_query_memgraph(query)

            if result and result[0]['count'] == 0:
                apiResponse.http_status_code = 202
                apiResponse.message = 'No content'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 202
            else:
                apiResponse.http_status_code = 404
                apiResponse.message = 'Dataset with this name already exist'
                apiResponse.response_data = None
                return jsonify(apiResponse.to_dict()), 404

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.message = f"Internal Server Error : {str(e)}"
            apiResponse.response_data = None
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()
