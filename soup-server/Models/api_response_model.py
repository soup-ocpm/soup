"""
------------------------------------------------------------------------
File : api_response_model.py
Description: Api Response model class
Date creation: 06-02-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""


# Api Response model class
class ApiResponse:
    def __init__(self):
        self.http_status_code = None
        self.response_data = None
        self.message = None

    def to_dict(self):
        return {
            "http_status_code": self.http_status_code,
            "response_data": self.response_data,
            "message": self.message
        }
