"""
------------------------------------------------------------------------
File : tables.py
Description: The contributions of ocel for objects of kind "ocel_tables"
             (the log kept as tables in the package's storage space, see
             store.py), with the standard library and the "storage" tool
             only - no pandas, no Memgraph. The visualizers and the
             exporter read the tables through the plugin's ParsedCache
             (tables_cache.CachedTables): the files of an object are read once;
             import_() and dispose() invalidate its entry.
             - OcelTablesImporter ("tables", "OCEL 2.0 come tabelle"):
               events, objects, event-object relationships (with their
               qualifier) and object-object relationships saved as
               tables.
             - OcelTablesVisualizer ("tables", "Tabelle OCEL",
               <soup-pkg-ocel-tables>): one tab per table; action("page")
               {table, offset, limit, type, search, sort} gives a page
               filtered by type (event type for the events, object type
               otherwise), searched and sorted on the server.
             - OcelSummaryVisualizer ("summary", "Riepilogo OCEL",
               <soup-pkg-ocel-summary>): the counts and the events per
               type, from the meta.
             - OcelJsonExporter ("json", "OCEL 2.0 JSON"): the log
               written back from the tables, with the extension of the
               imported file (.json or .jsonocel, Exporter.file_type of
               contracts "4.1").
Project : soup-packages/ocel
------------------------------------------------------------------------
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from soup.core.contracts import Exporter, NotFoundError, ObjectRef, ToolAccess, Upload, ValidationError, Visualizer

from .model import EVENT_OBJECTS, EVENTS, OBJECT_OBJECTS, OBJECTS, Scalar, parse, to_json
from .store import (
    DEFAULT_EXTENSION,
    EXTENSIONS,
    STORAGE,
    TABLES_KIND,
    OcelImporterBase,
    dispose_tables,
    import_meta,
    save_tables,
)
from .tables_cache import CachedTables

PAGE_SIZE = 25
MAX_PAGE_SIZE = 500
SORT_DIRECTIONS = ("asc", "desc")
JSON_MIME = "application/json"

# The tabs of "Tabelle OCEL": (table, label, columns compared with the
# "type" filter, label of the filter, the kind of types it offers).
TABS = (
    (EVENTS, "Events", (1,), "Event type", "event"),
    (OBJECTS, "Objects", (1,), "Object type", "object"),
    (EVENT_OBJECTS, "Event-object relationships", (3,), "Object type", "object"),
    (OBJECT_OBJECTS, "Object-object relationships", (1, 3), "Object type", "object"),
)
_TYPE_COLUMNS = {key: columns for key, _label, columns, _filter, _types in TABS}


class OcelTablesImporter(CachedTables, OcelImporterBase):
    id = "tables"
    label = "OCEL 2.0 as tables"
    description = (
        "Store events, objects, qualified event-object relationships and object-object relationships as tables "
        "without Memgraph. They can later be converted to an EKG."
    )
    produces = TABLES_KIND
    requires_tools = (STORAGE,)

    def import_(self, upload: Upload, obj: ObjectRef, options: Mapping[str, Any], tools: ToolAccess) -> dict[str, Any]:
        log = parse(upload.read())
        save_tables(obj, log, tools)
        # Every write of the tables invalidates what was read before.
        self.cache.invalidate(obj.id)
        return import_meta(log, upload.filename)

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        self.cache.invalidate(obj.id)
        dispose_tables(obj, tools)


def _int(params: Mapping[str, Any], name: str, default: int, low: int, high: int) -> int:
    value = params.get(name, default)
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int) or value < low:
        raise ValidationError(f"'{name}' must be an integer of at least {low}, got {value!r}")
    return min(value, high)


def _optional_text(params: Mapping[str, Any], name: str) -> str:
    value = params.get(name)
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValidationError(f"'{name}' must be a string, got {value!r}")
    return value


def _sort(params: Mapping[str, Any], width: int) -> tuple[int, bool] | None:
    """(column, descending) from {column, direction}, or None."""

    value = params.get("sort")
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise ValidationError("'sort' must be {column, direction}")
    column, direction = value.get("column"), value.get("direction", "asc")
    if isinstance(column, bool) or not isinstance(column, int) or not 0 <= column < width:
        raise ValidationError(f"'sort.column' must be a column index between 0 and {width - 1}, got {column!r}")
    if direction not in SORT_DIRECTIONS:
        raise ValidationError(f"'sort.direction' must be one of {list(SORT_DIRECTIONS)}, got {direction!r}")
    return column, direction == "desc"


def _sort_key(value: Scalar) -> tuple[int, Any]:
    """Numbers before text, empty cells last (in both directions they stay together)."""

    if value is None:
        return (2, "")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return (0, value)
    return (1, str(value).lower())


def _cell_text(value: Scalar) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def page(rows: Sequence[Sequence[Scalar]], table: str, params: Mapping[str, Any], width: int) -> dict[str, Any]:
    """The page of `rows` asked by `params` (offset, limit, type, search, sort) and the total after filtering."""

    offset = _int(params, "offset", 0, 0, max(len(rows), 0))
    limit = _int(params, "limit", PAGE_SIZE, 1, MAX_PAGE_SIZE)
    type_ = _optional_text(params, "type")
    search = _optional_text(params, "search").strip().lower()
    order = _sort(params, width)

    selected = list(rows)
    if type_:
        columns = _TYPE_COLUMNS[table]
        selected = [row for row in selected if any(row[column] == type_ for column in columns)]
    if search:
        selected = [row for row in selected if any(search in _cell_text(cell).lower() for cell in row)]
    if order is not None:
        column, descending = order
        present = [row for row in selected if row[column] is not None]
        empty = [row for row in selected if row[column] is None]
        selected = sorted(present, key=lambda row: _sort_key(row[column]), reverse=descending) + empty
    return {"rows": [list(row) for row in selected[offset:offset + limit]], "total": len(selected)}


class OcelTablesVisualizer(CachedTables, Visualizer):
    id = "tables"
    label = "OCEL tables"
    accepts = (TABLES_KIND,)
    element = "soup-pkg-ocel-tables"
    requires_tools = (STORAGE,)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        types = {
            "event": list(obj.meta.get("events_per_type") or {}),
            "object": list(obj.meta.get("objects_per_type") or {}),
        }
        counts = obj.meta.get("counts") or {}
        stored = self._tables(obj, tools)
        tabs = []
        for key, label, _columns, type_label, type_kind in TABS:
            tabs.append({
                "key": key,
                "label": label,
                "columns": list(stored.table(key).columns),
                "total": counts.get(key, 0),
                "type_label": type_label,
                "types": types[type_kind],
            })
        return {"page_size": PAGE_SIZE, "tables": tabs}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name != "page":
            raise NotFoundError(f"Visualizer '{self.id}' has no action '{name}'")
        table = params.get("table")
        if table not in _TYPE_COLUMNS:
            raise ValidationError(f"'table' must be one of {list(_TYPE_COLUMNS)}, got {table!r}")
        stored = self._tables(obj, tools).table(table)
        return page(stored.rows, table, params, len(stored.columns))


class OcelSummaryVisualizer(Visualizer):
    id = "summary"
    label = "OCEL summary"
    accepts = (TABLES_KIND,)
    element = "soup-pkg-ocel-summary"

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        counts = obj.meta.get("counts") or {}
        return {
            "counts": {key: int(counts.get(key, 0)) for key in (
                "events", "objects", "event_types", "object_types", "event_objects", "object_objects",
            )},
            "events_per_type": dict(obj.meta.get("events_per_type") or {}),
            "objects_per_type": dict(obj.meta.get("objects_per_type") or {}),
        }


class OcelJsonExporter(CachedTables, Exporter):
    """The log as OCEL 2.0 JSON, named with the extension of the imported file."""

    id = "json"
    label = "OCEL 2.0 JSON"
    accepts = (TABLES_KIND,)
    extension = DEFAULT_EXTENSION
    mime = JSON_MIME
    requires_tools = (STORAGE,)

    def file_type(self, obj: ObjectRef, params: Mapping[str, Any]) -> tuple[str, str]:
        extension = obj.meta.get("extension")
        return (extension if extension in EXTENSIONS else DEFAULT_EXTENSION), JSON_MIME

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> bytes:
        return json.dumps(to_json(self._tables(obj, tools).log()), ensure_ascii=False, indent=2).encode("utf-8")
