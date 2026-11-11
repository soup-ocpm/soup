"""
------------------------------------------------------------------------
File : graph.py
Description: The OCEL 2.0 log as an EKG on Memgraph, through the ekg
             package (build_ekg, dispose):
             - event_log_data(log): the separated form of EventLogData
               with a fixed mapping - the id, the time (in UTC, without
               the offset, as localDateTime reads it) and the type of
               each event as event id, timestamp and activity; the object
               types as entity types (the ekg package adds one column per
               type and links the events to their objects); the event
               attributes as :Event properties (a name equal to a
               reserved one or to an object type takes a suffix);
             - relationship_files(log): the qualifiers of the
               event-object relationships and the object-object
               relationships as the two files the build step of ocel
               (step.py) reads, staged with the dataset (build_ekg's
               extra_files) - with the ids and types as the ekg package
               writes them in the graph (normalize_text); the meta
               counts what entered the graph (ocel.in_graph);
             - OcelEkgImporter ("ekg", "OCEL 2.0 come EKG su Memgraph").
             - DecomposeToEkg ("to_ekg", "Scomponi in EKG"): the same, from
               an "ocel_tables" object (read through the plugin's cache);
               the "ekg" object is its child.
             - OcelRelationshipsNotice, contributed to
               "ekg.stats_notices": the Statistiche of an EKG made from an
               OCEL log before its relationships entered the graph (no
               files in its dataset) say how to get them.
Project : soup-packages/ocel
------------------------------------------------------------------------
"""

from __future__ import annotations

import csv
import io
import json
import re
from collections.abc import Iterable, Mapping, Sequence
from datetime import timezone
from typing import Any, cast

import soup_pkg_ekg.api as ekg
from soup_pkg_ekg.api import EKG_KIND, ColumnMapping, EventLogData, Query, Table, build_ekg, dispose, normalize_text
from soup_pkg_ekg_views.api import StatsNotice

from soup.core.contracts import ObjectDraft, ObjectRef, Operation, OperationInput, ToolAccess, Upload

from .model import OcelLog, Scalar, parse, parse_time
from .step import FILES, OBJECT_OBJECTS_COLUMNS, OBJECT_OBJECTS_FILE, QUALIFIERS_COLUMNS, QUALIFIERS_FILE
from .store import FORMAT_ID, MEMGRAPH, STORAGE, TABLES_KIND, OcelImporterBase, extension_of
from .tables_cache import CachedTables

EVENT_ID, ACTIVITY, TIMESTAMP = "ocel:eid", "ocel:activity", "ocel:timestamp"
# The columns of the canonical events CSV and the properties of the :Event
# nodes written by the ekg package: an attribute cannot take these names.
_RESERVED = {EVENT_ID, ACTIVITY, TIMESTAMP,
    "event_id", "timestamp", "activity_name", "Event_Id", "Timestamp", "ActivityName"}
_WHITESPACE = re.compile(r"\s+")

QUALIFIED_CORR = Query("MATCH (:Event)-[c:CORR]->(:Entity) WHERE c.qualifier IS NOT NULL RETURN count(c) AS count")
REL = Query("MATCH (:Entity)-[r:REL]->(:Entity) RETURN count(r) AS count")


def _normalized(name: str) -> str:
    """How the ekg package names a column (spaces collapsed into "_")."""

    return _WHITESPACE.sub("_", name.strip())


def graph_time(value: str) -> str:
    """An ISO 8601 time as localDateTime reads it: UTC, no offset, milliseconds."""

    when = parse_time(value)
    if when.tzinfo is not None:
        when = when.astimezone(timezone.utc).replace(tzinfo=None)
    return when.isoformat(timespec="milliseconds")


def _text(value: Scalar) -> Any:
    if value is None or isinstance(value, str):
        return value
    return json.dumps(value)


def attribute_columns(log: OcelLog) -> dict[str, str]:
    """Attribute name -> its column in the events table, never a reserved name nor an object type."""

    names = dict.fromkeys(
        [name for decl in log.event_types for name, _type in decl.attributes]
        + [name for event in log.events for name, _value in event.attributes]
    )
    taken = {_normalized(name) for name in _RESERVED} | {_normalized(decl.name) for decl in log.object_types}
    columns: dict[str, str] = {}
    for name in names:
        column, suffix = name, 1
        while _normalized(column) in taken:
            column = f"{name}_attribute" if suffix == 1 else f"{name}_attribute_{suffix}"
            suffix += 1
        taken.add(_normalized(column))
        columns[name] = column
    return columns


def event_log_data(log: OcelLog) -> tuple[EventLogData, ColumnMapping]:
    columns = attribute_columns(log)
    rows = []
    for event in log.events:
        values = dict(event.attributes)
        rows.append((event.id, event.type, graph_time(event.time), *(_text(values.get(name)) for name in columns)))
    events = Table((EVENT_ID, ACTIVITY, TIMESTAMP, *columns.values()), tuple(rows))
    objects = Table(("object_id", "object_type"), tuple((obj.id, obj.type) for obj in log.objects))
    event_objects = Table(
        ("event_id", "object_id", "qualifier"),
        tuple((event.id, link.object_id, link.qualifier) for event in log.events for link in event.relationships),
    )
    mapping = ColumnMapping(
        event_id=EVENT_ID, timestamp=TIMESTAMP, activity=ACTIVITY, value_columns=tuple(columns.values()),
    )
    return EventLogData(events=events, objects=objects, event_objects=event_objects), mapping


