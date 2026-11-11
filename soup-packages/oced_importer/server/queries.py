"""Original ocean-lib loading generators (034006b621d4187f8d39b86ae02acde70f4d41c8).

Only configuration binding and type annotations are SOUP-specific. Cypher bodies
and expressions are unchanged; HTTP source adaptation belongs in loader.py.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

_configuration: ContextVar[tuple[Any, Any]] = ContextVar("oced_configuration")


@contextmanager
def configuration(log: Any, ekg: Any) -> Iterator[None]:
    token = _configuration.set((log, ekg))
    try:
        yield
    finally:
        _configuration.reset(token)


def LOG() -> Any:
    return _configuration.get()[0]


def EKG() -> Any:
    return _configuration.get()[1]


def get_indexes_q() -> str:
    return "SHOW INDEXES"


def drop_index_q(index_name: str) -> str:
    return f"DROP INDEX {index_name}"


def create_index_q(node_type: str, index_name: str) -> str:
    return f"CREATE INDEX FOR (n:{node_type}) ON (n.{index_name})"


def infer_corr_q(entity: str) -> str:
    return f"""
        MATCH (e:Event)
        WHERE e.{entity} IS NOT NULL AND e.{entity} <> "null"
        WITH split(e.{entity}, ',') AS items, e
        UNWIND items AS entity_id
        WITH entity_id, e
        MATCH (t:Entity {{{LOG().entity_id}: entity_id}})
        MERGE (e)-[:CORR {{{EKG().type_tag}: '{entity}'}}]->(t)
    """


def infer_df_q(entity: str) -> str:
    return f"""
        MATCH (n:Entity {{{EKG().type_tag}: '{entity}'}})<-[:CORR]-(e)
        WITH n, e AS nodes ORDER BY e.eventDatetime, ID(e)
        WITH n, collect(nodes) AS event_node_list
        UNWIND range(0, size(event_node_list)-2) AS i
        WITH n, event_node_list[i] AS e1, event_node_list[i+1] AS e2
        MERGE (e1)-[df:DF {{Type:n.{EKG().type_tag}, ID:n.{LOG().entity_id}, edge_weight: 1}}]->(e2)
        """


def load_log_q(node_type: str, path: str, log_name: str, header_data: list[str], type: str | None = None) -> str:
    data_list = ""
    log_node_type = "events" if node_type == "Event" else "entities"
    if log_node_type != "entities":
        attr_types = LOG().__getattribute__(log_node_type).__getattribute__("attr_types")
    else:
        attr_types = LOG().__getattribute__(log_node_type)[type].__getattribute__("attr_types")
    data: Any  # upstream reuses this local for a string and a list
    for data in header_data:
        attr_type = attr_types.get(data, "String")  # default to string if type unknown

        if attr_type == "Datetime":
            data_list += f", {data}: datetime(line.{data})"
        elif attr_type == "Integer":
            data_list += f", {data}: toInteger(line.{data})"
        elif attr_type == "Float":
            data_list += f", {data}: toFloat(line.{data})"
        elif attr_type == "Boolean":
            data_list += f", {data}: toBoolean(line.{data})"
        else:
            data_list += f", {data}: line.{data}"

    if type:
        data_list += f', {EKG().type_tag}: "{type}"'

    load_query = (
        f'LOAD CSV WITH HEADERS FROM "file:///{path}" as line CREATE (e:{node_type} {{Log: "{log_name}" {data_list} }})'
    )

    data = data_list.split(", ")
    data.pop(0)  # the first occurrence is empty
    data_dict = {}
    for el in data:
        res = el.split(": ")
        data_dict[res[0]] = res[1]

    return load_query
