"""Prepare comma-delimited CSVs without pandas' implicit ID/type conversions."""

from __future__ import annotations

import base64
import binascii
import csv
import io
import json
import re
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

from soup.core.contracts import Upload, ValidationError, import_phase

TYPES = {"String", "Integer", "Float", "Boolean", "Datetime"}
_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def identifier(value: Any) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        raise ValidationError(
            "Column names and type_tag must use letters, digits and underscores, starting with a letter or underscore"
        )
    return value


@dataclass
class Table:
    columns: list[str]
    rows: list[list[str]]

    def csv_bytes(self) -> bytes:
        output = io.StringIO(newline="")
        writer = csv.writer(output, lineterminator="\n")
        writer.writerow(self.columns)
        writer.writerows(self.rows)
        return output.getvalue().encode("utf-8")

    def values(self, column: str) -> list[str]:
        index = self.columns.index(column)
        return [row[index] for row in self.rows]


def read_table(data: bytes, delimiter: str = ",") -> Table:
    if delimiter not in {",", ";", "\t"}:
        raise ValidationError("CSV delimiter must be comma, semicolon or tab")
    try:
        rows = list(
            csv.reader(
                io.StringIO(data.decode("utf-8-sig"), newline=""),
                delimiter=delimiter,
                strict=True,
            )
        )
    except (UnicodeError, csv.Error) as exc:
        raise ValidationError(f"Invalid UTF-8 CSV: {exc}") from exc
    if not rows or not rows[0] or len(set(rows[0])) != len(rows[0]):
        raise ValidationError("CSV needs nonempty, unique column headers")
    if any(not column.strip() for column in rows[0]):
        raise ValidationError("CSV column headers must not be empty")
    if any(len(row) != len(rows[0]) for row in rows[1:]):
        raise ValidationError("Every CSV row must have the same number of columns as the header")
    return Table(rows[0], rows[1:])


def _tokens(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip().lower() not in {"", "null", "nan", "none"}]


def reference_ids(values: list[str]) -> set[str]:
    return {item for value in values for item in _tokens(value)}


def infer_type(values: list[str]) -> str:
    samples = [value for value in values[:1000] if value.strip().lower() not in {"", "null", "nan", "none"}]
    if not samples:
        return "String"
    if all(value.lower() in {"true", "false"} for value in samples):
        return "Boolean"
    if all(re.fullmatch(r"[+-]?(0|[1-9][0-9]*)", value) for value in samples):
        return "Integer"
    if all(
        re.fullmatch(r"[+-]?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", value)
        for value in samples
    ):
        return "Float"
    return "Datetime" if _are_datetimes(samples) else "String"