def _csv(columns: Sequence[str], rows: Iterable[Sequence[str]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(columns)
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def relationship_files(log: OcelLog) -> dict[str, bytes]:
    """
    The two files of the build step (step.py). A link of an event to an
    object with several qualifiers keeps the first one (its :CORR is one);
    an object-object relationship repeated with the same qualifier is one.
    """

    type_of = {obj.id: obj.type for obj in log.objects}
    qualifiers: dict[tuple[str, str, str], str] = {}
    for event in log.events:
        for link in event.relationships:
            if link.qualifier:
                object_id, object_type = link.object_id, type_of[link.object_id]
                key = (normalize_text(event.id), normalize_text(object_id), normalize_text(object_type))
                qualifiers.setdefault(key, link.qualifier)
    object_objects = dict.fromkeys(
        (normalize_text(obj.id), normalize_text(obj.type), normalize_text(link.object_id),
         normalize_text(type_of[link.object_id]), link.qualifier)
        for obj in log.objects for link in obj.relationships
    )
    return {
        QUALIFIERS_FILE: _csv(QUALIFIERS_COLUMNS, [(*key, qualifier) for key, qualifier in qualifiers.items()]),
        OBJECT_OBJECTS_FILE: _csv(OBJECT_OBJECTS_COLUMNS, object_objects),
    }


def _count(db: ekg.GraphDatabase, query: Query) -> int:
    rows = db.run(query)
    return int(rows[0]["count"]) if rows else 0


def ocel_meta(log: OcelLog, extension: str, tools: ToolAccess) -> dict[str, Any]:
    """What an "ekg" made from an OCEL log adds to the meta of build_ekg (its graph is the active one)."""

    db = cast(ekg.GraphDatabase, tools.get(MEMGRAPH))
    return {
        "ocel": {
            "extension": extension,
            "counts": log.counts(),
            "qualified_event_objects": sum(1 for event in log.events for link in event.relationships if link.qualifier),
            "in_graph": {"qualified_corr": _count(db, QUALIFIED_CORR), "rel": _count(db, REL)},
        },
    }


def build(obj: Any, log: OcelLog, extension: str, tools: ToolAccess) -> dict[str, Any]:
    data, mapping = event_log_data(log)
    meta = build_ekg(obj, data, mapping, tools, source_format=FORMAT_ID, extra_files=relationship_files(log))
    return {**meta, **ocel_meta(log, extension, tools)}


class OcelEkgImporter(OcelImporterBase):
    id = "ekg"
    label = "OCEL 2.0 as EKG on Memgraph"
    description = (
        "Convert the log to an EKG on Memgraph: each event's id, time and type, object types as entity types, "
        "and event attributes as properties. Event-object qualifiers become qualifier properties on :CORR; "
        "object-object relationships become :REL between entities, preserving their qualifiers."
    )
    produces = EKG_KIND
    requires_tools = (MEMGRAPH, STORAGE)

    def import_(self, upload: Upload, obj: ObjectRef, options: Mapping[str, Any], tools: ToolAccess) -> dict[str, Any]:
        log = parse(upload.read())
        return {**build(obj, log, extension_of(upload.filename), tools), "filename": upload.filename}

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        dispose(obj, tools)


OLD_EKG_NOTICE = (
    "This EKG was imported before OCEL 2.0 qualifiers and object-object relationships were supported. It has no"
    " :CORR qualifiers or :REL relationships. Reimport the file using \"OCEL 2.0 as EKG on Memgraph\" or run "
    "\"Convert to EKG\" on its tables to include them."
)


class OcelRelationshipsNotice(StatsNotice):
    """The notice of an EKG from an OCEL log whose dataset has not the files of the build step."""

    key = "ocel_relationships"

    def notice(self, obj: ObjectRef, tools: ToolAccess) -> str | None:
        root = ekg.root_of(obj)
        dataset = root.meta.get("dataset")
        if root.meta.get("source_format") != FORMAT_ID or not dataset:
            return None
        repository = ekg.DatasetRepository(cast(ekg.StorageSpaceTool, tools.get(STORAGE)))
        if all(repository.has_extra_file(str(dataset), file) for file in FILES):
            return None
        return OLD_EKG_NOTICE


class DecomposeToEkg(CachedTables, Operation):
    id = "to_ekg"
    label = "Convert to EKG"
    description = (
        "Build an EKG from the OCEL tables on Memgraph, preserving :CORR qualifiers and object-object "
        "relationships as :REL between entities, as with the OCEL 2.0 EKG importer."
    )
    group = "EKG"
    inputs = (OperationInput("tables", (TABLES_KIND,)),)
    produces = (EKG_KIND,)
    requires_tools = (MEMGRAPH, STORAGE)

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:
        source = inputs["tables"]
        log = self._tables(source, tools).log()
        extension = extension_of(str(source.meta.get("filename") or ""))
        draft = ObjectDraft(name=f"{source.name[:120].rstrip()} (EKG)", kind=EKG_KIND, description=source.description)
        draft.meta = build(draft, log, extension, tools)
        return [draft]

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        dispose(obj, tools)
