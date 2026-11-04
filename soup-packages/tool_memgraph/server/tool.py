"""
------------------------------------------------------------------------
File : tool.py
Description: MemgraphTool - the "memgraph" tool. Runs parameterized
             Cypher (run) and tracks the active graph: Memgraph holds one
             dataset at a time, so ensure_loaded(state_key, loader)
             empties the database and calls loader(run) only when the
             loaded state differs from state_key (or with force).
             state_key is an opaque string chosen by the caller (e.g. an
             object id). Loads are serialized by a lock, so two requests
             never load different states on top of each other.
             advance(from_state, to_state, mutate) changes the active
             graph in place (an analysis on the loaded parent): only if
             from_state is active, and the state becomes to_state only
             if mutate succeeds.
             Memgraph runs without persistence, so if it restarts alone it
             comes back empty while this process still holds the state:
             is_loaded and advance check that the database has a node
             before they trust the state.
Project : soup-packages/tool_memgraph
------------------------------------------------------------------------
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from typing import Any

from soup.core.contracts import ConflictError, Tool

from .port import GraphDatabase
from .query import Query

_LOGGER = logging.getLogger("soup.memgraph")

MEMGRAPH_TOOL = "memgraph"

Run = Callable[[Query], list[dict[str, Any]]]
Loader = Callable[[Run], None]

_PING_QUERY = Query("RETURN 1 AS ok")
_CLEAR_QUERY = Query("MATCH (n) DETACH DELETE n")
_ANY_NODE_QUERY = Query("MATCH (n) RETURN 1 AS found LIMIT 1")


class MemgraphTool(Tool, GraphDatabase):
    name = MEMGRAPH_TOOL

    def __init__(self, db: GraphDatabase):
        self._db = db
        self._state: str | None = None
        self._lock = threading.RLock()

    def run(self, query: Query) -> list[dict[str, Any]]:
        return self._db.run(query)

    def health(self) -> dict[str, Any]:
        try:
            self._db.run(_PING_QUERY)
        except Exception as exc:  # noqa: BLE001 - health() must not raise
            return {"ok": False, "error": str(exc)}
        return {"ok": True, "state": self._state}

    def is_loaded(self, state_key: str) -> bool:
        """
        True if `state_key` is the active state and the database has a
        node. An empty database means the graph is lost (Memgraph restarted
        or was emptied): the state is forgotten, so the next ensure_loaded
        rebuilds. Callers that skip work when the graph is loaded ask here,
        not current_state(), which does not look at the database.
        """

        with self._lock:
            if self._state != state_key:
                return False
            if self._db.run(_ANY_NODE_QUERY):
                return True
            _LOGGER.warning("Memgraph restarted or emptied: reloading %s", state_key)
            self._state = None
            return False

    def ensure_loaded(self, state_key: str, loader: Loader, force: bool = False) -> bool:
        """
        Make `state_key` the active graph. Returns True if loader ran,
        False if `state_key` was already active and its graph is still in
        the database (is_loaded). If loader raises, the
        database is in an unknown state: the active state becomes None
        and the error propagates.
        """

        if not isinstance(state_key, str) or not state_key:
            raise ValueError(f"state_key must be a non-empty string, got {state_key!r}")
        with self._lock:
            if not force and self.is_loaded(state_key):
                return False
            self.clear()
            loader(self.run)
            self._state = state_key
            return True

    def advance(self, from_state: str, to_state: str, mutate: Loader) -> None:
        """
        Run mutate(run) on the graph of `from_state`, which then becomes
        `to_state`. Atomic under the lock of the loads.

        :raises ConflictError: `from_state` is not the active state
            (mutate does not run, the graph is untouched), or the
            database is empty: the graph of `from_state` is lost, the state
            is forgotten and mutate does not run. The caller loads it first
        If mutate raises, the graph is in an unknown state: the active
        state becomes None (the next ensure_loaded reloads) and the error
        propagates.
        """

        for name, value in (("from_state", from_state), ("to_state", to_state)):
            if not isinstance(value, str) or not value:
                raise ValueError(f"{name} must be a non-empty string, got {value!r}")
        with self._lock:
            if self._state != from_state:
                raise ConflictError(
                    f"The graph in Memgraph changed meanwhile (expected state {from_state!r}); retry"
                )
            if not self._db.run(_ANY_NODE_QUERY):
                self._state = None
                raise ConflictError(
                    f"The graph of state {from_state!r} is no longer in Memgraph "
                    "(restarted or emptied): nothing was changed; retry"
                )
            self._state = None
            mutate(self.run)
            self._state = to_state

    def current_state(self) -> str | None:
        return self._state

    def clear(self) -> None:
        """Empty the database; no state is active afterwards."""

        with self._lock:
            self._state = None
            self._db.run(_CLEAR_QUERY)

    def invalidate(self) -> None:
        """
        Forget the active state without touching the data, for callers
        that write to the database outside ensure_loaded: the next
        ensure_loaded always reloads.
        """

        with self._lock:
            self._state = None

    def close(self) -> None:
        close = getattr(self._db, "close", None)
        if callable(close):
            close()
