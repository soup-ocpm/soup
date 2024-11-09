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


# Dataset process information model class
class DatasetProcessInformation:

    # Init Object
    def __init__(self):
        self.dataset_name = None
        self.dataset_description = None
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
        }
