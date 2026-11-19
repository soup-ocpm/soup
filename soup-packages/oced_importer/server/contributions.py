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
    Choice,
    Importer,
    Inspection,
    ObjectRef,
    ToolAccess,
    Upload,
    Visualizer,
    ValidationError,
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
    label = "OCED event log (CSV)"
    description = (
        "Upload events and optional object tables into a dataset-scoped EKG on Memgraph or Neo4j."
    )
    extensions = (".csv",)
    produces = KIND
    config_element = "soup-oced-importer-config"
    requires_tools = ("catalog", "storage")

    def __init__(self, database: Database, csv_server: CsvServer):
        self._database = database
        self._csv_server = csv_server

    def backend(self, options):
        value = options.get('backend', 'neo4j' if 'neo4j' in self._database.backends else 'memgraph')
        if value not in self._database.backends:
            raise ValidationError('Select an available graph backend')
        return value

    def backend_field(self):
        return Field('backend', 'Graph backend', type='select', choices=tuple(Choice(name, {'neo4j':'Neo4j', 'memgraph':'Memgraph'}[name]) for name in self._database.backends),
                     default=self.backend({}), required=True)

    def inspect(self, upload: Upload, tools: ToolAccess) -> Inspection:
        with import_phase("CSV parsing"):
            source = describe(upload)
        return Inspection(
            preview=(),
            fields=(Field("source", default=source), self.backend_field()),
        )

    def preview(self, upload: Upload, options: Mapping[str, Any], tools: ToolAccess) -> list[dict[str, Any]]:
        with import_phase("CSV preparation"):
            prepared = prepare(upload, options, "preview", preview=True)
        blocks = [
            report.keyvalue(prepared.counts, title="Rows to load"),
        ]
        for entity, config in prepared.log.entities.items():
            table = read_table(prepared.files[config.path])
            mode = "uploaded" if options["entities"][entity].get("file") else "generated"
            blocks.append(
                report.table(table.columns, table.rows[:10], title=f"{entity} — {mode} ({len(table.rows)} rows)")
            )
        if prepared.missing_references:
            blocks.append(report.table(
                ["Column", "Missing IDs", "Sample values"],
                [[item["column"], item["count"], ", ".join(item["samples"])]
                 for item in prepared.missing_references],
                title="Missing object references",
            ))
            if options.get("missing_reference_strategy", "strict") == "strict":
                return blocks
        if self.backend(options) == "neo4j":
            self._database.for_backend("neo4j").check_multi_database()
        else:
            from .memgraph import ekg_api
            ekg_api().graph_tools()
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
        backend = self.backend(options)
        with timed_phase(info, "database_creation" if backend == "neo4j" else "dataset_staging"):
            if backend == 'neo4j':
                name = self._database.for_backend('neo4j').create_dataset(object_id, obj.name)
                metadata = {'backend':'neo4j','neo4j_database':name,
                            'neo4j_database_owner':obj.id,'neo4j_managed':True}
            else:
                from .memgraph import stage
                metadata = stage(prepared, obj, tools.get('storage'))
        staged = replace(obj, meta={**metadata, "import_status": "loading", "process_info": info})
        # Persist ownership before loading so a failed import remains explicitly manageable.
        with import_phase(
            "dataset catalog registration",
            hint=(f"The new {backend} dataset {metadata.get('neo4j_database') or metadata.get('dataset')} may exist. "
                  "Check catalog storage permissions; no database was dropped."),
        ):
            try:
                catalog.add(staged)
            except BaseException:
                if backend == 'memgraph':
                    from .memgraph import ekg_api
                    try:
                        ekg_api().DatasetRepository(tools.get('storage')).delete(metadata['dataset'])
                    except Exception as cleanup:
                        log_error(cleanup, {'phase':'Memgraph OCED registration cleanup','dataset':obj.id})
                raise
        try:
            if backend == 'neo4j':
                database = self._database.for_dataset(obj.id)
                result = load(database, self._csv_server, object_id, prepared, process_info=info, started=started)
            else:
                from .memgraph import ekg_api
                api = ekg_api()
                with import_phase('Memgraph OCED loading'), timed_phase(info, 'loading'):
                    api.ensure_loaded(staged, api.graph_tools())
                config = api.DatasetRepository(tools.get('storage')).load_config(metadata['dataset'])
                result = {**prepared.metadata(), 'counts':{**prepared.counts, **{key:config.get(key, 0) for key in ('event_nodes','entity_nodes','corr_rel','df_rel')}},
                          'process_info':{**config.get('process_info', {}), **info}}
            return {**result, **metadata, 'import_status':'complete'}
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
        if obj.meta.get('backend') == 'memgraph':
            from .memgraph import ekg_api
            api = ekg_api()
            api.dispose(obj, api.graph_tools())


class OcedSummary(Visualizer):
    id = "summary"
    label = "OCED event log import"
    accepts = (KIND,)
    element = "soup-oced-importer-summary"

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        return obj.meta
