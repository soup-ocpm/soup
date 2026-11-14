import os
import yaml
from dataclasses import dataclass
from typing import Dict, List, Optional,Literal
from .const import Constants as cn

@dataclass
class NodeConfig:
    path: str
    attr: List[str]
    attr_types: Dict[str, str]
    type: Optional[str] = None

@dataclass
class LogReferences:
    event_id: str
    event_activity: str
    event_timestamp: str
    entity_id: str
    events: Optional[NodeConfig] = None
    entities: Optional[Dict[str, NodeConfig]] = None

    
@dataclass
class Neo4jConfig:
    URI: str
    username: str
    password: str

@dataclass
class EKGReferences:
    type_tag: str
    entity_type_mode : Literal[cn.LABEL, cn.PROPERTY] | None
    neo4j: Neo4jConfig
    
    def __post_init__(self):
        if self.entity_type_mode not in (cn.LABEL, cn.PROPERTY, None):
            raise ValueError(
                f"Invalid entity_type_mode: {self.entity_type_mode!r}. Must be 'label', 'property', or None."
            )
    
# Load YAML files
LOG_REFERENCES = None
EKG_REFERENCES = None

def load_configs(base_path: Optional[str] = None):
    global LOG_REFERENCES, EKG_REFERENCES

    if base_path is None:
        base_path = os.path.dirname(os.path.abspath(__file__))

    with open(os.path.join(base_path, 'log_config.yaml'), 'r') as file:
        log_data = yaml.safe_load(file)

    with open(os.path.join(base_path, 'ekg_config.yaml'), 'r') as file:
        ekg_data = yaml.safe_load(file)

    if 'events' in log_data and log_data['events'] is not None:
        log_data['events'] = NodeConfig(**log_data['events'])
    if 'entities' in log_data and log_data['entities'] is not None:
        log_data['entities'] = {
            k: NodeConfig(**v) for k, v in log_data['entities'].items()
        }

    ekg_data['neo4j'] = Neo4jConfig(**ekg_data['neo4j'])

    LOG_REFERENCES = LogReferences(**log_data)
    EKG_REFERENCES = EKGReferences(**ekg_data)
    

# Getters
def get_log_config() -> LogReferences:
    if LOG_REFERENCES is None:
        raise RuntimeError("LOG_REFERENCES not loaded. Call load_configs() first.")
    return LOG_REFERENCES

def get_ekg_config() -> EKGReferences:
    if EKG_REFERENCES is None:
        raise RuntimeError("EKG_REFERENCES not loaded. Call load_configs() first.")
    return EKG_REFERENCES