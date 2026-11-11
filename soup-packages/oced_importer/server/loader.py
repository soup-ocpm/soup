"""Load a dedicated Neo4j graph; only the CSV source URL is adapted for SOUP."""

from __future__ import annotations

import json
import logging
import re
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from time import perf_counter
from typing import Any
from uuid import UUID

from soup.core.contracts import ServiceUnavailableError, ValidationError, import_phase
from soup.core.contracts.database import Database
from soup.core.contracts.errors import log_error

from . import queries
from .csv_data import NodeConfig, Prepared
from .csv_http import CsvServer

_IMPORT_LOCK = threading.Lock()
_LOGGER = logging.getLogger("soup.oced_importer")
_LOGGER.setLevel(logging.INFO)
if not _LOGGER.handlers:
    _LOGGER.addHandler(logging.StreamHandler())
_LOGGER.propagate = False


def _finish_phase(info: dict[str, Any], phase: str, started: float, step: str, status: str) -> None:
    seconds = perf_counter() - started
    durations = info.setdefault("duration_seconds", {})
    durations[phase] = durations.get(phase, 0.0) + seconds
    info[f"finish_{phase}_time"] = datetime.now(timezone.utc).isoformat()
    info.setdefault("steps", []).append({"phase": phase, "step": step, "seconds": seconds, "status": status})
    _LOGGER.info("OCED dataset=%s phase=%s step=%s status=%s seconds=%.3f",
                 info.get("dataset_id"), phase, step, status, seconds)


@contextmanager
def timed_phase(info: dict[str, Any], phase: str, step: str = "") -> Iterator[None]:
    started = perf_counter()
    info.setdefault(f"init_{phase}_time", datetime.now(timezone.utc).isoformat())
    _LOGGER.info("OCED dataset=%s phase=%s step=%s started", info.get("dataset_id"), phase, step)
    status = "complete"
    try:
        yield
    except BaseException:
        status = "failed"
        raise
    finally:
        _finish_phase(info, phase, started, step, status)


def _failure(exc: Exception, phase: str, query: str = "") -> str:
    # Driver messages/tracebacks may echo capability URLs or connection credentials.
    def redact(text: str) -> str:
        return re.sub(r"(?:https?|neo4j(?:\+s|\+ssc)?|bolt(?:\+s|\+ssc)?)://[^\s\"'<>]+", "[redacted URL]", text)

    log_error(exc, {"phase": phase, "query": query, "error_type": type(exc).__name__})
    code = getattr(exc, "code", None) or type(exc).__name__
    return f"{phase}: {code}: {redact(str(exc))[:1200]}"


def has_data(database: Any) -> bool:
    rows = database.execute("MATCH (n) RETURN count(n) AS count")
    if not rows:
        raise ServiceUnavailableError("Cannot determine whether the selected Neo4j database is empty")
    return bool(rows[0]["count"])


def _require_empty(database: Any) -> None:
    if has_data(database):
        raise ValidationError(
            "The dataset database is not empty. Import stopped without deleting data. "
            "Use a new import, or explicitly delete this dataset through the workspace before retrying.",
            details={"phase": "database validation"},
        )


def _indexes(database: Database, prepared: Prepared) -> None:
    existing = database.execute(queries.get_indexes_q())
    available = {
        (tuple(index.get("labelsOrTypes") or ()), tuple(index.get("properties") or ()))
        for index in existing
        if index.get("type") in {"RANGE", "BTREE"}
    }
    specifications = [
        ("Entity", prepared.log.entity_id),
        ("Entity", prepared.ekg.type_tag),
        ("Event", prepared.log.event_activity),
    ]
    specifications.extend(("Event", entity) for entity in prepared.log.entities)
    created = False
    for label, property_name in specifications:
        key = ((label,), (property_name,))
        if key not in available:
            database.execute(queries.create_index_q(label, property_name))
            available.add(key)
            created = True
    if created or any(index.get("state") != "ONLINE" for index in existing):
        database.execute("CALL db.awaitIndexes(300)")


def _load_query(node_type: str, config: NodeConfig, log_name: str, url: str, entity_type: str | None = None) -> str:
    query = queries.load_log_q(node_type, config.path, log_name, config.attr, type=entity_type)
    # The original generator remains file:///-based. Change exactly its source
    # literal at this integration boundary; leave the complete Cypher tail intact.
    source = json.dumps(f"file:///{config.path}")
    if query.count(source) != 1:
        raise RuntimeError("Unexpected upstream LOAD CSV source format")
    return query.replace(source, json.dumps(url), 1)


