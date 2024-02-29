"""
-------------------------------
File : api_response_model.py
Description: Api Response model class
Date creation: 06-02-2024
Project : ekg_server
Author: DiscoHub12 (Alessio Giacché)
License : MIT
-------------------------------
"""
import json


# Api Response model class
class ApiResponse:
    def __init__(self, http_status_code, response_data, message):
        self.http_status_code = http_status_code
        self.response_data = response_data
        self.message = message

    def to_dict(self):
        return {
            "http_status_code": self.http_status_code,
            "response_data": self.response_data,
            "message": self.message
        }
