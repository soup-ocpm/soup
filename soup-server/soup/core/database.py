"""Lazy Bolt connection for new packages; no startup queries or schema changes."""

from __future__ import annotations

import re
import threading
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID, uuid4

from neo4j import Driver, GraphDatabase

from soup.core.contracts import Catalog, ConflictError, ForbiddenError, NotFoundError, ValidationError, import_phase
from soup.core.contracts.database import CypherExecutor
from soup.core.contracts.errors import log_error

_DATABASE_NAME = re.compile(r"[a-z][a-z0-9-]{2,62}")
_SLUG_LIMIT = 16
_COLLISION_ATTEMPTS = 3


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
        result = self._runner.run(cypher, dict(parameters or {}))
        rows = [record.data() for record in result]
        result.consume()
        return rows


class CypherDatabase:
    def __init__(self, config: DatabaseConfig, *, name: str | None = None, root: CypherDatabase | None = None):
        self.config = config
        self._name = name
        self._root = root or self
        self._catalog: Callable[[], Catalog] | None = None
        self._driver: Driver | None = None
        self._lock = threading.Lock()

    @property
    def backend(self) -> str:
        return self.config.backend

    def bind_catalog(self, catalog: Callable[[], Catalog]) -> None:
        self._root._catalog = catalog

    def _dataset_catalog(self) -> Catalog:
        if self._root._catalog is None:
            raise ValidationError("The dataset catalog is unavailable; no Neo4j database was selected.")
        return self._root._catalog()

    def for_database(self, name: str) -> CypherDatabase:
        """Explicit administrative/new-database binding; never use the configured default implicitly."""
        if not isinstance(name, str) or not _DATABASE_NAME.fullmatch(name):
            raise ValidationError("Invalid Neo4j database name")
        return CypherDatabase(self.config, name=name, root=self._root)

    def for_dataset(self, object_id: str) -> CypherDatabase:
        """Resolve catalog provenance on each operation, including future derived objects."""
        if self.backend != "neo4j":
            return self
        catalog = self._dataset_catalog()
        pending, visited, names = [object_id], set(), set()
        missing = False
        while pending:
            current = pending.pop()
            if current in visited:
                continue
            visited.add(current)
            obj = catalog.get(current)
            if obj is None:
                raise NotFoundError(f"Dataset/object '{current}' is not registered")
            name = obj.meta.get("neo4j_database")
            if name is not None:
                if not isinstance(name, str) or not _DATABASE_NAME.fullmatch(name):
                    raise ValidationError("Invalid Neo4j database mapping in the dataset catalog")
                if obj.meta.get("neo4j_managed") and obj.meta.get("neo4j_database_owner") != obj.id:
                    raise ValidationError("The dataset's Neo4j database ownership record is invalid")
                names.add(name)
            else:
                missing = missing or not obj.parents
                pending.extend(obj.parents)
        if len(names) != 1 or missing:
            raise ValidationError(
                "Select one dataset with an explicit Neo4j database mapping. "
                "Missing or multiple dataset databases cannot use NEO4J_DATABASE as a fallback."
            )
        return self.for_database(names.pop())

    def _session_database(self) -> str | None:
        if self.backend == "neo4j" and self._name is None:
            raise ValidationError("Neo4j graph access requires a dataset: use database.for_dataset(object_id).")
        return self._name if self._name is not None else self.config.database

    def check_multi_database(self) -> None:
        if self.backend != "neo4j":
            raise ValidationError("Database administration requires Neo4j mode.")
        with import_phase(
            "Neo4j multi-database validation",
            hint="Use a multi-database Neo4j Enterprise instance with database creation, access and drop privileges.",
        ):
            system = self.for_database("system")
            components = system.execute("CALL dbms.components() YIELD name, edition RETURN name, edition")
            if not any(str(row.get("edition", "")).lower() == "enterprise" for row in components):
                raise ValidationError("One database per dataset requires Neo4j Enterprise multi-database support.")
            system.execute("SHOW DATABASES YIELD name RETURN name")

    def create_dataset(self, object_id: str, name: str) -> str:
        self.check_multi_database()
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:_SLUG_LIMIT] or "dataset"
        base = f"soup-{slug}-{UUID(object_id).hex}"
        system = self.for_database("system")
        with import_phase(
            "Neo4j database creation", hint="Check CREATE DATABASE privileges and available database capacity."
        ):
            existing = {row["name"] for row in system.execute("SHOW DATABASES YIELD name RETURN name")}
            for attempt in range(_COLLISION_ATTEMPTS):
                candidate = base if not attempt and base not in existing else f"{base}-{uuid4().hex[:8]}"
                try:
                    system.execute(f"CREATE DATABASE `{candidate}` WAIT")
                except Exception as exc:
                    if str(getattr(exc, "code", "")).endswith(("DatabaseAlreadyExists", "DatabaseExists")):
                        continue
                    raise
                return candidate
        raise ConflictError("Could not allocate a unique Neo4j dataset database; retry the import.")

    def drop_dataset(self, object_id: str, *, confirmed: bool = False) -> None:
        if self.backend != "neo4j":
            raise ValidationError("Database administration requires Neo4j mode.")
        if not confirmed:
            raise ValidationError("Explicit confirmation is required to irreversibly drop a dataset database.")
        catalog = self._dataset_catalog()
        obj = catalog.get(object_id)
        if obj is None:
            raise NotFoundError("The dataset is not registered")
        name = obj.meta.get("neo4j_database")
        suffix = UUID(obj.id).hex
        if (
            obj.meta.get("neo4j_managed") is not True or obj.meta.get("neo4j_database_owner") != obj.id
            or not isinstance(name, str) or not _DATABASE_NAME.fullmatch(name)
            or not re.fullmatch(rf"soup-[a-z0-9-]+-{suffix}(?:-[0-9a-f]{{8}})?", name)
            or name in {"system", "neo4j"}
            or any(other.id != obj.id and other.meta.get("neo4j_database") == name for other in catalog.list())
        ):
            raise ForbiddenError("Refusing to drop a protected, shared or unmanaged Neo4j database.")
        with import_phase(
            "Neo4j database deletion", hint="Check DROP DATABASE privileges; the catalog entry was retained."
        ):
            result = self.for_database("system").execute(f"DROP DATABASE `{name}` IF EXISTS WAIT")
            if any(row.get("success") is False for row in result):
                raise ConflictError("Neo4j did not confirm database deletion; the catalog entry was retained.")

    def _get_driver(self) -> Driver:
        if self._root is not self:
            return self._root._get_driver()
        with self._lock:
            if self._driver is None:
                self._driver = GraphDatabase.driver(self.config.uri, auth=(self.config.username, self.config.password))
            return self._driver

    def execute(self, cypher: str, parameters: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
        name = self._session_database()
        with self._get_driver().session(database=name) as session:
            return _Executor(session).execute(cypher, parameters)

    @contextmanager
    def transaction(self) -> Iterator[CypherExecutor]:
        """Commit once; roll back body failures without hiding the original error. No retries."""
        name = self._session_database()
        with self._get_driver().session(database=name) as session:
            tx = session.begin_transaction()
            try:
                yield _Executor(tx)
            except BaseException:
                if not tx.closed():
                    try:
                        tx.rollback()
                    except Exception as cleanup:
                        log_error(cleanup, {"phase": "transaction rollback"})
                raise
            else:
                # commit() closes the transaction even when COMMIT fails. Do not
                # mask that failure by rolling back an already closed transaction.
                tx.commit()

    def close(self) -> None:
        with self._lock:
            if self._driver is not None:
                self._driver.close()
                self._driver = None
