"""SOUP importer/configuration and a package-owned import summary element."""

from __future__ import annotations

import hashlib
import json
import secrets
import threading
import time
from collections.abc import Mapping
from typing import Any
from uuid import UUID

from soup.core.contracts import (
    Field,
    Importer,
    Inspection,
    ObjectRef,
    ToolAccess,
    Upload,
    ValidationError,
    Visualizer,
    import_phase,
    report,
)
from soup.core.contracts.database import Database

from .csv_data import describe, prepare, read_table
from .csv_http import CsvServer
from .loader import has_data, load

KIND = "oced_importer.log"
_MAX_CONFIRMATIONS = 128
_CONFIRMATION_TTL = 900


class OcedImporter(Importer):
    id = "csv"
    label = "OCED event log (Neo4j)"
    description = (
        "Upload events and optional object tables into a dedicated Neo4j database; "
        "replacing data requires confirmation."
    )
    extensions = (".csv",)
    produces = KIND
    config_element = "soup-oced-importer-config"

    def __init__(self, database: Database, csv_server: CsvServer):
        self._database = database
        self._csv_server = csv_server
        self._confirmations: dict[str, tuple[float, tuple[str, str]]] = {}
        self._confirmation_lock = threading.Lock()

    @staticmethod
    def _signature(upload: Upload, options: Mapping[str, Any]) -> tuple[str, str]:
        config = {key: value for key, value in options.items() if key not in {"replace_existing", "replacement_token"}}
        return hashlib.sha256(upload.read()).hexdigest(), hashlib.sha256(
            json.dumps(config, sort_keys=True).encode()
        ).hexdigest()

    def inspect(self, upload: Upload, tools: ToolAccess) -> Inspection:
        with import_phase("CSV parsing"):
            source = describe(upload)
        return Inspection(
            preview=(),
            fields=(Field("source", default=source),),
        )

    def preview(self, upload: Upload, options: Mapping[str, Any], tools: ToolAccess) -> list[dict[str, Any]]:
        with import_phase("CSV preparation"):
            prepared = prepare(upload, options, "preview")
        blocks = [
            report.keyvalue(prepared.counts, title="Rows to load"),
        ]
        for entity, config in prepared.log.entities.items():
            table = read_table(prepared.files[config.path])
            mode = "uploaded" if options["entities"][entity].get("file") else "generated"
            blocks.append(
                report.table(table.columns, table.rows[:10], title=f"{entity} — {mode} ({len(table.rows)} rows)")
            )
        with import_phase("database validation", hint="Check Neo4j URI, credentials, database name and TLS settings."):
            nonempty = has_data(self._database)
        if nonempty:
            token = secrets.token_urlsafe(32)
            with self._confirmation_lock:
                now = time.monotonic()
                self._confirmations = {key: value for key, value in self._confirmations.items() if value[0] > now}
                if len(self._confirmations) >= _MAX_CONFIRMATIONS:
                    self._confirmations.pop(next(iter(self._confirmations)))
                self._confirmations[token] = (now + _CONFIRMATION_TTL, self._signature(upload, options))
            blocks.append(report.keyvalue({"replacement_token": token}, title="Neo4j replacement confirmation"))
        return blocks

    def import_(
        self,
        upload: Upload,
        obj: ObjectRef,
        options: Mapping[str, Any],
        tools: ToolAccess,
    ) -> dict[str, Any]:
        object_id = str(UUID(obj.id))
        with import_phase("CSV preparation"):
            prepared = prepare(upload, options, f"oced_importer/{object_id}")
        replacement = options.get("replace_existing") is True
        if replacement:
            with self._confirmation_lock:
                confirmation = self._confirmations.pop(str(options.get("replacement_token", "")), None)
            if (
                confirmation is None
                or confirmation[0] <= time.monotonic()
                or confirmation[1] != self._signature(upload, options)
            ):
                raise ValidationError(
                    "Replacement confirmation is missing, expired or already used. "
                    "Review the CSVs and explicitly confirm replacement again. No data was deleted.",
                    details={"phase": "replacement confirmation"},
                )
        return load(self._database, self._csv_server, object_id, prepared, replace_existing=replacement)

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        # Do not run deletes on an external database. Workspace deletion removes
        # only the catalog entry; external graph data is retained.
        pass


class OcedSummary(Visualizer):
    id = "summary"
    label = "OCED event log import"
    accepts = (KIND,)
    element = "soup-oced-importer-summary"

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        return obj.meta
