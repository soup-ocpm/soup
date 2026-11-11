"""
------------------------------------------------------------------------
File : import_router.py
Description: ImportRouter - routes an uploaded file to the importer the
             user picked. It lists every importer able to read the file
             (several may accept the same extension, with different
             results), forwards inspect/preview, and runs the import as a
             small saga (scheda C14): validate the name, create the
             ObjectRef, let the importer store the data, register the
             object in the Catalog, publish "object.created". If the
             importer or the registration fails, importer.dispose() is
             called to undo it (compensation) and the error re-raised.
             Importers are addressed by their full key "<package>.<id>"
             (importers_for() lists them with their key and package),
             which is also what created_by.contributor_id records.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import replace
from datetime import datetime
from typing import Any

from soup.core.contracts import (
    CREATED_BY_IMPORTER,
    CreatedBy,
    Importer,
    Inspection,
    NotFoundError,
    ObjectRef,
    Upload,
    ValidationError,
    import_phase,
    validate_name,
)
from soup.core.contracts.errors import log_error
from soup.core.contracts.report import validate_blocks
from soup.core.event_bus import EventBus
from soup.core.events import OBJECT_CREATED
from soup.core.registry import Registered, Registry
from soup.core.services.core_tools import CoreTools, new_object_id, timestamp
from soup.core.toolbox import ToolBox


class ImportRouter:
    def __init__(
        self,
        importers: Registry[Importer],
        core_tools: CoreTools,
        event_bus: EventBus,
        clock: Callable[[], datetime] = datetime.now,
    ):
        self._importers = importers
        self._core_tools = core_tools
        self._event_bus = event_bus
        self._clock = clock

    def importers_for(self, filename: str) -> list[Registered[Importer]]:
        """Every importer that accepts `filename` and whose tools are available, by label."""

        candidates = [
            entry
            for entry in self._importers.entries()
            if entry.item.accepts(filename) and self._core_tools.available(entry.item.requires_tools)
        ]
        return sorted(candidates, key=lambda entry: (entry.item.label.lower(), entry.key))

    def get(self, importer_id: str) -> Importer:
        importer = self._importers.get(importer_id)
        if importer is None or not self._core_tools.available(importer.requires_tools):
            raise NotFoundError(f"Importer '{importer_id}' not found")
        return importer

    def package_of(self, importer_id: str) -> str:
        self.get(importer_id)
        return self._importers.owner_of(importer_id) or ""

    def inspect(self, importer_id: str, upload: Upload) -> Inspection:
        importer = self._accepting(importer_id, upload)
        with import_phase("file inspection", importer=importer_id, file=upload.filename):
            inspection = importer.inspect(upload, self._toolbox(importer_id, importer))
            if not isinstance(inspection, Inspection):
                raise TypeError(f"Importer '{importer.id}'.inspect() must return an Inspection")
            validate_blocks(list(inspection.preview))
        return inspection

    def preview(
        self, importer_id: str, upload: Upload, options: Mapping[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        importer = self._accepting(importer_id, upload)
        with import_phase("preview validation", importer=importer_id, file=upload.filename):
            blocks = importer.preview(upload, dict(options or {}), self._toolbox(importer_id, importer)) or []
            return validate_blocks(list(blocks))

    def import_(
        self,
        importer_id: str,
        upload: Upload,
        name: str,
        description: str = "",
        options: Mapping[str, Any] | None = None,
    ) -> ObjectRef:
        """
        :raises ValidationError: invalid name/description, or the importer rejects the file
        :raises NotFoundError: unknown importer
        :raises ServiceUnavailableError: no catalog tool is loaded
        """

        validate_name(name)
        if not isinstance(description or "", str):
            raise ValidationError("Description must be a string")
        importer = self._accepting(importer_id, upload)
        catalog = self._core_tools.catalog_writer()

        obj = ObjectRef(
            id=new_object_id(),
            name=name,
            kind=importer.produces,
            created_by=CreatedBy(CREATED_BY_IMPORTER, importer_id, self._importers.owner_of(importer_id) or ""),
            parents=(),
            created_at=timestamp(self._clock),
            description=description or "",
        )
        tools = self._toolbox(importer_id, importer)
        with import_phase("import", importer=importer_id, file=upload.filename):
            try:
                meta = importer.import_(upload, obj, dict(options or {}), tools)
                if meta is not None and not isinstance(meta, Mapping):
                    raise TypeError(f"Importer '{importer.id}'.import_() must return a dict, not {type(meta).__name__}")
                obj = replace(obj, meta=dict(meta or {}))
                with import_phase("catalog registration", importer=importer_id, file=upload.filename):
                    catalog.add(obj)
            except Exception:
                self._compensate(importer, obj, tools)
                raise

        with import_phase(
            "import completion",
            importer=importer_id,
            file=upload.filename,
            hint="Check the workspace before retrying; the object may already be registered.",
        ):
            self._event_bus.publish(OBJECT_CREATED, {"object": obj.to_dict()})
        return obj

    # ------------------------------------------------------------------ #
    def _accepting(self, importer_id: str, upload: Upload) -> Importer:
        importer = self.get(importer_id)
        if not importer.accepts(upload.filename):
            raise ValidationError(
                f"Importer '{importer.label or importer.id}' cannot read '{upload.filename}'"
                f" (accepted extensions: {list(importer.extensions)})"
            )
        return importer

    def _toolbox(self, key: str, importer: Importer) -> ToolBox:
        return self._core_tools.toolbox(f"importer '{key}'", importer.requires_tools)

    @staticmethod
    def _compensate(importer: Importer, obj: ObjectRef, tools: ToolBox) -> None:
        try:
            importer.dispose(obj, tools)
        except Exception as exc:  # noqa: BLE001 - preserve the original error after logging cleanup failure
            log_error(exc, {"phase": "import cleanup", "importer": importer.id})
