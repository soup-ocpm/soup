"""
------------------------------------------------------------------------
File : json_parts.py
Description: The parts of the "JSON del grafo" export, contributed to the
             "ekg.json_parts" extension point (contribution key = `key`):
             JsonPart has key, label (the key of the part in the exported
             JSON and the label of its choice), the object kinds it applies
             to (`kinds`, kinds.py), query() -> Query and
             transform(records) -> the data of the part. ekg_views
             contributes the four parts of the old downloadJsonSelected
             (pages/graph-dataset), in the format of the /api/v2/json/graph/*
             endpoints (Services/Graph/op_graph_service.py):
             - "Event nodes", "Entity nodes": the list of the properties of
               the nodes (Timestamp as text, NaN as null);
             - "CORR relationships": {corr_data: [{event, relation_type,
               related_event, relation_id}], corr_count};
             - "DF relationships": {df_data: [...], df_count};
             and "REL relationships", the object-object relationships
             (Entity-[:REL]->Entity, from an OCEL log): {rel_data: [{source,
             relation_type, qualifier, target, relation_id}], rel_count},
             empty for a graph without them.
             Every part reads a labelled pattern - MATCH (n:`Event`),
             MATCH (a:`Event`)-[r:`DF`]->(b:`Event`) - with its own labels
             and type, through ident(). Other packages add their own parts (e.g. the class graph) and
             each one is exported under its own key - the old page put the
             :CORR under "CORR relationships" also for "OBS relationships"
             and "DF_C relationships".
Project : soup-packages/ekg_views
------------------------------------------------------------------------
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Mapping, Sequence
from typing import Any

from .database import Query, ident
from .kinds import DEFAULT_KINDS, STANDARD_KINDS
from .values import clean
from .views import CORR, DF, ENTITY, EVENT, REL


class JsonPart(ABC):
    key: str = ""
    label: str = ""
    kinds: Sequence[str] = DEFAULT_KINDS

    @abstractmethod
    def query(self) -> Query:
        raise NotImplementedError

    @abstractmethod
    def transform(self, records: Sequence[Mapping[str, Any]]) -> Any:
        raise NotImplementedError


class NodesPart(JsonPart):
    """The properties of every node with `node_label` (get_event_nodes_s, get_entity_nodes_s)."""

    def __init__(self, key: str, label: str, node_label: str, kinds: Sequence[str] = DEFAULT_KINDS):
        self.key = key
        self.label = label
        self.node_label = node_label
        self.kinds = tuple(kinds)

    def query(self) -> Query:
        return Query(f"MATCH (n:{ident(self.node_label)}) RETURN properties(n) AS node")

    def transform(self, records: Sequence[Mapping[str, Any]]) -> Any:
        return [clean(dict(record.get("node") or {})) for record in records]


class RelationshipsPart(JsonPart):
    """
    The relationships of one type (get_corr_relationships_s,
    get_df_relationships_s): {<prefix>_data, <prefix>_count}, relation_id
    numbered from 1.
    """

    def __init__(self, key: str, label: str, source_label: str, relationship: str, target_label: str, prefix: str,  # noqa: PLR0913, PLR0917 - public API (soup_pkg_ekg_views.api)
                 kinds: Sequence[str] = DEFAULT_KINDS):
        self.key = key
        self.kinds = tuple(kinds)
        self.label = label
        self.source_label = source_label
        self.relationship = relationship
        self.target_label = target_label
        self.prefix = prefix

    def query(self) -> Query:
        return Query(f"""
            MATCH (a:{ident(self.source_label)})-[r:{ident(self.relationship)}]->(b:{ident(self.target_label)})
            RETURN properties(a) AS event, type(r) AS relation_type, properties(b) AS related_event""")

    def transform(self, records: Sequence[Mapping[str, Any]]) -> Any:
        data = [
            {
                "event": clean(dict(record.get("event") or {})),
                "relation_type": record.get("relation_type"),
                "related_event": clean(dict(record.get("related_event") or {})),
                "relation_id": index,
            }
            for index, record in enumerate(records, start=1)
        ]
        return {f"{self.prefix}_data": data, f"{self.prefix}_count": len(data)}


class RelPart(JsonPart):
    """The :REL relationships between entities with their qualifier: {rel_data, rel_count}, relation_id from 1."""

    key = "rel"
    label = "REL relationships"
    kinds = STANDARD_KINDS

    def query(self) -> Query:
        return Query(f"""
            MATCH (a:{ident(ENTITY)})-[r:{ident(REL)}]->(b:{ident(ENTITY)})
            RETURN properties(a) AS source, properties(r) AS relation, properties(b) AS target""")

    def transform(self, records: Sequence[Mapping[str, Any]]) -> Any:
        data = [
            {
                "source": clean(dict(record.get("source") or {})),
                "relation_type": REL,
                "qualifier": (record.get("relation") or {}).get("qualifier"),
                "target": clean(dict(record.get("target") or {})),
                "relation_id": index,
            }
            for index, record in enumerate(records, start=1)
        ]
        return {"rel_data": data, "rel_count": len(data)}


def builtin_parts() -> list[JsonPart]:
    return [
        NodesPart("event_nodes", "Event nodes", EVENT, STANDARD_KINDS),
        NodesPart("entity_nodes", "Entity nodes", ENTITY, STANDARD_KINDS),
        RelationshipsPart("corr", "CORR relationships", EVENT, CORR, ENTITY, "corr", STANDARD_KINDS),
        RelationshipsPart("df", "DF relationships", EVENT, DF, EVENT, "df", STANDARD_KINDS),
        RelPart(),
    ]
