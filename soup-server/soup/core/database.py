"""Lazy Bolt connection for new packages; no startup queries or schema changes."""

from __future__ import annotations

import threading
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from neo4j import Driver, GraphDatabase

from soup.core.contracts.database import CypherExecutor


@dataclass(frozen=True)
class DatabaseConfig:
    backend: str = "memgraph"
    uri: str = "bolt://memgraph:7687"
    username: str = ""
    password: str = field(default="", repr=False)
    database: str | None = None

    def __post_init__(self) -> None:
        if self.backend not in {"memgraph", "neo4j"}:
            raise ValueError("SOUP_DATABASE must be memgraph or neo4j")
        if not self.uri.strip():
            raise ValueError("Database URI must not be empty")

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> DatabaseConfig:
        backend = env.get("SOUP_DATABASE", "memgraph")
        if backend == "neo4j":
            if not env.get("NEO4J_URI"):
                raise ValueError("NEO4J_URI is required for SOUP_DATABASE=neo4j")
            return cls(
                backend,
                env["NEO4J_URI"],
                env.get("NEO4J_USERNAME", "neo4j"),
                env.get("NEO4J_PASSWORD", ""),
                env.get("NEO4J_DATABASE") or "neo4j",
            )
        return cls(backend, f"bolt://{env.get('MEMGRAPH_HOST', 'memgraph')}:{env.get('MEMGRAPH_PORT', '7687')}")


class _Executor:
    def __init__(self, runner: Any):
        self._runner = runner

    def execute(self, cypher: str, parameters: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
        return [record.data() for record in self._runner.run(cypher, dict(parameters or {}))]


class CypherDatabase:
    def __init__(self, config: DatabaseConfig):
        self.config = config
        self._driver: Driver | None = None
        self._lock = threading.Lock()

    @property
    def backend(self) -> str:
        return self.config.backend

    def _get_driver(self) -> Driver:
        with self._lock:
            if self._driver is None:
                self._driver = GraphDatabase.driver(self.config.uri, auth=(self.config.username, self.config.password))
            return self._driver

    def execute(self, cypher: str, parameters: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
        with self._get_driver().session(database=self.config.database) as session:
            return _Executor(session).execute(cypher, parameters)

    @contextmanager
    def transaction(self) -> Iterator[CypherExecutor]:
        """Commit on normal exit, roll back on any exception. No automatic retries."""
        with self._get_driver().session(database=self.config.database) as session, session.begin_transaction() as tx:
            try:
                yield _Executor(tx)
                tx.commit()
            except BaseException:
                tx.rollback()
                raise

    def close(self) -> None:
        with self._lock:
            if self._driver is not None:
                self._driver.close()
                self._driver = None
