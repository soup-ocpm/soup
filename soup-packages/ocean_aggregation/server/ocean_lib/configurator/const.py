from enum import Enum


class Constants(str,Enum):
    # Node aggregation types
    EVENTS = "EVENTS"
    ENTITIES = "ENTITIES"
    
    # Entities type storage
    LABEL = "label"
    PROPERTY = "property"
    
    # Node labels
    EVENT_NODE = "Event"
    ENTITY_NODE = "Entity"
    
    def __str__(self):
        return self.value