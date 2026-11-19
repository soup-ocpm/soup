"""
------------------------------------------------------------------------
File : model.py
Description: The OCEL 2.0 JSON format (ocel-standard.org), with the
             standard library only:
             - parse(data) -> OcelLog: a file checked against the format
               ("eventTypes", "objectTypes", "events", "objects"; ids
               unique, times in ISO 8601, relationships to existing
               objects, types declared when the file declares them);
               anything else is a ValidationError (400) naming the place
               in the file. Without "eventTypes"/"objectTypes" the types
               come from the events and objects.
             - to_tables(log) / from_tables(tables, types): the tables an
               "ocel_tables" object keeps in the storage - events,
               objects, event_objects (with the qualifier),
               object_objects and object_attributes (every value of an
               object attribute with its time, for the export: the
               objects table shows the first one) - and back.
             - to_json(log): the OCEL 2.0 JSON document. An attribute
               the file gives as null stays null (StoredTable.nulls).
             - parse_time(text): every time of the package is read with
               it ("Z" accepted on Python 3.10 too).
Project : soup-packages/ocel
------------------------------------------------------------------------
"""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from soup.core.contracts import ValidationError

Scalar = str | int | float | bool | None

# The time of an object attribute without one: the initial value.
EPOCH = "1970-01-01T00:00:00Z"

EVENTS = "events"
OBJECTS = "objects"
EVENT_OBJECTS = "event_objects"
OBJECT_OBJECTS = "object_objects"
OBJECT_ATTRIBUTES = "object_attributes"
TABLES = (EVENTS, OBJECTS, EVENT_OBJECTS, OBJECT_OBJECTS, OBJECT_ATTRIBUTES)

EVENT_COLUMNS = ("event_id", "event_type", "time")
OBJECT_COLUMNS = ("object_id", "object_type")
EVENT_OBJECT_COLUMNS = ("event_id", "event_type", "object_id", "object_type", "qualifier")
OBJECT_OBJECT_COLUMNS = ("source_id", "source_type", "target_id", "target_type", "qualifier")
OBJECT_ATTRIBUTE_COLUMNS = ("object_id", "attribute", "time", "value")


@dataclass(frozen=True)
class TypeDecl:
    name: str
    attributes: tuple[tuple[str, str], ...] = ()  # (name, type)


@dataclass(frozen=True)
class Relationship:
    object_id: str
    qualifier: str = ""


@dataclass(frozen=True)
class Event:
    id: str
    type: str
    time: str
    attributes: tuple[tuple[str, Scalar], ...] = ()  # (name, value)
    relationships: tuple[Relationship, ...] = ()


@dataclass(frozen=True)
class OcelObject:
    id: str
    type: str
    attributes: tuple[tuple[str, str, Scalar], ...] = ()  # (name, time, value)
    relationships: tuple[Relationship, ...] = ()


@dataclass(frozen=True)
class OcelLog:
    event_types: tuple[TypeDecl, ...]
    object_types: tuple[TypeDecl, ...]
    events: tuple[Event, ...]
    objects: tuple[OcelObject, ...]

    def events_per_type(self) -> dict[str, int]:
        return _per_type(self.event_types, (event.type for event in self.events))

    def objects_per_type(self) -> dict[str, int]:
        return _per_type(self.object_types, (obj.type for obj in self.objects))

    def counts(self) -> dict[str, int]:
        return {
            EVENTS: len(self.events),
            OBJECTS: len(self.objects),
            "event_types": len(self.event_types),
            "object_types": len(self.object_types),
            EVENT_OBJECTS: sum(len(event.relationships) for event in self.events),
            OBJECT_OBJECTS: sum(len(obj.relationships) for obj in self.objects),
        }


def _per_type(declared: Sequence[TypeDecl], types: Iterable[str]) -> dict[str, int]:
    """The count of every type, in the order of the declarations (types without items included)."""

    counter = Counter(types)
    return {decl.name: counter.get(decl.name, 0) for decl in declared}


# ---------------------------------------------------------------------- #
# Parsing
# ---------------------------------------------------------------------- #
def _fail(path: str, message: str) -> ValidationError:
    where = f"{path}: " if path else ""
    return ValidationError(f"Not a valid OCEL 2.0 JSON file: {where}{message}",
                           details={"phase": "OCEL parsing", "field": path})


