"""
-------------------------------
File : class_graph_service.py
Description: Service for class graph
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
-------------------------------
"""

# Import
from flask import jsonify
from datetime import datetime
from Services.AggregateGraph.op_class_graph_service import OperationClassGraphService
from Models.dataset_process_info_model import DatasetProcessInformation
from Models.api_response_model import ApiResponse
from Models.logger_model import Logger
from Utils.graph_query_lib import *
from Utils.aggregate_graph_query_lib import *

# Engine logger setup
logger = Logger()


# The Service for class graph
class ClassGraphService:

    # Create Class Graph function
    @staticmethod
    def create_class_graph_s(filtered_columns, database_connector):
        response = ApiResponse()

        try:
            database_connector.connect()

            # 1. Create the graph
            result, process_info_updated = ClassGraphService.class_process_query(database_connector, filtered_columns)

            if result != 'success' or process_info_updated is None:
                response.http_status_code = 400
                response.message = f'Error while importing data to Memgraph: {str(result)}.'
                response.response_data = None

                logger.error(f'Error while importing data to Memgraph: {str(result)}')
                return jsonify(response.to_dict()), 400

            class_nodes_count = OperationClassGraphService.get_count_class_nodes_s(database_connector)
            obs_rel_count = OperationClassGraphService.get_count_obs_relationships_s(database_connector)
            df_c_rel_count = OperationClassGraphService.get_count_dfc_relationships_s(database_connector)

            data = {
                'class_nodes': class_nodes_count,
                'obs_rel_count': obs_rel_count,
                'df_c_rel_count': df_c_rel_count,
                'process_info': process_info_updated
            }

            response.http_status_code = 201
            response.message = 'Class Graph created successfully.'
            response.response_data = data

            logger.info("Class Graph created successfully")
            return jsonify(response.to_dict()), 201

        except Exception as e:
            response.http_status_code = 500
            response.message = f'Error while importing data to Memgraph: {str(e)}.'
            response.response_data = None

            logger.error(f'Error while importing data to Memgraph: {str(e)}')
            return jsonify(response.to_dict()), 500

        finally:
            database_connector.close()

    @staticmethod
    def class_process_query(database_connector, filtered_columns):
        process_info = DatasetProcessInformation()

        try:
            process_info.init_class_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
            print("Current Init Time =", process_info.init_class_time)

            # 1. Check NaN entities with NaN values
            cypher_query = get_nan_entities()
            res = database_connector.run_query_memgraph(cypher_query)

            # 2. Cast value from Float to String
            process_info.init_class_node_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
            for element in res:
                entity = element['prop']
                cypher_query = change_nan(entity)
                database_connector.run_query_memgraph(cypher_query)

            # 3. Create the :OBS relationships
            process_info.init_obs_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
            cypher_query = create_class_multi_query(filtered_columns)
            database_connector.run_query_memgraph(cypher_query)

            cypher_query = set_class_weight()
            database_connector.run_query_memgraph(cypher_query)
            process_info.finish_class_node_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
            process_info.finish_obs_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

            # Create the :DF_C relationships
            process_info.init_dfc_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]
            df_query = class_df_aggregation(rel_type='DF', class_rel_type='DF_C')
            database_connector.run_query_memgraph(df_query)
            process_info.finish_dfc_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

            process_info.finish_class_time = datetime.now().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3]

            return 'success', process_info.to_dict()

        except Exception as e:

            logger.error('Error while importing data to Memgraph: {}'.format(str(e)))
            return f'Error: {e}'
