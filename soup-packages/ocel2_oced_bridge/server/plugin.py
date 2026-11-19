"""OCEL JSON -> shared OCED EKG importer for both graph backends."""
from __future__ import annotations

import importlib
from collections.abc import Mapping
from typing import Any

from soup_pkg_oced_importer.contributions import OcedImporter
from soup_pkg_oced_importer.csv_http import CsvServer, shared_server

from soup.core.contracts import (
    Field, Importer, Inspection, ObjectRef, PluginContext, SoupPlugin,
    ToolAccess, Upload, ValidationError, report,
)

from .converter import convert
from .model import parse as local_parse


def parse(data):
    # Prefer OCEL's shared parser where that optional (Memgraph) package is active.
    try:
        parser = importlib.import_module('soup_pkg_ocel.model').parse
    except ImportError:
        parser = local_parse
    return parser(data)


def losses(summary):
    return any(summary[key] for key in (
        'qualifier_relationships_not_preserved', 'object_object_relationships_not_preserved',
        'additional_timed_object_attribute_values_not_preserved', 'empty_string_attributes_as_null',
        'event_object_relationships_deduplicated', 'object_attribute_timestamps_not_preserved',
    ))


class OcelToOcedImporter(Importer):
    id = "ocel2_to_oced"
    label = "OCEL 2.0 as OCED EKG"
    description = (
        "Convert OCEL 2.0 JSON to an OCED event CSV plus an object table per object type, "
        "then use the existing OCED pipeline on the selected graph backend. "
        "For PM4Py, choose the separate 'OCEL 2.0 as tables' importer. "
        "OCED cannot represent OCEL qualifiers, object-object links or object attribute histories."
    )
    extensions = (".json", ".jsonocel")
    produces = "oced_importer.log"
    requires_tools = ("catalog", "storage")

    def __init__(self, database: Any, csv_server: CsvServer):
        self._delegate = OcedImporter(database, csv_server)

    def inspect(self, upload: Upload, tools: ToolAccess) -> Inspection:
        log = parse(upload.read())
        _events, _options, summary = convert(log)
        fields = [self._delegate.backend_field()]
        if losses(summary):
            fields.append(Field('accept_semantic_loss', 'I accept the reported OCEL-to-OCED limitations',
                                type='bool', default=False, required=True))
        return Inspection(preview=(report.keyvalue(summary, title="OCEL to OCED conversion"),), fields=tuple(fields))

    def preview(self, upload: Upload, options: Mapping[str, Any], tools: ToolAccess) -> list[dict[str, Any]]:
        log = parse(upload.read())
        events, oced_options, summary = convert(log)
        oced_options['backend'] = self._delegate.backend(options)
        return [report.keyvalue(summary, title="OCEL conversion limitations"),
                *self._delegate.preview(events, oced_options, tools)]

    def import_(self, upload: Upload, obj: ObjectRef, options: Mapping[str, Any], tools: ToolAccess) -> dict[str, Any]:
        log = parse(upload.read())
        events, oced_options, summary = convert(log)
        if losses(summary) and options.get('accept_semantic_loss') is not True:
            raise ValidationError('Review and explicitly accept the OCEL-to-OCED limitations, or choose OCEL tables to retain the complete log')
        oced_options['backend'] = self._delegate.backend(options)
        result = self._delegate.import_(events, obj, oced_options, tools)
        return {**result, "ocel_source_filename": upload.filename, "ocel_conversion": summary}

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        self._delegate.dispose(obj, tools)


class Plugin(SoupPlugin):
    csv_server: CsvServer | None = None

    def register(self, ctx: PluginContext) -> None:
        self.csv_server = shared_server()
        importer = OcelToOcedImporter(ctx.database, self.csv_server)
        ctx.add_importer(importer)
        ctx.contribute('oced.ocel_importers', importer, key='ocel2_oced_bridge')

    def on_shutdown(self, ctx: PluginContext) -> None:
        # OCED owns the borrowed server; closing it here would interrupt CSV imports.
        self.csv_server = None
