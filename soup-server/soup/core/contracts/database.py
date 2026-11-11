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
