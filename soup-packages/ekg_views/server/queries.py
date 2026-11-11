"""
------------------------------------------------------------------------
File : queries.py
Description: The queries of the "Interrogazioni" visualizer, contributed
             to the "ekg.queries" extension point (contribution key =
             `key`):
             - GraphQuery: key, label, group, the object kinds it applies
               to (`kinds`, kinds.py), fields (the form shown to
               the user), build(params) -> Query and transform(records,
               params) -> list of report blocks. values(raw) checks the
               params against `fields` (the core validates only the
               fields of operations and exporters) and clamps the LIMIT
               to `max_limit`;
             - three bases (C23). The label and the relationship type are
               fixed by the query itself (a closed list, never the user's)
               and go in the pattern through ident() - MATCH (n:`Event`),
               MATCH (a:`Event`)-[r:`DF`]->(b:`Event`) - so Memgraph reads
               only those nodes; every value is a parameter (the LIMIT is
               $limit):
               CountQuery (a "keyvalue" block; the count is always read
               from the column "count" - the legacy code aliased it
               node_count/entity_count/corr_count/df_count and then read
               ['count'] in delete_graph_s), NodeListQuery (a "table" of
               the nodes of one label, paged, with the total) and
               RelationshipListQuery (a "table" of the relationships of
               one type between two labels).
             Subclasses narrow the bases with `where` (a fixed Cypher
             condition on n or a, r, b) and `filter_params`.
Project : soup-packages/ekg_views
------------------------------------------------------------------------
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from soup.core.contracts import Field, ValidationError, report

from .database import Query, ident
from .kinds import DEFAULT_KINDS
from .values import as_choice, as_int, as_limit, as_text, clean

DEFAULT_ROWS = 100
MAX_ROWS = 1000

# The properties shown first in the tables (the EKG schema of the ekg package).
PREFERRED_COLUMNS = ("Event_Id", "Timestamp", "ActivityName", "Value", "Type")

Block = dict[str, Any]


def count_of(records: Sequence[Mapping[str, Any]], column: str = "count") -> int:
    """The count of a COUNT query: always the column `column` of the first row (0 if none)."""

    if not records:
        return 0
    value = records[0].get(column)
    return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def limit_fields(default: int = DEFAULT_ROWS) -> list[Field]:
    return [
        Field("limit", "Rows", type="number", default=default, help=f"Up to {MAX_ROWS}."),
        Field("offset", "Starting row", type="number", default=0),
    ]


def display(value: Any) -> Any:
    """A table cell: scalars as they are, lists and maps as JSON."""

    value = clean(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, default=str)
    return value


def node_text(props: Mapping[str, Any], params: Mapping[str, Any] | None = None) -> str:
    """How a node is named in a table: its activity, its value, its id."""

    params = params or {}
    for key in (str(params.get("activity_property", "ActivityName")),
                str(params.get("entity_id_property", "Value")),
                str(params.get("event_id_property", "Event_Id")), "name"):
        if props.get(key) not in (None, ""):
            return str(props[key])
    return json.dumps(clean(dict(props)), ensure_ascii=False, default=str)


def ordered_columns(keys: Iterable[str]) -> list[str]:
    found = set(keys)
    return [key for key in PREFERRED_COLUMNS if key in found] + sorted(found - set(PREFERRED_COLUMNS))


class GraphQuery(ABC):
    key: str = ""
    label: str = ""
    group: str = ""
    description: str = ""
    kinds: Sequence[str] = DEFAULT_KINDS
    fields: Sequence[Field] = ()
    max_limit: int = MAX_ROWS

    def values(self, raw: Mapping[str, Any] | None) -> dict[str, Any]:
        """`raw` checked against `fields`: numbers as integers, texts, choices; unknown keys dropped."""

        raw = raw or {}
        if not isinstance(raw, Mapping):
            raise ValidationError("'params' must be an object")
        values: dict[str, Any] = {}
        for spec in self.fields:
            value = raw.get(spec.name)
            if spec.name == "limit":
                values["limit"] = as_limit(value, int(spec.default or DEFAULT_ROWS), self.max_limit)
            elif spec.type == "number":
                values[spec.name] = as_int(value, spec.name, int(spec.default or 0), 0)
            elif spec.type == "select":
                values[spec.name] = as_choice(value, spec.name, spec.choice_values(), spec.default)
            elif spec.type == "bool":
                values[spec.name] = bool(spec.default) if value is None else value in (True, "true", "1", 1)
            else:
                values[spec.name] = as_text(value, spec.name, spec.default or "", required=spec.required)
        return values

    @abstractmethod
    def build(self, params: Mapping[str, Any]) -> Query:
        """`params` come from values()."""
        raise NotImplementedError

    @abstractmethod
    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        raise NotImplementedError

    def describe(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "group": self.group,
            "description": self.description,
            "fields": [spec.to_dict() for spec in self.fields],
        }


class CountQuery(GraphQuery):
    """The number of nodes with `node_label`, of relationships of `relationship`, or of all nodes."""

    node_label: str = ""
    relationship: str = ""

    def __init__(self, key: str = "", label: str = "", group: str = "Counts",
        node_label: str = "", relationship: str = ""):
        self.key = key or self.key
        self.label = label or self.label
        self.group = group
        self.node_label = node_label or self.node_label
        self.relationship = relationship or self.relationship

    def build(self, params: Mapping[str, Any]) -> Query:
        if self.relationship:
            return Query(f"MATCH ()-[r:{ident(self.relationship)}]->() RETURN count(r) AS count")
        if self.node_label:
            return Query(f"MATCH (n:{ident(self.node_label)}) RETURN count(n) AS count")
        return Query("MATCH (n) RETURN count(n) AS count")

    def count(self, records: Sequence[Mapping[str, Any]]) -> int:
        return count_of(records)

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        return [report.keyvalue({self.label: self.count(records)}, title=self.label)]


class NodeListQuery(GraphQuery):
    """The nodes with `node_label` (narrowed by `where`, a condition on n), paged, with the total."""

    node_label: str = ""
    where: str = ""

    def __init__(self, key: str = "", label: str = "", group: str = "Nodes", node_label: str = ""):
        self.key = key or self.key
        self.label = label or self.label
        self.group = group
        self.node_label = node_label or self.node_label
        if not self.fields:
            self.fields = tuple(limit_fields())

    def filter_params(self, params: Mapping[str, Any]) -> dict[str, Any]:
        return {}

    def build(self, params: Mapping[str, Any]) -> Query:
        match = f"MATCH (n:{ident(self.node_label)})" + (f" WHERE {self.where}" if self.where else "")
        # ORDER BY: the table pages with an offset.
        text = f"""
            {match}
            WITH count(n) AS total
            {match}
            RETURN total, id(n) AS id, properties(n) AS props
            ORDER BY id
            SKIP $offset
            LIMIT $limit"""
        return Query(text, {
            "offset": int(params.get("offset", 0)),
            "limit": int(params.get("limit", DEFAULT_ROWS)),
            **self.filter_params(params),
        })

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        props = [dict(record.get("props") or {}) for record in records]
        columns = ordered_columns(key for item in props for key in item)
        rows = [[record.get("id"), *(display(item.get(column)) for column in columns)]
            for record, item in zip(records, props, strict=False)]
        total = count_of(records, "total")
        return [report.table(["id", *columns], rows, total=total, title=self.label)]


class RelationshipListQuery(GraphQuery):
    """The relationships of type `relationship` from `source_label` to `target_label`, paged."""

    source_label: str = ""
    relationship: str = ""
    target_label: str = ""
    where: str = ""

    def __init__(self, key: str = "", label: str = "", group: str = "Relationships",  # noqa: PLR0913, PLR0917 - public API (soup_pkg_ekg_views.api)
                 source_label: str = "", relationship: str = "", target_label: str = ""):
        self.key = key or self.key
        self.label = label or self.label
        self.group = group
        self.source_label = source_label or self.source_label
        self.relationship = relationship or self.relationship
        self.target_label = target_label or self.target_label
        if not self.fields:
            self.fields = tuple(limit_fields())

    def filter_params(self, params: Mapping[str, Any]) -> dict[str, Any]:
        return {}

    def build(self, params: Mapping[str, Any]) -> Query:
        match = (f"MATCH (a:{ident(self.source_label)})-[r:{ident(self.relationship)}]->(b:{ident(self.target_label)})"
                 + (f" WHERE {self.where}" if self.where else ""))
        text = f"""
            {match}
            WITH count(r) AS total
            {match}
            RETURN total, id(r) AS id, properties(a) AS source, type(r) AS type,
                   properties(r) AS props, properties(b) AS target
            ORDER BY id
            SKIP $offset
            LIMIT $limit"""
        return Query(text, {
            "offset": int(params.get("offset", 0)),
            "limit": int(params.get("limit", DEFAULT_ROWS)),
            **self.filter_params(params),
        })

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        props = [dict(record.get("props") or {}) for record in records]
        columns = ordered_columns(key for item in props for key in item)
        rows = [
            [
                record.get("id"),
                node_text(record.get("source") or {}, params),
                record.get("type"),
                node_text(record.get("target") or {}, params),
                *(display(item.get(column)) for column in columns),
            ]
            for record, item in zip(records, props, strict=False)
        ]
        header = ["id", "sorgente", "tipo", "destinazione", *columns]
        return [report.table(header, rows, total=count_of(records, "total"), title=self.label)]