def _validate_import(
    database: Database, urls: dict[str, str], object_id: str, prepared: Prepared
) -> list[tuple[str, str]]:
    events = prepared.log.events
    phase = "generate queries"
    query = ""
    try:
        # The database is new and empty. EXPLAIN keeps compatibility checks
        # read-only; each CSV is downloaded and converted only by its real load.
        steps = [("load events", _load_query("Event", events, object_id, urls[events.path]))]
        steps.extend(
            (f"load entities ({entity})", _load_query("Entity", config, object_id, urls[config.path], entity))
            for entity, config in prepared.log.entities.items()
        )
        for entity in prepared.log.entities:
            steps.extend(
                ((f"CORR ({entity})", queries.infer_corr_q(entity)), (f"DF ({entity})", queries.infer_df_q(entity)))
            )
        for step_phase, query in steps:
            phase = f"validate query: {step_phase}"
            database.execute("EXPLAIN " + query)
    except Exception as exc:
        detail = _failure(exc, phase, query)
        raise ValidationError(
            f"Neo4j CSV/query validation failed during {detail}. No data was deleted. "
            "Check CSV types, timestamp formats and HTTP access from Neo4j.",
            details={"phase": phase, "error_type": type(exc).__name__},
        ) from exc
    return steps


def _execute_step(
    database: Database, info: dict[str, Any], step: tuple[str, str], *, check_empty: bool = False
) -> None:
    label, query = step
    category = {"load events": "event", "load entities": "entity", "CORR": "corr", "DF": "df"}[label.split(" (")[0]]
    phase, commit_started, status = label, None, "failed"
    try:
        with database.transaction() as tx:
            if check_empty:
                _require_empty(tx)
            with timed_phase(info, category, label):
                tx.execute(query)
            phase = f"commit ({label})"
            info.setdefault("init_commit_time", datetime.now(timezone.utc).isoformat())
            _LOGGER.info("OCED dataset=%s phase=commit step=%s started", info.get("dataset_id"), label)
            commit_started = perf_counter()
        status = "complete"
    except Exception as exc:
        info["failed_phase"] = phase
        detail = _failure(exc, phase, query)
        raise ValidationError(
            f"Neo4j OCED import failed during {detail}. "
            "The current transaction was rolled back or could not be confirmed. "
            "Earlier steps may remain committed in this dataset database; the dataset is incomplete. "
            "No database was cleared. Check the backend phase timings before retrying.",
            details={"phase": phase, "error_type": type(exc).__name__, "code": getattr(exc, "code", None)},
        ) from exc
    finally:
        if commit_started is not None:
            _finish_phase(info, "commit", commit_started, label, status)


def load(  # noqa: PLR0913 - existing import inputs plus optional timing context
    database: Database, csv_server: CsvServer, object_id: str, prepared: Prepared, *,
    process_info: dict[str, Any] | None = None, started: float | None = None,
) -> dict[str, Any]:
    object_id = str(UUID(object_id))
    info = process_info if process_info is not None else {}
    info.setdefault("init_time", datetime.now(timezone.utc).isoformat())
    info.setdefault("dataset_id", object_id)
    started = perf_counter() if started is None else started
    http: dict[str, float] = {}
    try:
        with _IMPORT_LOCK, queries.configuration(prepared.log, prepared.ekg):
            with import_phase("dataset database validation"), timed_phase(info, "database_validation"):
                _require_empty(database)
            with import_phase("temporary CSV serving"), csv_server.publish(prepared.files, metrics=http) as urls:
                with timed_phase(info, "query_validation"):
                    steps = _validate_import(database, urls, object_id, prepared)
                with import_phase("index setup"), timed_phase(info, "index"):
                    _indexes(database, prepared)
                # Keep original query order and one Event LOAD (hence ID/DF tie
                # ordering), but release transaction memory between unchanged queries.
                for index, step in enumerate(steps):
                    _execute_step(database, info, step, check_empty=index == 0)
    finally:
        info["finish_time"] = datetime.now(timezone.utc).isoformat()
        info.setdefault("duration_seconds", {})["total"] = perf_counter() - started
        info["http"] = dict(http)
        info["duration_seconds"]["http_transfer"] = http.get("send_seconds", 0.0)
        _LOGGER.info("OCED dataset=%s timings=%s http=%s", object_id, info["duration_seconds"], http)
    return {**prepared.metadata(), "process_info": info}