def _object(value: Any, path: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise _fail(path, f"must be a JSON object, got {_json_type(value)}")
    return value


def _list(container: Mapping[str, Any], key: str, path: str, required: bool = False) -> list[Any]:
    if key not in container:
        if required:
            raise _fail(path, f"missing '{key}'")
        return []
    value = container[key]
    if not isinstance(value, list):
        raise _fail(_join(path, key), f"must be a list, got {_json_type(value)}")
    return value


def _text(container: Mapping[str, Any], key: str, path: str, default: str | None = None) -> str:
    if key not in container and default is not None:
        return default
    value = container.get(key)
    if not isinstance(value, str) or (default is None and not value.strip()):
        raise _fail(_join(path, key), f"must be a non-empty string, got {_describe(value)}")
    return value


def parse_time(text: str) -> datetime:
    """
    An ISO 8601 date and time. A final "Z" (UTC, as OCEL files write it)
    becomes "+00:00" first: datetime.fromisoformat reads "Z" only from
    Python 3.11. A "Z" anywhere else is refused here, since Python 3.10
    would read "...ZZ" once the last one is replaced.
    :raises ValueError: not an ISO 8601 date and time
    """

    utc = text.endswith(("Z", "z"))
    body = text[:-1] if utc else text
    if "z" in body.lower():
        raise ValueError(f"Invalid isoformat string: {text!r}")
    return datetime.fromisoformat(f"{body}+00:00" if utc else body)


def _time(container: Mapping[str, Any], key: str, path: str, default: str | None = None) -> str:
    value = _text(container, key, path, default)
    try:
        parse_time(value)
    except ValueError:
        raise _fail(_join(path, key), f"{value!r} is not an ISO 8601 date and time") from None
    return value


def _scalar(container: Mapping[str, Any], path: str) -> Scalar:
    value = container.get("value")
    if value is not None and not isinstance(value, (str, int, float, bool)):
        raise _fail(_join(path, "value"), f"must be a string, a number or a boolean, got {_json_type(value)}")
    return value


def _join(path: str, key: str | int) -> str:
    if isinstance(key, int):
        return f"{path}[{key}]"
    return f"{path}.{key}" if path else key


def _json_type(value: Any) -> str:
    return {dict: "an object", list: "a list", str: "a string", bool: "a boolean", type(None): "null"}.get(
        type(value), "a number"
    )


def _describe(value: Any) -> str:
    return repr(value) if isinstance(value, str) else _json_type(value)


def _types(root: Mapping[str, Any], key: str) -> tuple[TypeDecl, ...] | None:
    if key not in root:
        return None
    declared: list[TypeDecl] = []
    names: set[str] = set()
    for index, raw_item in enumerate(_list(root, key, "")):
        path = _join(key, index)
        item = _object(raw_item, path)
        name = _text(item, "name", path)
        if name in names:
            raise _fail(path, f"type {name!r} is declared twice")
        names.add(name)
        attributes = []
        for position, raw_attribute in enumerate(_list(item, "attributes", path)):
            attribute_path = _join(_join(path, "attributes"), position)
            attribute = _object(raw_attribute, attribute_path)
            attributes.append((_text(attribute, "name", attribute_path),
                _text(attribute, "type", attribute_path, "string")))
        declared.append(TypeDecl(name, tuple(attributes)))
    return tuple(declared)


def _relationships(item: Mapping[str, Any], path: str) -> tuple[Relationship, ...]:
    found = []
    for index, raw_relationship in enumerate(_list(item, "relationships", path)):
        relationship_path = _join(_join(path, "relationships"), index)
        relationship = _object(raw_relationship, relationship_path)
        found.append(Relationship(
            _text(relationship, "objectId", relationship_path),
            _text(relationship, "qualifier", relationship_path, ""),
        ))
    return tuple(found)


def _check_type(type_: str, declared: tuple[TypeDecl, ...] | None, path: str, key: str) -> None:
    if declared is not None and type_ not in {decl.name for decl in declared}:
        raise _fail(_join(path, "type"), f"type {type_!r} is not declared in '{key}'")


def _value_type(value: Scalar) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "float"
    return "string"


def _derived_types(items: Iterable[tuple[str, Iterable[tuple[str, Scalar]]]]) -> tuple[TypeDecl, ...]:
    """Types in order of first appearance, with the attributes seen on their items."""

    found: dict[str, dict[str, str]] = {}
    for type_, attributes in items:
        known = found.setdefault(type_, {})
        for name, value in attributes:
            known.setdefault(name, _value_type(value))
    return tuple(TypeDecl(name, tuple(attributes.items())) for name, attributes in found.items())


def _document(data: bytes) -> Mapping[str, Any]:
    try:
        root = json.loads(data.decode("utf-8-sig"))
    except UnicodeDecodeError as error:
        raise _fail("", f"not UTF-8 text ({error.reason} at byte {error.start})") from error
    except json.JSONDecodeError as error:
        failure = _fail("", f"not JSON (line {error.lineno}, column {error.colno}: {error.msg})")
        failure.details.update(line=error.lineno, column=error.colno)
        raise failure from error
    if not isinstance(root, dict):
        raise _fail("", f"the document must be a JSON object with 'events' and 'objects', got {_json_type(root)}")
    return root


def _unique_id(item: Mapping[str, Any], path: str, seen: set[str], what: str) -> str:
    identifier = _text(item, "id", path)
    if identifier in seen:
        raise _fail(_join(path, "id"), f"{what} {identifier!r} appears twice")
    seen.add(identifier)
    return identifier


def _object_attributes(item: Mapping[str, Any], path: str) -> tuple[tuple[str, str, Scalar], ...]:
    attributes = []
    for position, raw_attribute in enumerate(_list(item, "attributes", path)):
        attribute_path = _join(_join(path, "attributes"), position)
        attribute = _object(raw_attribute, attribute_path)
        attributes.append((
            _text(attribute, "name", attribute_path),
            _time(attribute, "time", attribute_path, EPOCH),
            _scalar(attribute, attribute_path),
        ))
    return tuple(attributes)


def _event_attributes(item: Mapping[str, Any], path: str) -> tuple[tuple[str, Scalar], ...]:
    attributes = []
    for position, raw_attribute in enumerate(_list(item, "attributes", path)):
        attribute_path = _join(_join(path, "attributes"), position)
        attribute = _object(raw_attribute, attribute_path)
        attributes.append((_text(attribute, "name", attribute_path), _scalar(attribute, attribute_path)))
    return tuple(attributes)


def _objects(root: Mapping[str, Any], declared: tuple[TypeDecl, ...] | None) -> tuple[list[OcelObject], set[str]]:
    objects: list[OcelObject] = []
    ids: set[str] = set()
    for index, raw_item in enumerate(_list(root, OBJECTS, "", required=True)):
        path = _join(OBJECTS, index)
        item = _object(raw_item, path)
        object_id = _unique_id(item, path, ids, "object")
        type_ = _text(item, "type", path)
        _check_type(type_, declared, path, "objectTypes")
        objects.append(OcelObject(object_id, type_, _object_attributes(item, path), _relationships(item, path)))
    return objects, ids


def _events(root: Mapping[str, Any], declared: tuple[TypeDecl, ...] | None) -> list[Event]:
    events: list[Event] = []
    ids: set[str] = set()
    for index, raw_item in enumerate(_list(root, EVENTS, "", required=True)):
        path = _join(EVENTS, index)
        item = _object(raw_item, path)
        event_id = _unique_id(item, path, ids, "event")
        type_ = _text(item, "type", path)
        _check_type(type_, declared, path, "eventTypes")
        events.append(Event(event_id, type_, _time(item, "time", path), _event_attributes(item, path),
                            _relationships(item, path)))
    return events


def _check_references(kind: str, items: Sequence[Event | OcelObject], object_ids: set[str]) -> None:
    for index, item in enumerate(items):
        for position, relationship in enumerate(item.relationships):
            if relationship.object_id not in object_ids:
                path = _join(_join(_join(kind, index), "relationships"), position)
                raise _fail(_join(path, "objectId"), f"object {relationship.object_id!r} is not among the objects")


def parse(data: bytes) -> OcelLog:
    """
    The OCEL 2.0 log in `data` (UTF-8 JSON).
    :raises ValidationError: not JSON, or not a conforming OCEL 2.0 document
    """

    root = _document(data)
    event_types = _types(root, "eventTypes")
    object_types = _types(root, "objectTypes")
    objects, object_ids = _objects(root, object_types)
    events = _events(root, event_types)
    _check_references(EVENTS, events, object_ids)
    _check_references(OBJECTS, objects, object_ids)
    if event_types is None:
        event_types = _derived_types((event.type, event.attributes) for event in events)
    if object_types is None:
        object_types = _derived_types(
            (obj.type, ((name, value) for name, _time_, value in obj.attributes)) for obj in objects
        )
    return OcelLog(event_types, object_types, tuple(events), tuple(objects))


# ---------------------------------------------------------------------- #
# Tables
# ---------------------------------------------------------------------- #
@dataclass(frozen=True)
class StoredTable:
    """
    A table as kept in the storage (JSON, so values keep their type).
    `attributes` maps the columns after `fixed` to the attribute names of
    the log: the columns are made unique, the names stay as in the file.
    An empty cell is an attribute the item does not have, unless it is
    among `nulls`, (row, attribute position) of the attributes the file
    gives with the value null.
    """

    columns: tuple[str, ...]
    rows: tuple[tuple[Scalar, ...], ...]
    attributes: tuple[str, ...] = ()
    fixed: int = 0
    nulls: tuple[tuple[int, int], ...] = ()

    def to_json(self) -> bytes:
        document: dict[str, Any] = {"columns": list(self.columns), "rows": [list(row) for row in self.rows]}
        if self.fixed:
            document["attributes"] = list(self.attributes)
            document["fixed"] = self.fixed
        if self.nulls:
            document["nulls"] = [list(cell) for cell in self.nulls]
        return json.dumps(document, ensure_ascii=False).encode("utf-8")

    @classmethod
    def from_json(cls, data: bytes) -> StoredTable:
        document = json.loads(data.decode("utf-8"))
        return cls(
            tuple(document["columns"]),
            tuple(tuple(row) for row in document["rows"]),
            tuple(document.get("attributes", ())),
            int(document.get("fixed", 0)),
            tuple((int(row), int(position)) for row, position in document.get("nulls", ())),
        )


def unique_columns(fixed: Sequence[str], names: Sequence[str]) -> tuple[str, ...]:
    """`fixed` then `names`, a name equal to an earlier column taking a suffix (_2, _3...)."""

    columns: list[str] = list(fixed)
    seen = set(columns)
    for base in names:
        name, suffix = base, 2
        while name in seen:
            name, suffix = f"{base}_{suffix}", suffix + 1
        seen.add(name)
        columns.append(name)
    return tuple(columns)


def _attribute_names(declared: Sequence[TypeDecl], seen: Iterable[str]) -> tuple[str, ...]:
    """The attribute names of the declarations, then the ones only found on the items."""

    return tuple(dict.fromkeys([*(name for decl in declared for name, _type in decl.attributes), *seen]))


def _first_values(obj: OcelObject) -> dict[str, Scalar]:
    """The value of every attribute at its earliest time (the first listed among equal times)."""

    first: dict[str, tuple[datetime, Scalar]] = {}
    for name, time, value in obj.attributes:
        when = _comparable(time)
        if name not in first or when < first[name][0]:
            first[name] = (when, value)
    return {name: value for name, (_when, value) in first.items()}


def _comparable(time: str) -> datetime:
    """Naive times count as UTC, so naive and aware times compare."""

    when = parse_time(time)
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def events_table(log: OcelLog, limit: int | None = None) -> StoredTable:
    """The events table (only the first `limit` rows, if given; the columns are those of every event)."""

    attributes = _attribute_names(log.event_types, (name for event in log.events for name, _value in event.attributes))
    rows = []
    nulls: list[tuple[int, int]] = []
    for index, event in enumerate(log.events[:limit]):
        values = dict(event.attributes)
        rows.append((event.id, event.type, event.time, *(values.get(name) for name in attributes)))
        nulls.extend(
            (index, position) for position, name in enumerate(attributes) if name in values and values[name] is None
        )
    return StoredTable(
        unique_columns(EVENT_COLUMNS, attributes), tuple(rows), attributes, len(EVENT_COLUMNS), tuple(nulls)
    )


def to_tables(log: OcelLog) -> dict[str, StoredTable]:
    object_attributes = _attribute_names(
        log.object_types, (name for obj in log.objects for name, _time, _value in obj.attributes)
    )
    type_of = {obj.id: obj.type for obj in log.objects}

    object_rows = []
    for obj in log.objects:
        values = _first_values(obj)
        object_rows.append((obj.id, obj.type, *(values.get(name) for name in object_attributes)))

    return {
        EVENTS: events_table(log),
        OBJECTS: StoredTable(
            unique_columns(OBJECT_COLUMNS, object_attributes),
                tuple(object_rows), object_attributes, len(OBJECT_COLUMNS)
        ),
        EVENT_OBJECTS: StoredTable(EVENT_OBJECT_COLUMNS, tuple(
            (event.id, event.type, link.object_id, type_of[link.object_id], link.qualifier)
            for event in log.events for link in event.relationships
        )),
        OBJECT_OBJECTS: StoredTable(OBJECT_OBJECT_COLUMNS, tuple(
            (obj.id, obj.type, link.object_id, type_of[link.object_id], link.qualifier)
            for obj in log.objects for link in obj.relationships
        )),
        OBJECT_ATTRIBUTES: StoredTable(OBJECT_ATTRIBUTE_COLUMNS, tuple(
            (obj.id, name, time, value) for obj in log.objects for name, time, value in obj.attributes
        )),
    }


def types_document(log: OcelLog) -> dict[str, Any]:
    """The "eventTypes" and "objectTypes" of the OCEL 2.0 JSON."""

    def declarations(declared: Sequence[TypeDecl]) -> list[dict[str, Any]]:
        return [
            {"name": decl.name, "attributes": [{"name": name, "type": type_} for name, type_ in decl.attributes]}
            for decl in declared
        ]

    return {"eventTypes": declarations(log.event_types), "objectTypes": declarations(log.object_types)}


def _grouped(rows: Iterable[Sequence[Scalar]], key: int) -> dict[Any, list[Sequence[Scalar]]]:
    groups: dict[Any, list[Sequence[Scalar]]] = {}
    for row in rows:
        groups.setdefault(row[key], []).append(row)
    return groups


def from_tables(tables: Mapping[str, StoredTable], types: Mapping[str, Any]) -> OcelLog:
    """The log kept as tables by to_tables (and types_document), as it was parsed."""

    def declarations(key: str) -> tuple[TypeDecl, ...]:
        return tuple(
            TypeDecl(item["name"], tuple((attribute["name"], attribute["type"]) for attribute in item["attributes"]))
            for item in types[key]
        )

    links = _grouped(tables[EVENT_OBJECTS].rows, 0)
    object_links = _grouped(tables[OBJECT_OBJECTS].rows, 0)
    history = _grouped(tables[OBJECT_ATTRIBUTES].rows, 0)

    stored = tables[EVENTS]
    nulls = set(stored.nulls)
    events = tuple(
        Event(
            str(row[0]), str(row[1]), str(row[2]),
            tuple(
                (name, value)
                for position, (name, value) in enumerate(zip(stored.attributes, row[stored.fixed:], strict=False))
                if value is not None or (index, position) in nulls
            ),
            tuple(Relationship(str(link[2]), str(link[4])) for link in links.get(row[0], ())),
        )
        for index, row in enumerate(stored.rows)
    )
    objects = tuple(
        OcelObject(
            str(row[0]), str(row[1]),
            tuple((str(item[1]), str(item[2]), item[3]) for item in history.get(row[0], ())),
            tuple(Relationship(str(link[2]), str(link[4])) for link in object_links.get(row[0], ())),
        )
        for row in tables[OBJECTS].rows
    )
    return OcelLog(declarations("eventTypes"), declarations("objectTypes"), events, objects)


def _relationships_json(relationships: Sequence[Relationship]) -> list[dict[str, str]]:
    return [{"objectId": link.object_id, "qualifier": link.qualifier} for link in relationships]


def to_json(log: OcelLog) -> dict[str, Any]:
    """The OCEL 2.0 JSON document of `log`."""

    return {
        **types_document(log),
        OBJECTS: [
            {
                "id": obj.id,
                "type": obj.type,
                "attributes": [{"name": name, "time": time, "value": value} for name, time, value in obj.attributes],
                "relationships": _relationships_json(obj.relationships),
            }
            for obj in log.objects
        ],
        EVENTS: [
            {
                "id": event.id,
                "type": event.type,
                "time": event.time,
                "attributes": [{"name": name, "value": value} for name, value in event.attributes],
                "relationships": _relationships_json(event.relationships),
            }
            for event in log.events
        ],
    }
