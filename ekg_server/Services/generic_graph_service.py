"""
------------------------------------------------------------------------
File : docker_service.py
Description: Service for Generic graph controller
Date creation: 20-07-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import math

from flask import jsonify
from collections.abc import *
from Utils.query_library import *
from Models.api_response_model import *
from Controllers.graph_config import datetime_to_json


# The Service for generic graph controller
class GenericGraphService:

    # Get complete graph (standard or class)
    @staticmethod
    def get_class_graph_s(database_connector, standard_graph, limit):
        apiResponse = ApiResponse(None, None, None)

        try:
            database_connector.connect()

            if standard_graph == "1":
                if not limit:
                    query_result = get_complete_standard_graph_query()
                else:
                    query_result = get_limit_standard_graph_query(limit)
            else:
                if not limit:
                    query_result = get_complete_class_graph_query()
                else:
                    query_result = get_limit_class_graph_query(limit)

            result = database_connector.run_query_memgraph(query_result)

            if not isinstance(result, Iterable) or len(result) == 0:
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

            graph_data = []

            for record in result:
                if "Timestamp" in record['source'].keys():
                    record['source']["Timestamp"] = datetime_to_json(record['source']["Timestamp"])

                source = record['source']

                source['id'] = record['source_id']
                edge = record['edge']
                edge['id'] = record['edge_id']

                if "Timestamp" in record['target'].keys():
                    record['target']["Timestamp"] = datetime_to_json(record['target']["Timestamp"])

                target = record['target']
                target['id'] = record['target_id']

                for key, value in source.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        source[key] = None

                for key, value in target.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        target[key] = None

                graph_data.append({
                    'node_source': source,
                    'edge': edge,
                    'node_target': target
                })

            if not graph_data:
                apiResponse.http_status_code = 404
                apiResponse.response_data = None
                apiResponse.message = "Not found"
                return jsonify(apiResponse.to_dict()), 404

            apiResponse.http_status_code = 200
            apiResponse.response_data = graph_data
            apiResponse.message = "Retrieve Graph."

            return jsonify(apiResponse.to_dict()), 200

        except Exception as e:
            apiResponse.http_status_code = 500
            apiResponse.response_data = None
            apiResponse.message = f'Internal Server Error : {str(e)}'
            return jsonify(apiResponse.to_dict()), 500

        finally:
            database_connector.close()
