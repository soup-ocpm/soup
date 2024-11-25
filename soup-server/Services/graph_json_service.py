"""
------------------------------------------------------------------------
File : graph_json_service.py
Description: Service for graph json controller
Date creation: 27-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import math

from collections.abc import Iterable
from flask import jsonify
from Models.api_response_model import ApiResponse
from Utils.query_library import *


# The Service for graph json controller
class GraphJSONService:
    @staticmethod
    def get_class_graph_nodes_json(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_nodes_class_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"
                return jsonify(response.to_dict()), 404

            graph_data = []

            for record in result:
                event_node = record['node']

                for key, value in event_node.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        event_node[key] = None

                graph_data.append(event_node)

            if len(graph_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = graph_data

                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.message = 'Event nodes retrieve successfully'
            response.response_data = graph_data

            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def get_class_graph_obs_links_json():
        # Todo implement
        return None

    @staticmethod
    def get_class_graph_df_links_json(database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            query = get_df_class_relation_simple_query()
            result = database_connector.run_query_memgraph(query)

            if not isinstance(result, Iterable):
                response.http_status_code = 404
                response.response_data = None
                response.message = "Not found"
                return jsonify(response.to_dict()), 404

            df_data = []
            df_count = 0

            for record in result:
                relation = record['df_c']
                event = relation[0]
                relation_type = relation[1]
                related_event = relation[2]

                for key, value in event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        event[key] = None

                for key, value in related_event.items():
                    if isinstance(value, (int, float)) and math.isnan(value):
                        related_event[key] = None

                df_count = df_count + 1
                relation_id = df_count

                df_data.append({
                    'event': event,
                    'relation_type': relation_type,
                    'related_event': related_event,
                    'relation_id': relation_id
                })

            graph_data = {
                'df_data': df_data,
                'df_count': df_count,
            }

            if len(graph_data) == 0:
                response.http_status_code = 202
                response.message = 'No content'
                response.response_data = graph_data

                return jsonify(response.to_dict()), 202

            response.http_status_code = 200
            response.response_data = graph_data
            response.message = 'Retrieve :DF_C relationships'

            return jsonify(response.to_dict()), 200

        except Exception as e:
            response.http_status_code = 500
            response.response_data = None
            response.message = f'Internal Server Error : {str(e)}'
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()
