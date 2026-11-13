"""
------------------------------------------------------------------------
File : export_router.py
Description: ExportRouter - offers the exporters that accept an object's
             kind (and apply to it: Exporter.applies) and runs one of
             them, after validating its options, into a file named after
             the object. Exporters are addressed by their full key
             "<package>.<id>" (exporters_for() lists them with their key
             and package). An exporter that does not apply to an object,
             or whose applies() raises (logged with its package), is not
             listed and its export answers NotFoundError, like an unknown
             one. The extension and the MIME type of the file come from
             Exporter.file_type(obj, params) (contracts "4.1"; default
             the exporter's `extension` and `mime`) and are validated: an
             invalid one is a DomainError (500) naming the exporter and
             its package, and no file name is built with it.
             listed_file_type() gives the extension and MIME type of the
             list of exporters: file_type() with the defaults of the
             fields; if it raises or gives an invalid value, the
             exporter's own `extension` and `mime` (with a warning in the
             log): the list never fails for it.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import copy
import logging
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from soup.core.contracts import DomainError, Exporter, Field, NotFoundError, ObjectRef
from soup.core.field_validation import validate_values
from soup.core.registry import Registered, Registry
from soup.core.services.core_tools import CoreTools, ObjectLike, kinds_of
from soup.core.toolbox import ToolBox

_LOGGER = logging.getLogger("soup.export")

# What Exporter.file_type() returns.
_FILE_TYPE = ("extension", "mime")

# ".csv", ".tar.gz", ".jsonocel": a dot, then 1-15 letters, digits, ".", "-" or "_".
_EXTENSION_RE = re.compile(r"\.[A-Za-z0-9._-]{1,15}")
# "type/subtype" with the characters of RFC 6838 restricted names. Both used with fullmatch.
_MIME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}")


@dataclass(frozen=True)
class ExportedFile:
    filename: str
    mime: str
    content: bytes


class ExportRouter:
    def __init__(self, exporters: Registry[Exporter], core_tools: CoreTools):
        self._exporters = exporters
        self._core_tools = core_tools

    def exporters_for(self, obj: ObjectLike) -> list[Registered[Exporter]]:
        ref = self._core_tools.object(obj)
        found = [entry for entry in self._exporters.entries() if self._applies(entry, ref)]
        return sorted(found, key=lambda entry: (entry.item.label.lower(), entry.key))

    def fields(self, exporter_id: str, obj: ObjectLike) -> list[Field]:
        entry, ref = self._resolve(exporter_id, obj)
        with self._core_tools.graph_scope((ref,)):
            return self._fields(entry.item, ref, self._toolbox(exporter_id, entry.item))

    def listed_file_type(self, exporter_id: str, obj: ObjectLike, fields: list[Field]) -> tuple[str, str]:
        """(extension, mime) of the file exported with the default values of `fields` (those of fields())."""

        entry, ref = self._resolve(exporter_id, obj)
        exporter = entry.item
        defaults = {field.name: copy.deepcopy(field.default) for field in fields}
        try:
            value = exporter.file_type(ref, defaults)
        except Exception as exc:  # noqa: BLE001 - the list shows the fixed extension instead
            problems = [f"file_type() raised {exc!r}"]
        else:
            problems = _file_type_problems(value)
            if not problems:
                return value
        _LOGGER.warning(
            "Exporter '%s' of package '%s': the list shows its fixed extension, file_type() failed: %s",
            entry.key, entry.package, problems,
        )
        return exporter.extension, exporter.mime

    def export(self, exporter_id: str, obj: ObjectLike, params: Mapping[str, Any] | None = None) -> ExportedFile:
        """
        :raises DomainError: (500) file_type() gave an invalid extension or MIME type
        """

        entry, ref = self._resolve(exporter_id, obj)
        exporter = entry.item
        tools = self._toolbox(exporter_id, exporter)
        with self._core_tools.graph_scope((ref,)):
            cleaned = validate_values(self._fields(exporter, ref, tools), params)
            extension, mime = self._file_type(entry, ref, cleaned)
            content = exporter.export(ref, cleaned, tools)
        if not isinstance(content, (bytes, bytearray)):
            raise TypeError(f"Exporter '{exporter.id}'.export() must return bytes, not {type(content).__name__}")
        return ExportedFile(filename=f"{ref.name}{extension}", mime=mime, content=bytes(content))

    # ------------------------------------------------------------------ #
    def _applies(self, entry: Registered[Exporter], obj: ObjectRef) -> bool:
        exporter = entry.item
        if obj.kind not in kinds_of(exporter.accepts) or not self._core_tools.available(exporter.requires_tools):
            return False
        if not self._core_tools.supports(entry.package, (obj,)):
            return False
        try:
            with self._core_tools.graph_scope((obj,)):
                return bool(exporter.applies(obj, self._toolbox(entry.key, exporter)))
        except Exception:  # noqa: BLE001 - one broken exporter must not break the list
            _LOGGER.exception("Exporter '%s' of package '%s' failed in applies()", entry.key, entry.package)
            return False

    def _resolve(self, exporter_id: str, obj: ObjectLike) -> tuple[Registered[Exporter], ObjectRef]:
        ref = self._core_tools.object(obj)
        entry = next((item for item in self._exporters.entries() if item.key == exporter_id), None)
        if entry is None or not self._applies(entry, ref):
            raise NotFoundError(f"Exporter '{exporter_id}' is not available for object '{ref.id}'")
        return entry, ref

    @staticmethod
    def _file_type(entry: Registered[Exporter], obj: ObjectRef, params: Mapping[str, Any]) -> tuple[str, str]:
        value = entry.item.file_type(obj, params)
        problems = _file_type_problems(value)
        if not problems:
            return value
        _LOGGER.error("Exporter '%s' of package '%s' gave an invalid file type: %s", entry.key, entry.package, problems)
        raise DomainError(
            f"Exporter '{entry.key}' of package '{entry.package}' gave an invalid file type for object "
            f"'{obj.id}': {'; '.join(problems)}"
        )

    def _toolbox(self, key: str, exporter: Exporter) -> ToolBox:
        return self._core_tools.toolbox(f"exporter '{key}'", exporter.requires_tools)

    @staticmethod
    def _fields(exporter: Exporter, obj: ObjectRef, tools: ToolBox) -> list[Field]:
        fields = list(exporter.fields(obj, tools) or [])
        for item in fields:
            if not isinstance(item, Field):
                raise TypeError(f"Exporter '{exporter.id}'.fields() must return Fields, got {type(item).__name__}")
        return fields


def _file_type_problems(value: object) -> list[str]:
    """What is wrong with a value returned by Exporter.file_type() (empty: a valid (extension, mime))."""

    if not isinstance(value, tuple) or len(value) != len(_FILE_TYPE):
        return [f"{value!r} instead of (extension, mime)"]
    extension, mime = value
    problems = []
    if not isinstance(extension, str) or not _EXTENSION_RE.fullmatch(extension):
        problems.append(f"extension {extension!r} (a '.' and 1-15 letters, digits, '.', '-' or '_')")
    if not isinstance(mime, str) or not _MIME_RE.fullmatch(mime):
        problems.append(f"MIME type {mime!r} (type/subtype)")
    return problems
