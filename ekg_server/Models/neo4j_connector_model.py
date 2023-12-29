"""
-------------------------------
File : neo4j_connector_model.py
Description: Neo4j connector class.
Date creation: 10/10/2023
Project : pserveraura
Author: DiscoHub12 - veronikamoriconi
License : MIT
-------------------------------
"""

# Import
from neo4j import GraphDatabase


# Neo4j Connector model class
class Neo4jConnector:
    def __init__(self, uri, user, password, database_name):
        self._uri = uri
        self._user = user
        self._password = password
        self._database = database_name
        self._driver = None

    # Connect function
    def connect(self):
        self._driver = GraphDatabase.driver(self._uri, auth=(self._user, self._password), database=self._database)

    # Close connect function
    def close(self):
        if self._driver is not None:
            self._driver.close()

    # Run specific query with parameters
    def run_query(self, query: object, parameters: object = None) -> object:
        if self._driver is None:
            raise Exception(
                "Error while connect to database.")

        with self._driver.session() as session:
            result = session.run(query, parameters)
            return [record.data() for record in result]
