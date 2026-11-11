"""
------------------------------------------------------------------------
File : contributions.py
Description: The contributions of csv_table, for objects of kind "table"
             (the table kept as a canonical CSV - UTF-8, comma, header - in
             the package's storage space, storage.space("csv_table")):
             - CsvTableImporter ("csv"): .csv and .tsv files; separator
               and header guessed by csv.Sniffer, chosen by the user.
             - CsvTableVisualizer ("table"): <soup-pkg-csv-table-viewer>,
               remote paging with action("page") - sorting, a filter per
               column and a search over all of them - like ProM's
               CSVViewer.
             - CsvProfileVisualizer ("profile"): <soup-pkg-csv-profile>,
               distinct values, empty cells and examples per column;
               action("distribution") for the chart of one column.
             - ColumnDistribution ("distribution"): table -> report with
               a bar chart and a table of the values of one column.
             - CsvExporter ("csv"): the table with the chosen separator,
               with or without the header; with the tab separator the
               file is a .tsv (text/tab-separated-values, file_type).
             Every contribution reads the tables through the same
             ParsedCache (soup_base's, soup_pkg_soup_base.api), created by the Plugin: the actions do
             not read and parse the file again at every page; import_()
             and dispose() invalidate the object's entry.
             Standard library and the "storage" tool only.
Project : soup-packages/csv_table
------------------------------------------------------------------------
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any, cast

from soup_pkg_soup_base.api import DEFAULT_MAX_BYTES, DEFAULT_MAX_OBJECTS, ParsedCache
from soup_pkg_tool_storage.api import StorageSpace, StorageTool

from soup.core.contracts import (
    Choice,
    Exporter,
    Field,
    Importer,
    Inspection,
    NotFoundError,
    ObjectDraft,
    ObjectRef,
    Operation,
    OperationInput,
    ToolAccess,
    Upload,
    ValidationError,
    Visualizer,
    import_phase,
    report,
)

from . import table

KIND = "table"
NAMESPACE = "csv_table"
STORAGE = "storage"

PREVIEW_ROWS = 20
PAGE_SIZE = 25
MAX_PAGE_SIZE = 500
DEFAULT_TOP = 20
MAX_TOP = 50

# The values of the "separator" field are names, not the characters: the
# core treats a whitespace-only value as missing, so "\t" could never be
# chosen.
SEPARATOR_NAMES = {"comma": table.COMMA, "semicolon": table.SEMICOLON, "tab": table.TAB}
SEPARATOR_CHOICES = (
    Choice("comma", "Comma"),
    Choice("semicolon", "Semicolon"),
    Choice("tab", "Tab"),
)


def read_table(obj: ObjectRef, tools: ToolAccess) -> tuple[list[str], list[table.Row]]:
    """
    The columns and rows of a "table" object imported by csv_table, read
    from the storage (not from a plugin's cache). `tools` must give the
    "storage" tool.
    :raises ValidationError: `obj` is not a table
    :raises NotFoundError: its file is missing
    """

    if obj.kind != KIND:
        raise ValidationError(f"Object '{obj.name}' is a {obj.kind!r}, not a {KIND!r}")
    return table.read_canonical(_space(tools).read(_file_of(obj)))


def separator_name(separator: str) -> str:
    return next(name for name, char in SEPARATOR_NAMES.items() if char == separator)


def separator_char(value: Any) -> str:
    """The character of a separator name (the characters themselves are accepted too)."""

    if not isinstance(value, str):
        raise ValidationError("Choose a single CSV separator", details={
            "phase": "CSV options", "field": "separator", "value_type": type(value).__name__,
        })
    if value in SEPARATOR_NAMES:
        return SEPARATOR_NAMES[value]
    if value in table.SEPARATORS:
        return value
    raise ValidationError(f"Unknown separator {value!r}; expected one of {sorted(SEPARATOR_NAMES)}")


def _separator_field(default: str) -> Field:
    # Not required: when missing, the core fills in the default.
    return Field("separator", "Separator", type="select", default=default, choices=SEPARATOR_CHOICES)


def _space(tools: ToolAccess) -> StorageSpace:
    return cast(StorageTool, tools.get(STORAGE)).space(NAMESPACE)


def _file_of(obj: ObjectRef) -> str:
    return f"{obj.id}.csv"


# A parsed table as kept in the cache: shared by concurrent requests, so
# immutable (tuples of strings).
Parsed = tuple[tuple[str, ...], tuple[tuple[str, ...], ...]]


def _parsed_size(value: Parsed) -> int:
    return table.estimated_size(*value)


def new_cache(max_objects: int = DEFAULT_MAX_OBJECTS, max_bytes: int = DEFAULT_MAX_BYTES) -> ParsedCache[Parsed]:
    return ParsedCache(_parsed_size, max_objects=max_objects, max_bytes=max_bytes)


class _Cached:
    """Base of the contributions that read the stored tables through a ParsedCache."""

    def __init__(self, cache: ParsedCache[Parsed] | None = None):
        self.cache = cache if cache is not None else new_cache()

    def _load(self, obj: ObjectRef, tools: ToolAccess) -> tuple[list[str], Sequence[Sequence[str]]]:
        def read() -> Parsed:
            columns, rows = table.read_canonical(_space(tools).read(_file_of(obj)))
            return tuple(columns), tuple(tuple(row) for row in rows)

        columns, rows = self.cache.get(obj.id, read)
        return list(columns), rows


def _options(text: str, filename: str, options: Mapping[str, Any]) -> tuple[str, bool]:
    guess = table.sniff(text, filename)
    raw = options.get("separator")
    separator = guess.separator if raw is None or raw == "" else separator_char(raw)
    # Import options do not go through the core's field validation.
    header = options.get("header")
    if header is None or header == "":
        return separator, guess.header
    if isinstance(header, str):
        if header.strip().lower() not in ("true", "false", "1", "0"):
            raise ValidationError(f"'header' must be true or false, got {header!r}")
        return separator, header.strip().lower() in ("true", "1")
    return separator, bool(header)


def _parsed(upload: Upload, options: Mapping[str, Any]) -> tuple[list[str], list[table.Row], str, bool, str]:
    with import_phase("CSV parsing", hint="Check the delimiter, quoting, header and file encoding."):
        text, encoding = table.decode(upload.read())
        separator, header = _options(text, upload.filename, options)
        columns, rows = table.parse(text, separator, header)
    selected = options.get("columns")
    if selected is not None:
        with import_phase("column mapping"):
            if not isinstance(selected, list) or not selected or any(
                not isinstance(name, str) or name not in columns for name in selected
            ):
                raise ValidationError("Select at least one existing column to keep.")
            indices = [index for index, name in enumerate(columns) if name in selected]
            columns = [columns[index] for index in indices]
            rows = [[row[index] for index in indices] for row in rows]
    return columns, rows, separator, header, encoding


def _preview(columns: list[str], rows: list[table.Row]) -> dict[str, Any]:
    return report.table(columns, rows[:PREVIEW_ROWS], total=len(rows), title=f"First {PREVIEW_ROWS} rows")


def _int(value: Any, name: str, default: int, low: int, high: int) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        raise ValidationError(f"'{name}' must be an integer")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"'{name}' must be an integer, got {value!r}") from None
    return min(max(number, low), high)


def _column(value: Any, columns: list[str], name: str = "column") -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value < len(columns):
        raise ValidationError(f"'{name}' must be the index of a column (0-{len(columns) - 1}), got {value!r}")
    return value


def _sort(value: Any, columns: list[str]) -> tuple[int, str] | None:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise ValidationError("'sort' must be {column, direction} or null")
    direction = value.get("direction", "asc")
    if direction not in table.SORT_DIRECTIONS:
        raise ValidationError(f"'sort.direction' must be one of {table.SORT_DIRECTIONS}, got {direction!r}")
    return _column(value.get("column"), columns, "sort.column"), direction


def _filters(value: Any, columns: list[str]) -> list[tuple[int, str]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValidationError("'filter' must be a list of {column, value}")
    filters = []
    for item in value:
        if not isinstance(item, Mapping) or not isinstance(item.get("value", ""), str):
            raise ValidationError("Each filter must be {column, value} with a text value")
        filters.append((_column(item.get("column"), columns, "filter.column"), item.get("value", "")))
    return filters


def _object_name(text: str) -> str:
    """`text` made acceptable as an object name (no separators, "..", control characters)."""

    cleaned = re.sub(r"[\\/\x00-\x1f\x7f]", " ", text).replace("..", ".")
    return cleaned.strip().lstrip("_").strip()[:128].strip() or "distribution"


class CsvTableImporter(_Cached, Importer):
    id = "csv"
    label = "CSV as table"
    description = (
        "Reads the file with Python's csv module and keeps it as a table "
        "(separator and header of your choice)."
    )
    extensions = (".csv", ".tsv")
    produces = KIND
    requires_tools = (STORAGE,)

    def inspect(self, upload: Upload, tools: ToolAccess) -> Inspection:
        columns, rows, separator, header, _ = _parsed(upload, {})
        return Inspection(
            preview=(_preview(columns, rows),),
            fields=(
                Field("columns", "Property", type="columns", default=columns,
                      choices=cast("tuple[Choice, ...]", columns)),
                _separator_field(separator_name(separator)),
                Field("header", "Header row", type="bool", default=header,
                      help="The first row contains column names."),
            ),
        )

    def preview(self, upload: Upload, options: Mapping[str, Any], tools: ToolAccess) -> list[dict[str, Any]]:
        columns, rows, *_ = _parsed(upload, {key: value for key, value in options.items() if key != "columns"})
        return [_preview(columns, rows)]

    def import_(self, upload: Upload, obj: ObjectRef, options: Mapping[str, Any], tools: ToolAccess) -> dict[str, Any]:
        columns, rows, separator, header, encoding = _parsed(upload, options)
        _space(tools).write(_file_of(obj), table.write_csv(columns, rows))
        # Every write of the file invalidates what was read before.
        self.cache.invalidate(obj.id)
        return {
            "filename": upload.filename,
            "file": _file_of(obj),
            "columns": columns,
            "rows": len(rows),
            "separator": separator_name(separator),
            "header": header,
            "encoding": encoding,
        }

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        # Also called after a failed import_(): the file may not exist.
        self.cache.invalidate(obj.id)
        space = _space(tools)
        if space.exists(_file_of(obj)):
            space.delete(_file_of(obj))


class CsvTableVisualizer(_Cached, Visualizer):
    id = "table"
    label = "CSV table"
    accepts = (KIND,)
    element = "soup-pkg-csv-table-viewer"
    requires_tools = (STORAGE,)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        columns, rows = self._load(obj, tools)
        return {"columns": columns, "total": len(rows), "page_size": PAGE_SIZE}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name != "page":
            raise NotFoundError(f"Visualizer '{self.id}' has no action '{name}'")
        columns, rows = self._load(obj, tools)
        search = params.get("search") or ""
        if not isinstance(search, str):
            raise ValidationError("'search' must be a text")
        return table.page(
            rows,
            offset=_int(params.get("offset"), "offset", 0, 0, len(rows)),
            limit=_int(params.get("limit"), "limit", PAGE_SIZE, 1, MAX_PAGE_SIZE),
            sort=_sort(params.get("sort"), columns),
            filters=_filters(params.get("filter"), columns),
            search=search,
        )


class CsvProfileVisualizer(_Cached, Visualizer):
    id = "profile"
    label = "Column profile"
    accepts = (KIND,)
    element = "soup-pkg-csv-profile"
    requires_tools = (STORAGE,)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        columns, rows = self._load(obj, tools)
        return {"rows": len(rows), "columns": table.profile(columns, rows)}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name != "distribution":
            raise NotFoundError(f"Visualizer '{self.id}' has no action '{name}'")
        columns, rows = self._load(obj, tools)
        column = _column(params.get("column"), columns)
        top = _int(params.get("top"), "top", DEFAULT_TOP, 1, MAX_TOP)
        return {"column": columns[column], **table.distribution(rows, column, top)}


class ColumnDistribution(_Cached, Operation):
    id = "distribution"
    label = "Column distribution"
    description = "Counts the values of one column: a report with a bar chart and a table."
    group = "Tables"
    inputs = (OperationInput("table", (KIND,)),)
    produces = (report.REPORT,)
    requires_tools = (STORAGE,)

    def fields(self, inputs: Mapping[str, ObjectRef], tools: ToolAccess) -> list[Field]:
        columns = [str(name) for name in inputs["table"].meta.get("columns") or []]
        return [
            Field("column", "Column", type="column", required=True, choices=cast("tuple[Choice, ...]", columns)),
            Field("top", "Values shown", type="number", default=DEFAULT_TOP,
                  help=f"The most frequent values (at most {MAX_TOP}); the others are summed."),
        ]

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:
        source = inputs["table"]
        columns, rows = self._load(source, tools)
        name = params.get("column")
        if name not in columns:
            raise ValidationError(f"Unknown column {name!r}")
        top = _int(params.get("top"), "top", DEFAULT_TOP, 1, MAX_TOP)
        result = table.distribution(rows, columns.index(name), top)
        labels, counts = list(result["labels"]), list(result["counts"])
        if result["other"]:
            labels.append(table.OTHER_LABEL)
            counts.append(result["other"])
        total = result["total"] or 1
        blocks = [
            report.chart("bar", labels, [{"label": name, "data": counts}], title=f"Distribution of {name}"),
            report.table(
                ["Value", "Count", "%"],
                [[label, count, round(100 * count / total, 2)] for label, count in zip(labels, counts, strict=False)],
                title="Values",
            ),
        ]
        return [report.report(_object_name(f"{source.name} - distribution of {name}"), blocks)]


# The file type of an export with the "tab" separator (Exporter.file_type, contracts "4.1").
TSV_FILE_TYPE = (".tsv", "text/tab-separated-values")


class CsvExporter(_Cached, Exporter):
    id = "csv"
    label = "CSV"
    accepts = (KIND,)
    extension = ".csv"
    mime = "text/csv"
    requires_tools = (STORAGE,)

    def fields(self, obj: ObjectRef, tools: ToolAccess) -> list[Field]:
        separator = obj.meta.get("separator")
        return [
            _separator_field(separator if separator in SEPARATOR_NAMES else "comma"),
            Field("header", "Header", type="bool", default=True,
                help="Writes the column names in the first row."),
        ]

    def file_type(self, obj: ObjectRef, params: Mapping[str, Any]) -> tuple[str, str]:
        """A tab-separated file is a .tsv; the separator of the export, else the one of the import."""

        separator = params.get("separator") or obj.meta.get("separator") or "comma"
        return TSV_FILE_TYPE if separator == "tab" else (self.extension, self.mime)

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> bytes:
        columns, rows = self._load(obj, tools)
        separator = separator_char(params.get("separator") or "comma")
        header = params.get("header")
        return table.write_csv(columns, rows, separator, True if header is None else bool(header))
