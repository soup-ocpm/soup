"""
------------------------------------------------------------------------
File : filters_service.py
Description: Service for Filters controller
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


# The service for docker controller
class FiltersService:

    @staticmethod
    def apply_timestamp_filters():
        response = ApiResponse()

        try:
            response = None
        except Exception as e:
            response.response_data = None
            response.http_status_code = 500
            response.message = f'{e}'
