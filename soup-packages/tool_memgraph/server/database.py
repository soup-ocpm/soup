"""Legacy Query adapter over the host's shared Memgraph Cypher connection."""

from __future__ import annotations

from typing import Any

from soup.core.contracts.database import Database
from soup.core.database import CypherDatabase, DatabaseConfig

from .port import GraphDatabase as GraphDatabasePort
from .query import Query


class MemgraphDatabase(GraphDatabasePort):
    def __init__(
        self, uri: str | None = None, auth: tuple[str, str] = ("", ""), *, database: Database | None = None,
    ):
        if database is None:
            if uri is None:
                raise ValueError("A Memgraph URI or shared database connection is required")
            database = CypherDatabase(DatabaseConfig("memgraph", uri, *auth))
        # Explicit unbound access is for the native tool's graph loader/lifecycle.
        # Package graph queries still use for_dataset() and its shared resolver.
        self._db = database.for_backend("memgraph").for_database("memgraph")

    def run(self, query: Query) -> list[dict[str, Any]]:
        # Retain the legacy adapter's extra query parameters, not driver options.
        return self._db.execute(query.text, {**query.params, "database": "memgraph", "metrics": True})

    def close(self) -> None:
        self._db.close()
