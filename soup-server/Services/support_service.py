"""
------------------------------------------------------------------------
File : support_service.py
Description: Support service for generic logic
Date creation: 29-01-2025
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import math

from neo4j.time import DateTime
from Controllers.graph_config import memgraph_datetime_to_string


# The service for generic logic
class SupportService:

    @staticmethod
    def extract_graph_data(data):
        graph_data = []

        for record in data:
            # Node source
            source = record['source']
            source['id'] = record['source_id']

            # Relationship
            edge = record['edge']
            edge['id'] = record['edge_id']

            # Node target
            target = record['target']
            target['id'] = record['target_id']

            # Correct the info
            for key, value in source.items():
                if isinstance(value, (int, float)) and math.isnan(value):
                    source[key] = None
                elif isinstance(value, DateTime):
                    source[key] = memgraph_datetime_to_string(value)

            for key, value in target.items():
                if isinstance(value, (int, float)) and math.isnan(value):
                    target[key] = None
                elif isinstance(value, DateTime):
                    target[key] = memgraph_datetime_to_string(value)

            graph_data.append({
                'node_source': source,
                'edge': edge,
                'node_target': target
            })

        return graph_data

    @staticmethod
    def extract_class_graph_data(data):
        graph_data = []

        for record in data:
            event_node = record['node']

            for key, value in event_node.items():
                if 'Timestamp' in key:
                    timestamp = memgraph_datetime_to_string(value)
                    event_node[key] = timestamp

            for key, value in event_node.items():
                if isinstance(value, (int, float)) and math.isnan(value):
                    event_node[key] = None

            graph_data.append(event_node)

        return graph_data
