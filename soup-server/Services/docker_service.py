"""
------------------------------------------------------------------------
File : docker_service.py
Description: Support service for Docker container
Date creation: 07-07-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import docker
import subprocess

from flask import jsonify
from Models.api_response_model import ApiResponse
from Models.logger_model import Logger

# Engine logger setup
logger = Logger()


# Support service for Docker container
class DockerService:

    @staticmethod
    def get_container_id_s(container_name="soup-database"):
        """
        Get the docker container id from name
        """

        try:
            client = docker.from_env()
            container = client.containers.get(container_name)
            container_id = container.id
            return container_id
        except subprocess.CalledProcessError as e:
            logger.error(f'Error while retrieving docker container id: {e}')
            return None
