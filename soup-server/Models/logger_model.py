"""
------------------------------------------------------------------------
File : logger_model.py
Description: Logger model class
Date creation: 29-01-2025
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
import sys
import logging
import datetime


# The Logger model class
class Logger:
    # Singleton instance
    _instance = None

    # Initialize a new instance of Logger
    def __new__(cls, log_level="INFO"):
        """
        Create new instance if not exists
        :param log_level: the log level
        """
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_logger(log_level)
        return cls._instance

    # Init the logger
    def _init_logger(self, log_level):
        """
        Initialize the instance
        :param log_level: the log level
        """
        self.log_level = log_level
        self.log_levels = ["ERROR", "WARNING", "INFO", "DEBUG"]

        # Configure the logging
        self.logger = logging.getLogger()
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', "%Y-%m-%d %H:%M:%S")
        handler.setFormatter(formatter)
        self.logger.addHandler(handler)

        # Set the log level
        self.logger.setLevel(log_level)

    def _print_log(self, level, message):
        """
        Print new log
        :param level: the level of the log
        :param message: the message
        """

        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_message = f"[{timestamp}] [{level}] {message}"

        if level == "DEBUG":
            self.logger.debug(log_message)
        elif level == "INFO":
            self.logger.info(log_message)
        elif level == "WARNING":
            self.logger.warning(log_message)
        elif level == "ERROR":
            self.logger.error(log_message)

    def debug(self, message):
        """
        Log a debug message
        :param message: the message
        """

        self._print_log("DEBUG", message)

    def info(self, message):
        """
        Log an info message
        :param message: the message
        """

        self._print_log("INFO", message)

    def warning(self, message):
        """
        Log a warning message
        :param message: the message
        """

        self._print_log("WARNING", message)

    def error(self, message):
        """
        Log an error message
        :param message: the message
        """

        self._print_log("ERROR", message)
