"""
------------------------------------------------------------------------
File : memgraph_connector_model.py
Description: Memgraph connector model class
Date creation: 06-02-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from neo4j import GraphDatabase


# Memgraph Connector model class
class MemgraphConnector:
    # Init model
    def __init__(self, uri, auth):
        self._uri = uri
        self._auth = auth
        self._driver = None

    # Connect function
    def connect(self):
        self._driver = GraphDatabase.driver(self._uri, auth=self._auth)

    # Run specific query with parameters in Memgraph
    def run_query_memgraph(self, query: object, parameters: dict = None) -> object:
        """
        Run memgraph query
        :param query: the query
        :param parameters: the parameters
        :return: data result
        """
        if self._driver is None:
            raise Exception("Error while connecting to the database.")

        with self._driver.session() as session:
            # Execute the query
            result = session.run(query, parameters, database="memgraph", metrics=True)
            return [record.data() for record in result]

    # Close connect function
    def close(self):
        if self._driver is not None:
            self._driver.close()
