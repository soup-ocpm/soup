"""Package-facing Cypher API. Queries remain the caller's database-specific responsibility."""

from __future__ import annotations

from collections.abc import Mapping
from contextlib import AbstractContextManager
from typing import Any, Protocol


class CypherExecutor(Protocol):
    def execute(self, cypher: str, parameters: Mapping[str, Any] | None = None) -> list[dict[str, Any]]: ...


class Database(CypherExecutor, Protocol):
    @property
    def backend(self) -> str: ...

    def transaction(self) -> AbstractContextManager[CypherExecutor]: ...

    def for_database(self, name: str) -> Database: ...

    def for_dataset(self, object_id: str) -> Database: ...

    def check_multi_database(self) -> None: ...

    def create_dataset(self, object_id: str, name: str) -> str: ...

    def drop_dataset(self, object_id: str, *, confirmed: bool = False) -> None: ...
