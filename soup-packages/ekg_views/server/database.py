"""Read-only query boundary for the existing EKG views."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from soup.core.contracts import ObjectRef
from soup.core.contracts.database import Database

from .values import clean

__all__ = ["Neo4jQueries", "Query", "ident"]

if TYPE_CHECKING:
    from soup_pkg_ekg.api import Query
else:
    @dataclass(frozen=True)
    class Query:
        text: str
        params: Mapping[str, Any] = field(default_factory=dict)

        def __post_init__(self) -> None:
            if not isinstance(self.text, str) or not self.text.strip():
                raise ValueError("Query.text must be a non-empty string")
            if not isinstance(self.params, Mapping):
                raise ValueError("Query.params must be a mapping")
            object.__setattr__(self, "params", dict(self.params))


def ident(name: str) -> str:
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        raise ValueError(f"Invalid Cypher identifier: {name!r}")
    return f"`{name}`"


class Neo4jQueries:
    def __init__(self, database: Database, obj: ObjectRef):
        self.database = database
        config = obj.meta.get("log_config", {})
        self.activity = str(config.get("event_activity", "eventName"))
        self.timestamp = str(config.get("event_timestamp", "eventDatetime"))
        self.entity_id = str(config.get("entity_id", "wyId"))
        self.event_id = str(config.get("event_id", "id"))
        for name in (self.activity, self.timestamp, self.entity_id, self.event_id):
            ident(name)

    def run(self, query: Query) -> list[dict[str, Any]]:
        # Only the view's legacy property references change, never the imported graph.
        text = re.sub(r"\.ActivityName\b", "." + ident(self.activity), query.text)
        text = re.sub(r"\.Timestamp\b", "." + ident(self.timestamp), text)
        if "n.Timestamp.year" in query.text and "AS min_timestamp" in query.text:
            text = (
                f"MATCH (n:Event) RETURN min(n.{ident(self.timestamp)}) AS min_timestamp, "
                f"max(n.{ident(self.timestamp)}) AS max_timestamp"
            )
        return [clean(row, neo4j=True) for row in self.database.execute(text, query.params)]
