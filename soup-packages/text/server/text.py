"""
------------------------------------------------------------------------
File : text.py
Description: The contributions of the text package, for objects of kind
             "text" (a file kept as is in the package's own storage space,
             storage.space("text"), named after the object id):
             - TextImporter ("text"): .txt, .md and .log files; the meta
               has the size, the number of lines, the encoding (UTF-8,
               falling back to Latin-1) and the original extension.
             - TextVisualizer ("text"): <soup-pkg-text-viewer> of app/;
               data() gives the first lines (and the whole text of a
               small markdown file), action("lines") the next blocks of
               lines and action("search") the lines matching a query.
             - OriginalFileExporter ("original"): the file as imported,
               named with its original extension and MIME type
               (Exporter.file_type, contracts "4.1").
             The importer and the visualizer read the decoded lines
             through the same ParsedCache (soup_pkg_soup_base.api), created by the
             Plugin: "lines" and "search" do not read and decode the file
             again at every block; import_() and dispose() invalidate the
             object's entry. The export reads the stored bytes.
             Standard library and the "storage" tool only.
Project : soup-packages/text
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, cast

from soup_pkg_soup_base.api import DEFAULT_MAX_BYTES, DEFAULT_MAX_OBJECTS, ParsedCache
from soup_pkg_tool_storage.api import StorageSpace, StorageTool

from soup.core.contracts import (
    Exporter,
    Importer,
    Inspection,
    NotFoundError,
    ObjectRef,
    ToolAccess,
    Upload,
    ValidationError,
    Visualizer,
    report,
)

KIND = "text"
NAMESPACE = "text"
STORAGE = "storage"

PREVIEW_LINES = 50
CHUNK_LINES = 500
MAX_CHUNK_LINES = 2000
MAX_SEARCH_RESULTS = 200
# A markdown file up to this size is rendered as a whole; larger ones are
# shown as plain text, in blocks of lines.
MAX_MARKDOWN_BYTES = 1024 * 1024

EXTENSIONS = (".txt", ".md", ".log")
DEFAULT_EXTENSION = ".txt"
MARKDOWN_EXTENSIONS = (".md",)
MIME_TYPES = {".md": "text/markdown"}
DEFAULT_MIME = "text/plain"


def decode(data: bytes) -> tuple[str, str]:
    """(text, encoding): UTF-8 (a BOM is dropped), otherwise Latin-1, which decodes any byte."""

    try:
        return data.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        return data.decode("latin-1"), "latin-1"


def _format_of(filename: str) -> str:
    return "markdown" if filename.lower().endswith(MARKDOWN_EXTENSIONS) else "text"


def extension_of(filename: str) -> str:
    """The extension among EXTENSIONS that `filename` ends with (lower-case), else ".txt"."""

    lowered = filename.lower()
    return next((extension for extension in EXTENSIONS if lowered.endswith(extension)), DEFAULT_EXTENSION)


def stored_extension(obj: ObjectRef) -> str:
    """
    meta.extension; for objects imported before it was saved, the one of
    meta.filename (or ".md" for meta.format "markdown"), else ".txt".
    """

    extension = obj.meta.get("extension")
    if isinstance(extension, str) and extension in EXTENSIONS:
        return extension
    filename = obj.meta.get("filename")
    if isinstance(filename, str) and filename.lower().endswith(EXTENSIONS):
        return extension_of(filename)
    return MARKDOWN_EXTENSIONS[0] if obj.meta.get("format") == "markdown" else DEFAULT_EXTENSION


def _space(tools: ToolAccess) -> StorageSpace:
    return cast(StorageTool, tools.get(STORAGE)).space(NAMESPACE)


def _content(obj: ObjectRef, tools: ToolAccess) -> bytes:
    name = obj.meta.get("file")
    if not name:
        raise NotFoundError(f"Object '{obj.id}' has no stored file")
    return _space(tools).read(str(name))


@dataclass(frozen=True)
class TextFile:
    """A stored file decoded into lines, as kept in the cache (immutable: shared by concurrent requests)."""

    lines: tuple[str, ...]
    encoding: str
    size: int


# Rough CPython sizes: a str object without its characters, one item
# reference, the tuple and the dataclass themselves.
_STR_OVERHEAD = 49
_POINTER = 8
_CONTAINERS = 200


def estimated_size(text: TextFile) -> int:
    """Estimated memory, in bytes, of a decoded file."""

    return sum(_STR_OVERHEAD + len(line) for line in text.lines) + _POINTER * len(text.lines) + _CONTAINERS


def new_cache(max_objects: int = DEFAULT_MAX_OBJECTS, max_bytes: int = DEFAULT_MAX_BYTES) -> ParsedCache[TextFile]:
    return ParsedCache(estimated_size, max_objects=max_objects, max_bytes=max_bytes)


class _Cached:
    """Base of the contributions that read the stored files through a ParsedCache."""

    def __init__(self, cache: ParsedCache[TextFile] | None = None):
        self.cache = cache if cache is not None else new_cache()

    def _text(self, obj: ObjectRef, tools: ToolAccess) -> TextFile:
        def read() -> TextFile:
            content = _content(obj, tools)
            text, encoding = decode(content)
            return TextFile(tuple(text.splitlines()), encoding, len(content))

        return self.cache.get(obj.id, read)


def _int(params: Mapping[str, Any], name: str, default: int, low: int, high: int) -> int:
    value = params.get(name, default)
    if value is None:
        value = default
    if isinstance(value, bool):
        raise ValidationError(f"'{name}' must be an integer")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"'{name}' must be an integer, got {value!r}") from None
    return min(max(number, low), high)


class TextImporter(_Cached, Importer):
    id = "text"
    label = "Text"
    description = "Keeps the file as is; shows it as text, or as markdown for .md files."
    extensions = EXTENSIONS
    produces = KIND
    requires_tools = (STORAGE,)

    def inspect(self, upload: Upload, tools: ToolAccess) -> Inspection:
        lines = decode(upload.read())[0].splitlines()
        title = f"First {PREVIEW_LINES} lines ({len(lines)} in total)"
        return Inspection(preview=(report.text("\n".join(lines[:PREVIEW_LINES]), title=title),))

    def import_(self, upload: Upload, obj: ObjectRef, options: Mapping[str, Any], tools: ToolAccess) -> dict[str, Any]:
        data = upload.read()
        text, encoding = decode(data)
        _space(tools).write(obj.id, data)
        # Every write of the file invalidates what was read before.
        self.cache.invalidate(obj.id)
        return {
            "filename": upload.filename,
            "file": obj.id,
            "size": len(data),
            "lines": len(text.splitlines()),
            "encoding": encoding,
            "format": _format_of(upload.filename),
            "extension": extension_of(upload.filename),
        }

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        # Also called after a failed import_(): the file may not exist.
        self.cache.invalidate(obj.id)
        space = _space(tools)
        if space.exists(obj.id):
            space.delete(obj.id)


class TextVisualizer(_Cached, Visualizer):
    id = "text"
    label = "Text"
    accepts = (KIND,)
    element = "soup-pkg-text-viewer"
    requires_tools = (STORAGE,)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        text = self._text(obj, tools)
        data: dict[str, Any] = {
            "filename": obj.meta.get("filename", ""),
            "format": obj.meta.get("format", "text"),
            "encoding": text.encoding,
            "size": text.size,
            "total_lines": len(text.lines),
            "chunk": CHUNK_LINES,
            "lines": list(text.lines[:CHUNK_LINES]),
        }
        if data["format"] == "markdown" and text.size <= MAX_MARKDOWN_BYTES:
            # Rebuilt from the cached lines: line endings become "\n".
            data["markdown"] = "\n".join(text.lines)
        return data

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name == "lines":
            lines = self._text(obj, tools).lines
            start = _int(params, "from", 0, 0, len(lines))
            count = _int(params, "count", CHUNK_LINES, 1, MAX_CHUNK_LINES)
            return {"from": start, "lines": list(lines[start:start + count]), "total": len(lines)}
        if name == "search":
            query = str(params.get("query") or "").lower()
            limit = _int(params, "limit", MAX_SEARCH_RESULTS, 1, MAX_SEARCH_RESULTS)
            if not query:
                return {"matches": [], "total": 0}
            found = [(number, line) for number, line in enumerate(self._text(obj, tools).lines, start=1)
                if query in line.lower()]
            return {"matches": [{"line": number, "text": line} for number, line in found[:limit]], "total": len(found)}
        raise NotFoundError(f"Visualizer '{self.id}' has no action '{name}'")


class OriginalFileExporter(Exporter):
    """
    The stored bytes, downloaded as "<object name><original extension>":
    file_type() gives the extension of the imported file (stored_extension)
    and its MIME type, text/markdown for .md and text/plain otherwise.
    `extension` and `mime` are the defaults of the listing.
    """

    id = "original"
    label = "Original file"
    accepts = (KIND,)
    extension = DEFAULT_EXTENSION
    mime = DEFAULT_MIME
    requires_tools = (STORAGE,)

    def file_type(self, obj: ObjectRef, params: Mapping[str, Any]) -> tuple[str, str]:
        extension = stored_extension(obj)
        return extension, MIME_TYPES.get(extension, DEFAULT_MIME)

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> bytes:
        return _content(obj, tools)
