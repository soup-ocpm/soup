"""Load a dedicated Neo4j graph; only the CSV source URL is adapted for SOUP."""

from __future__ import annotations

import json
import re
import threading
from typing import Any
from uuid import UUID

from soup.core.contracts import ServiceUnavailableError, ValidationError, import_phase
from soup.core.contracts.database import Database
from soup.core.contracts.errors import log_error

from . import queries
from .csv_data import NodeConfig, Prepared
from .csv_http import CsvServer

_IMPORT_LOCK = threading.Lock()


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
            "The selected Neo4j database contains data. Import stopped; review the replacement warning "
            "and explicitly confirm deletion before importing.",
            details={"phase": "database validation"},
        )


def _indexes(database: Database, prepared: Prepared) -> None:
    existing = database.execute(queries.get_indexes_q())
    available = {
        (tuple(index.get("labelsOrTypes") or ()), tuple(index.get("properties") or ()))
        for index in existing
        if index.get("type") == "RANGE"
    }
    specifications = [
        ("Entity", prepared.log.entity_id),
        ("Entity", prepared.ekg.type_tag),
        ("Event", prepared.log.event_activity),
        ("Class", "Name"),
    ]
    specifications.extend(("Event", entity) for entity in prepared.log.entities)
    for label, property_name in specifications:
        key = ((label,), (property_name,))
        if key not in available:
            database.execute(queries.create_index_q(label, property_name))
            available.add(key)


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
    phase = "validate CSVs"
    query = ""
    try:
        # Neo4j must fetch EVERY CSV and evaluate its actual type conversions
        # before replacement can destroy existing data. These queries only read.
        converters = {"Datetime": "datetime", "Integer": "toInteger", "Float": "toFloat", "Boolean": "toBoolean"}
        for label, config in [("events", events), *prepared.log.entities.items()]:
            phase = f"validate CSV ({label})"
            conversions = [
                f"count({converters[kind]}(line.{column})) AS converted_{index}"
                for index, column in enumerate(config.attr)
                if (kind := config.attr_types.get(column)) in converters
            ]
            query = "LOAD CSV WITH HEADERS FROM $url AS line RETURN " + ", ".join(["count(line) AS rows", *conversions])
            database.execute(query, {"url": urls[config.path]})
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


def load(
    database: Database, csv_server: CsvServer, object_id: str, prepared: Prepared, *, replace_existing: bool = False
) -> dict[str, Any]:
    object_id = str(UUID(object_id))
    with _IMPORT_LOCK, queries.configuration(prepared.log, prepared.ekg):
        try:
            if not replace_existing:
                _require_empty(database)
        except ValidationError:
            raise
        except Exception as exc:
            detail = _failure(exc, "database connection / empty-database check")
            raise ServiceUnavailableError(
                "Cannot connect to the configured Neo4j database. Check NEO4J_URI, "
                f"credentials, database name and TLS settings. {detail}",
                details={"phase": "database connection", "error_type": type(exc).__name__},
            ) from exc
        with import_phase("temporary CSV serving"), csv_server.publish(prepared.files) as urls:
            steps = _validate_import(database, urls, object_id, prepared)
            try:
                _indexes(database, prepared)
            except Exception as exc:
                detail = _failure(exc, "index setup")
                raise ValidationError(
                    "Neo4j index setup failed. Check index-list/create privileges and existing schema; "
                    f"no graph data was loaded. {detail}",
                    details={"phase": "index setup", "error_type": type(exc).__name__},
                ) from exc
            deleted = False
            if replace_existing:
                try:
                    # One explicit, non-retried auto-commit. Never clear on import failure.
                    database.execute("MATCH (e) DETACH DELETE e")
                    deleted = True
                except Exception as exc:
                    detail = _failure(exc, "delete existing dataset", "MATCH (e) DETACH DELETE e")
                    raise ValidationError(
                        f"Neo4j deletion failed or could not be confirmed: {detail}. Import stopped. "
                        "Verify the database before retrying; deletion was not retried.",
                        details={"phase": "delete existing dataset", "error_type": type(exc).__name__},
                    ) from exc
            phase = "begin transaction"
            query = ""
            try:
                with database.transaction() as tx:
                    phase = "transaction empty-database check"
                    _require_empty(tx)
                    for step in steps:
                        phase, query = step
                        tx.execute(query)
                    phase = "commit transaction"
                    query = ""
            except Exception as exc:
                detail = _failure(exc, phase, query)
                state = (
                    "The previous dataset was deleted and cannot be restored by SOUP."
                    if deleted
                    else "No graph was cleared."
                )
                raise ValidationError(
                    f"Neo4j OCED import failed during {detail}. "
                    f"Rollback was attempted; verify the database before retrying. {state}",
                    details={"phase": phase, "error_type": type(exc).__name__},
                ) from exc
    return prepared.metadata()
