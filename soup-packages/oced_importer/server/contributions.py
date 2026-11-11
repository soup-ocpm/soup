"""SOUP importer/configuration and a package-owned import summary element."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from datetime import datetime, timezone
from time import perf_counter
from typing import Any
from uuid import UUID

from soup.core.contracts import (
    Catalog,
    Field,
    Importer,
    Inspection,
    ObjectRef,
    ToolAccess,
    Upload,
    Visualizer,
    import_phase,
    report,
)
from soup.core.contracts.database import Database
from soup.core.contracts.errors import log_error

from .csv_data import describe, prepare, read_table
from .csv_http import CsvServer
from .loader import load, timed_phase

KIND = "oced_importer.log"


class OcedImporter(Importer):
    id = "csv"
    label = "OCED event log (Neo4j)"
    description = (
        "Upload events and optional object tables into a dedicated Neo4j database; "
        "each dataset has its own database."
    )
    extensions = (".csv",)
    produces = KIND
    config_element = "soup-oced-importer-config"
    requires_tools = ("catalog",)

    def __init__(self, database: Database, csv_server: CsvServer):
        self._database = database
        self._csv_server = csv_server

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
        self._database.check_multi_database()
        return blocks

    def import_(
        self,
        upload: Upload,
        obj: ObjectRef,
        options: Mapping[str, Any],
        tools: ToolAccess,
    ) -> dict[str, Any]:
        object_id = str(UUID(obj.id))
        started = perf_counter()
        info: dict[str, Any] = {"init_time": datetime.now(timezone.utc).isoformat(), "dataset_id": object_id}
        with import_phase("CSV preparation"), timed_phase(info, "csv_preparation"):
            prepared = prepare(upload, options, f"oced_importer/{object_id}")
        catalog = tools.typed("catalog", Catalog)
        with timed_phase(info, "database_creation"):
            name = self._database.create_dataset(object_id, obj.name)
        metadata = {"neo4j_database": name, "neo4j_database_owner": obj.id, "neo4j_managed": True}
        staged = replace(obj, meta={**metadata, "import_status": "loading", "process_info": info})
        # Persist ownership before loading so a failed import remains explicitly manageable.
        with import_phase(
            "dataset catalog registration",
            hint=(f"The new Neo4j database {name} may exist. "
                  "Check catalog storage permissions; no database was dropped."),
        ):
            catalog.add(staged)
        try:
            database = self._database.for_dataset(obj.id)
            return {**load(database, self._csv_server, object_id, prepared, process_info=info, started=started),
                    **metadata, "import_status": "complete"}
        except Exception:
            info.setdefault("duration_seconds", {})["total"] = perf_counter() - started
            try:
                catalog.update(replace(staged, meta={**metadata, "import_status": "failed", "process_info": info}))
            except Exception as cleanup:
                log_error(cleanup, {"phase": "failed import catalog update", "dataset": obj.id})
            raise
        finally:
            info.setdefault("duration_seconds", {})["total"] = perf_counter() - started

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        # The workspace drops only explicitly registered databases after confirmation.
        # Import compensation must never drop a database implicitly.
        pass


class OcedSummary(Visualizer):
    id = "summary"
    label = "OCED event log import"
    accepts = (KIND,)
    element = "soup-oced-importer-summary"

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        return obj.meta
