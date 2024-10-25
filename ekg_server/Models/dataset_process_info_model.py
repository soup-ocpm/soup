"""
------------------------------------------------------------------------
File : dataset_process_info_model.py
Description: Dataset information data model
Date creation: 17-10-2024
Project : soup_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

# Import
from datetime import datetime


# Dataset process information model class
class DatasetProcessInformation:

    # Init Object
    def __init__(self):
        self.init_time = None
        self.finish_time = None
        self.init_class_time = None
        self.finish_class_time = None
        self.init_event_time = None
        self.finish_event_time = None
        self.init_entity_time = None
        self.finish_entity_time = None
        self.init_corr_time = None
        self.finish_corr_time = None
        self.init_df_time = None
        self.finish_df_time = None
        self.init_class_node_time = None
        self.finish_class_node_time = None
        self.init_obs_time = None
        self.finish_obs_time = None
        self.init_dfc_time = None
        self.finish_dfc_time = None

    # To dict
    def to_dict(self):
        return {
            "init_time": self.init_time,
            "finish_time": self.finish_time,
            "init_class_time": self.init_class_time,
            "finish_class_time": self.finish_class_time,
            "init_event_time": self.init_event_time,
            "finish_event_time": self.finish_event_time,
            "init_entity_time": self.init_entity_time,
            "finish_entity_time": self.finish_entity_time,
            "init_corr_time": self.init_corr_time,
            "finish_corr_time": self.finish_corr_time,
            "init_df_time": self.init_df_time,
            "finish_df_time": self.finish_df_time,
            "init_class_node_time": self.init_class_node_time,
            "finish_class_node_time": self.finish_class_node_time,
            "init_obs_time": self.init_obs_time,
            "finish_obs_time": self.finish_obs_time,
            "init_dfc_time": self.init_dfc_time,
            "finish_dfc_time": self.finish_dfc_time,
            # Calculated fields if you have corresponding methods
            "event_time_seconds": self.event_time_seconds(),
            "entity_time_seconds": self.entity_time_seconds(),
            "corr_time_seconds": self.corr_time_seconds(),
            "df_time_seconds": self.df_time_seconds(),
            "class_time_seconds": self.class_time_seconds(),
            "dfc_time_seconds": self.dfc_time_seconds(),
            "obs_time_seconds": self.obs_time_seconds()
        }

    # Add placeholder methods for calculating time differences, replace with actual logic
    def event_time_seconds(self):
        if self.init_event_time and self.finish_event_time:
            return (self.finish_event_time - self.init_event_time).total_seconds()
        return None

    def entity_time_seconds(self):
        if self.init_entity_time and self.finish_entity_time:
            return (self.finish_entity_time - self.init_entity_time).total_seconds()
        return None

    def corr_time_seconds(self):
        if self.init_corr_time and self.finish_corr_time:
            return (self.finish_corr_time - self.init_corr_time).total_seconds()
        return None

    def df_time_seconds(self):
        if self.init_df_time and self.finish_df_time:
            return (self.finish_df_time - self.init_df_time).total_seconds()
        return None

    def class_time_seconds(self):
        if self.init_class_time and self.finish_class_time:
            return (self.finish_class_time - self.init_class_time).total_seconds()
        return None

    def dfc_time_seconds(self):
        if self.init_dfc_time and self.finish_dfc_time:
            return (self.finish_dfc_time - self.init_dfc_time).total_seconds()
        return None

    def obs_time_seconds(self):
        if self.init_obs_time and self.finish_obs_time:
            return (self.finish_obs_time - self.init_obs_time).total_seconds()
        return None

    @staticmethod
    def calculate_duration_in_seconds(start_time_str, end_time_str):
        start_time = datetime.strptime(start_time_str, '%Y-%m-%dT%H:%M:%S.%f')
        end_time = datetime.strptime(end_time_str, '%Y-%m-%dT%H:%M:%S.%f')

        duration = (end_time - start_time).total_seconds()

        if duration < 1:
            milliseconds = (end_time - start_time).microseconds / 1000
            return round(milliseconds / 1000, 3)

        return round(duration, 3)