def _are_datetimes(values: list[str]) -> bool:
    try:
        for value in values:
            if not re.match(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
                return False
            datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def describe(upload: Upload) -> dict[str, Any]:
    table = read_table(upload.read())
    return {
        "filename": upload.filename,
        "size": len(upload.read()),
        "columns": table.columns,
        "rows": table.rows[:10],
        "attr_types": {column: infer_type(table.values(column)) for column in table.columns},
        "file": {"filename": upload.filename, "base64": base64.b64encode(upload.read()).decode("ascii")},
    }


def _select(table: Table, raw: Mapping[str, Any]) -> Table:
    columns = raw.get("attr", table.columns)
    if (
        not isinstance(columns, list)
        or not columns
        or any(not isinstance(c, str) or c not in table.columns for c in columns)
    ):
        raise ValidationError("Keep at least one existing column in each table")
    if len(set(columns)) != len(columns):
        raise ValidationError("Selected attributes must be unique")
    indices = [table.columns.index(column) for column in columns]
    return Table(list(columns), [[row[index] for index in indices] for row in table.rows])


@dataclass
class NodeConfig:
    path: str
    attr: list[str]
    attr_types: dict[str, str]
    type: str | None = None


@dataclass
class LogConfig:
    event_id: str
    event_activity: str
    event_timestamp: str
    entity_id: str
    events: NodeConfig
    entities: dict[str, NodeConfig]


@dataclass
class EkgConfig:
    type_tag: str = "Type"
    entity_type_mode: str = "property"


@dataclass
class Prepared:
    log: LogConfig
    ekg: EkgConfig
    files: dict[str, bytes]
    counts: dict[str, Any]

    def metadata(self) -> dict[str, Any]:
        return {
            "log_config": asdict(self.log),
            "ekg_config": asdict(self.ekg),
            "counts": self.counts,
            "configuration_yaml": configuration_yaml(self.log),
        }


def _mapping(value: Any, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValidationError(f"{label} must be an object")
    return value


def _attr_types(raw: Any, columns: list[str], required: dict[str, str]) -> dict[str, str]:
    supplied = dict(_mapping(raw, "attr_types"))
    if any(key not in columns or not isinstance(value, str) or value not in TYPES for key, value in supplied.items()):
        raise ValidationError("attr_types must map existing columns to String, Integer, Float, Boolean or Datetime")
    for column, value in required.items():
        if supplied.get(column, value) != value:
            raise ValidationError(f"Column '{column}' must have ocean-lib type {value}")
    return {**required, **supplied}


def _object_table(raw: Mapping[str, Any], ids: set[str], entity_id: str) -> Table:
    file = raw.get("file")
    if file is None:
        return Table([entity_id], [[item] for item in sorted(ids)])
    file = _mapping(file, "Object table file")
    filename = file.get("filename")
    with import_phase("object CSV validation", file=filename if isinstance(filename, str) else "object CSV"):
        try:
            data = base64.b64decode(file["base64"], validate=True)
        except (KeyError, TypeError, ValueError, binascii.Error) as exc:
            raise ValidationError("Object table file needs valid base64 content") from exc
        table = _select(read_table(data, raw.get("delimiter", ",")), raw)
        source_id = raw.get("id_column", entity_id)
        if source_id not in table.columns:
            raise ValidationError("Keep and select the object table's ID column")
        if source_id != entity_id and entity_id in table.columns:
            raise ValidationError(
                f"Mapping the object ID would duplicate the '{entity_id}' column; discard the other column"
            )
        index = table.columns.index(source_id)
        table.columns[index] = entity_id
        for column in table.columns:
            identifier(column)
        for row in table.rows:
            row[index] = row[index].strip()
        values = table.values(entity_id)
        if any(value.lower() in {"", "null", "nan", "none"} for value in values) or len(set(values)) != len(values):
            raise ValidationError("Object table IDs must be non-null and unique after trimming whitespace")
        if not ids.issubset(set(values)):
            raise ValidationError("Object table is missing IDs referenced by the event table")
        return table


def _entity_types(raw: Mapping[str, Any], columns: list[str], entity_id: str) -> dict[str, str]:
    supplied = dict(_mapping(raw.get("attr_types", {}), "attr_types"))
    source_id = raw.get("id_column", entity_id)
    if source_id != entity_id and source_id in supplied:
        supplied[entity_id] = supplied.pop(source_id)
    return _attr_types(supplied, columns, {entity_id: "String"})


def _event_columns(table: Table, options: Mapping[str, Any]) -> tuple[str, str, str]:
    columns = tuple(
        options.get(key, default)
        for key, default in (("event_id", "id"), ("event_activity", "eventName"), ("event_timestamp", "eventDatetime"))
    )
    if any(not isinstance(column, str) or column not in table.columns for column in columns) or len(
        set(columns)
    ) != len(columns):
        raise ValidationError("Choose distinct event ID, activity and timestamp columns")
    event_id, activity, timestamp = (str(column) for column in columns)
    if timestamp != "eventDatetime" and "eventDatetime" in table.columns:
        raise ValidationError("Mapping the timestamp would duplicate eventDatetime; discard the other column")
    ids = table.values(event_id)
    if not ids or "" in ids or len(set(ids)) != len(ids):
        raise ValidationError("Event IDs must be nonempty and unique, with at least one event")
    for row_number, value in enumerate(table.values(timestamp), start=1):
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValidationError(
                f"Column '{timestamp}', data row {row_number} must contain a valid ISO datetime for eventDatetime",
                details={"phase": "timestamp validation", "column": timestamp, "row": row_number},
            ) from exc
    return event_id, activity, timestamp


def _normalize_references(table: Table, columns: Mapping[str, Any]) -> None:
    for column in columns:
        index = table.columns.index(column)
        for row in table.rows:
            row[index] = ",".join(_tokens(row[index]))


def prepare(upload: Upload, options: Mapping[str, Any], relative_dir: str) -> Prepared:
    if options.get("config_error"):
        raise ValidationError(str(options["config_error"]))
    if options.get("upload_pending"):
        raise ValidationError("Wait for the object table uploads to finish")
    event_options = _mapping(options.get("events", {}), "events")
    table = _select(read_table(upload.read(), options.get("delimiter", ",")), event_options)
    event_id, activity, timestamp = _event_columns(table, options)
    entity_id = identifier(options.get("entity_id", "wyId"))
    type_tag = "Type"
    if options.get("type_tag", type_tag) != type_tag:
        raise ValidationError("type_tag is managed internally by the OCED event log package")
    if type_tag == "Log" or entity_id in {"Log", type_tag} or "Log" in table.columns:
        raise ValidationError("Log and the configured type_tag are reserved generated properties")
    entity_options = _mapping(options.get("entities", {}), "entities")
    if not entity_options or any(
        column not in table.columns or column in {event_id, activity, timestamp} for column in entity_options
    ):
        raise ValidationError("Choose at least one object-reference column, distinct from the event columns")
    _normalize_references(table, entity_options)
    attr_types = _attr_types(
        event_options.get("attr_types", {}),
        table.columns,
        {timestamp: "Datetime", **{column: "String" for column in entity_options}},
    )
    table.columns[table.columns.index(timestamp)] = "eventDatetime"
    attr_types["eventDatetime"] = attr_types.pop(timestamp)
    timestamp = "eventDatetime"
    for column in table.columns:
        identifier(column)
    events = NodeConfig(f"{relative_dir}/events.csv", table.columns, attr_types)
    entities: dict[str, NodeConfig] = {}
    files = {events.path: table.csv_bytes()}
    entity_counts: dict[str, int] = {}
    counts = {"events": len(table.rows), "entities": entity_counts}
    seen_ids: set[str] = set()
    for column, raw_options in entity_options.items():
        raw = _mapping(raw_options, f"entities.{column}")
        with import_phase("object table preparation", column=column):
            entity = _object_table(raw, reference_ids(table.values(column)), entity_id)
        if {"Log", type_tag}.intersection(entity.columns):
            raise ValidationError("Object tables must not contain Log or the configured type_tag")
        ids = set(entity.values(entity_id))
        if seen_ids.intersection(ids):
            raise ValidationError(
                "Object IDs must be globally unique across types: upstream CORR matches only entity_id"
            )
        seen_ids.update(ids)
        node = NodeConfig(
            f"{relative_dir}/entity_{column}.csv",
            entity.columns,
            _entity_types(raw, entity.columns, entity_id),
            column,
        )
        entities[column] = node
        files[node.path] = entity.csv_bytes()
        entity_counts[column] = len(entity.rows)
    log = LogConfig(event_id, activity, timestamp, entity_id, events, entities)
    files[f"{relative_dir}/log_config.yaml"] = configuration_yaml(log).encode("utf-8")
    return Prepared(
        log,
        EkgConfig(type_tag),
        files,
        counts,
    )


def configuration_yaml(log: LogConfig) -> str:
    """Emit the ocean-lib configuration as YAML without another runtime dependency.

    JSON-quoted scalar strings and flow sequences are valid YAML and preserve
    IDs, property names and type names without implicit YAML type conversion.
    """
    data = asdict(log)
    data["events"].pop("type", None)

    def lines(mapping: Mapping[str, Any], indent: int = 0) -> list[str]:
        output = []
        for key, value in mapping.items():
            prefix = " " * indent + key + ":"
            if isinstance(value, dict) and value:
                output.append(prefix)
                output.extend(lines(value, indent + 2))
            else:
                output.append(prefix + " " + json.dumps(value, ensure_ascii=False))
        return output

    return "\n".join(lines(data)) + "\n"
