"""Translate OCEL 2.0 into the CSV/options accepted by the existing OCED importer.

Limitations inherited from the OCED event-table model: qualifiers, object-object
relationships and historical object attribute changes are not representable.
"""
from __future__ import annotations

import base64
import csv
import io
import re
import math
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from soup.core.contracts import Upload, ValidationError
from .model import OcelLog

_RESERVED = {"id", "eventName", "eventDatetime", "wyId", "Type", "Log"}


def _identifier(text: str, prefix: str, used: set[str]) -> str:
    base = re.sub(r"[^a-zA-Z0-9_]", "_", text).strip("_") or "unnamed"
    if not re.match(r"[a-zA-Z_]", base):
        base = "_" + base
    base = prefix + base
    candidate = base
    count = 2
    while candidate in used:
        candidate = f"{base}_{count}"
        count += 1
    used.add(candidate)
    return candidate


def _csv_bytes(columns: list[str], rows: list[list[str]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(columns)
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


def _value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _timestamp(value: str) -> str:
    try:
        if not isinstance(value, str):
            raise TypeError('Timestamp must be text')
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"Invalid OCEL event timestamp: {value!r}") from exc


def _distinct_identifiers(log: OcelLog) -> None:
    event_ids = [event.id for event in log.events]
    object_ids = [obj.id for obj in log.objects]
    if len(set(event_ids)) != len(event_ids) or len(set(object_ids)) != len(object_ids):
        raise ValidationError("OCEL event and object identifiers must be unique")
    # OCED's CORR generation joins comma-separated IDs, not quoted string arrays.
    # Whitespace at ends can also change their identity during OCED CSV preparation.
    for ident in object_ids:
        if not ident or ident != ident.strip() or "," in ident or ident.lower() in {"null", "nan", "none"}:
            raise ValidationError(
                "OCED cannot represent OCEL identifiers containing commas, leading/trailing "
                "whitespace, or reserved null tokens. Use native OCEL tables instead."
            )


def _type(values: list[Any], declarations: set[str]) -> str:
    nonnull = [value for value in values if value is not None and value != '']
    if any(isinstance(value, float) and not math.isfinite(value) for value in nonnull):
        raise ValidationError('OCED attributes must contain finite numeric values')
    if any(isinstance(value, int) and not -(2**63) <= value < 2**63 for value in nonnull):
        raise ValidationError('OCED integer attributes must fit a signed 64-bit value')
    if not nonnull and len(declarations) == 1:
        return {'integer':'Integer','float':'Float','boolean':'Boolean','time':'Datetime'}.get(next(iter(declarations)), 'String')
    if declarations == {'time'}:
        for value in nonnull:
            _timestamp(value)
        return 'Datetime'
    if nonnull and all(isinstance(value, bool) for value in nonnull):
        return 'Boolean'
    if nonnull and all(isinstance(value, int) and not isinstance(value, bool) for value in nonnull):
        return 'Float' if declarations == {'float'} else 'Integer'
    if nonnull and all(isinstance(value, (float,int)) and not isinstance(value, bool) for value in nonnull):
        return 'Float'
    return 'String'


def _instant(value: str):
    parsed = datetime.fromisoformat(value.replace('Z','+00:00'))
    instant = parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    fraction = re.search(r'[Tt ]\d{2}(?::?\d{2}){1,2}[.,](\d+)', value)
    return instant, Decimal('0.' + fraction[1]) if fraction else Decimal(0)


def convert(log: OcelLog) -> tuple[Upload, dict[str, Any], dict[str, Any]]:
    """Produce an OCED-ready events CSV Upload, importer options and conversion summary."""
    _distinct_identifiers(log)
    if not log.events:
        raise ValidationError("OCED import requires at least one OCEL event")
    types = [type_decl.name for type_decl in log.object_types]
    for obj in log.objects:
        if obj.type not in types:
            types.append(obj.type)
    if not types:
        raise ValidationError("OCED import requires at least one object type")
    used = set(_RESERVED)
    object_columns = {type_name: _identifier(type_name, "obj_", used) for type_name in types}
    event_attrs = sorted({name for event in log.events for name, _value_ in event.attributes} | {name for decl in log.event_types for name, _ in decl.attributes})
    event_attr_cols = {name: _identifier(name, "attr_", used) for name in event_attrs}
    event_types = {event_attr_cols[name]: _type(
        [dict(event.attributes).get(name) for event in log.events],
        {kind for decl in log.event_types for attr, kind in decl.attributes if attr == name})
        for name in event_attrs}
    object_types = {obj.id: obj.type for obj in log.objects}
    event_rows: list[list[str]] = []
    duplicate_links = 0
    for event in log.events:
        refs: dict[str, list[str]] = defaultdict(list)
        for link in event.relationships:
            if link.object_id not in object_types:
                raise ValidationError(f"Event {event.id!r} references missing object {link.object_id!r}")
            obj_type = object_types[link.object_id]
            if link.object_id not in refs[obj_type]:
                refs[obj_type].append(link.object_id)
            else:
                duplicate_links += 1
        attrs = dict(event.attributes)
        event_rows.append([
            event.id, event.type, _timestamp(event.time),
            *(_value(attrs.get(attr)) for attr in event_attrs),
            *(",".join(refs[type_name]) for type_name in types),
        ])
    event_columns = ["id", "eventName", "eventDatetime", *event_attr_cols.values(), *object_columns.values()]
    entities: dict[str, Any] = {}
    temporal = 0
    object_attr_mappings = {}
    object_attr_types = {}
    for type_name in types:
        members = [obj for obj in log.objects if obj.type == type_name]
        attr_names = sorted({name for obj in members for name, _at, _value_ in obj.attributes} | {name for decl in log.object_types if decl.name == type_name for name, _ in decl.attributes})
        used_attrs = set(_RESERVED)
        attr_cols = {name: _identifier(name, "attr_", used_attrs) for name in attr_names}
        object_attr_mappings[type_name] = attr_cols
        types_for_attrs = {attr_cols[name]: _type(
            [value for obj in members for attr, _, value in obj.attributes if attr == name],
            {kind for decl in log.object_types if decl.name == type_name for attr, kind in decl.attributes if attr == name}) for name in attr_names}
        object_attr_types[type_name] = types_for_attrs
        columns = ["wyId", *attr_cols.values()]
        rows: list[list[str]] = []
        for obj in members:
            by_name: dict[str, list[tuple[str, Any]]] = defaultdict(list)
            for name, time, value in obj.attributes:
                by_name[name].append((time, value))
            temporal += sum(max(0, len(values) - 1) for values in by_name.values())
            # Initial (earliest) values only: OCED holds one row per object.
            row = [obj.id]
            for name in attr_names:
                values = by_name.get(name, [])
                row.append(_value(min(values, key=lambda p: _instant(p[0]))[1]) if values else "")
            rows.append(row)
        file_bytes = _csv_bytes(columns, rows)
        entities[object_columns[type_name]] = {
            "file": {"filename": f"objects_{object_columns[type_name]}.csv",
                     "base64": base64.b64encode(file_bytes).decode("ascii")},
            "id_column": "wyId",
            "attr": columns,
            "attr_types": {"wyId": "String", **types_for_attrs},
        }
    options = {
        "event_id": "id", "event_activity": "eventName", "event_timestamp": "eventDatetime",
        "entity_id": "wyId", "type_tag": "Type", "missing_reference_strategy": "strict",
        "events": {"attr": event_columns, "attr_types": {
            "eventDatetime": "Datetime",
            **{column: "String" for column in object_columns.values()},
            **event_types,
        }},
        "entities": entities,
    }
    summary = {
        "events": len(log.events), "objects": len(log.objects),
        "object_type_columns": object_columns,
        "event_attribute_columns": event_attr_cols,
        "object_attribute_columns": object_attr_mappings,
        "event_attribute_types": event_types,
        "object_attribute_types": object_attr_types,
        "empty_string_attributes_as_null": sum(value == '' for event in log.events for _, value in event.attributes)
            + sum(value == '' for obj in log.objects for _, _, value in obj.attributes),
        "event_object_relationships_deduplicated": duplicate_links,
        "object_attribute_timestamps_not_preserved": sum(at != "1970-01-01T00:00:00Z" for obj in log.objects for _, at, _ in obj.attributes),
        "qualifier_relationships_not_preserved": sum(bool(link.qualifier) for event in log.events for link in event.relationships),
        "object_object_relationships_not_preserved": sum(len(obj.relationships) for obj in log.objects),
        "additional_timed_object_attribute_values_not_preserved": temporal,
        "notice": "OCED stores one static object row per type. Qualifiers, object-object links, attribute-history timestamps and later values are not imported. Empty attribute strings become NULL; missing and explicit NULL properties cannot be distinguished in the graph. Incompatible mixed scalar types become strings; compatible numeric columns may be promoted to Float. Names are mapped to safe columns (mappings above). Memgraph stores UTC local timestamps (up to microseconds); source event timestamp text is retained in _oced_timestamp_iso.",
    }
    return Upload.from_bytes("ocel2_events.csv", _csv_bytes(event_columns, event_rows), "text/csv"), options, summary
