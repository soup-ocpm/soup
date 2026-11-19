from __future__ import annotations

import json

import pm4py

from soup.core.contracts import (
    Exporter,
    Field,
    NotFoundError,
    ObjectDraft,
    Operation,
    OperationInput,
    ValidationError,
    Visualizer,
)

from .codec import decode
from .model import KIND, dispose, graph, load, options, payload, render, save, summarize, view_fields
from .source import object_types, read_ocel


class DiscoverOcdfg(Operation):
    id = "discover"
    label = "Discover OC-DFG (PM4Py)"
    description = "Discover an OC-DFG by object type, including frequencies and elapsed times."
    group = "Process discovery"
    inputs = (OperationInput("log", ("ocel_tables", "ekg")),)
    produces = (KIND,)
    requires_tools = ("storage", "memgraph")

    def fields(self, inputs, tools):
        source = inputs["log"]
        kinds = object_types(source, tools)
        selection = (
            Field(
                "object_types",
                "Object types",
                type="multiselect",
                choices=tuple(kinds),
                default=kinds,
                required=True,
            )
            if kinds
            else Field(
                "object_types",
                "Object types",
                type="columns",
                required=True,
                help="The log has no objects. Import a log with event-to-object relationships.",
            )
        )
        return [Field("name", "Name", required=True, default=f"{source.name} OC-DFG"), selection, *view_fields()]

    def run(self, inputs, params, tools):
        source = inputs["log"]
        config = options(params)
        available = object_types(source, tools)
        chosen = params.get("object_types", available)
        if (
            not isinstance(chosen, list)
            or not chosen
            or any(not isinstance(kind, str) or kind not in available for kind in chosen)
        ):
            raise ValidationError("Select at least one object type present in the log.")
        log = read_ocel(source, tools, sorted(set(chosen)))
        model = pm4py.discover_ocdfg(log)
        summary = summarize(model, log)
        filename = save(model, summary, tools)
        return [
            ObjectDraft(
                params.get("name") or f"{source.name} OC-DFG",
                KIND,
                {
                    "file": filename,
                    "summary": {
                        key: summary[key] for key in ("events", "objects", "relations", "object_types", "activities")
                    },
                    "view": config,
                    "pm4py_version": pm4py.__version__,
                    "source_id": source.id,
                },
            )
        ]

    def dispose(self, obj, tools):
        dispose(obj, tools)


class OcdfgVisualizer(Visualizer):
    id = "graph"
    label = "OC-DFG"
    accepts = (KIND,)
    element = "soup-pkg-pm4py-ocdfg"
    requires_tools = ("storage",)

    def data(self, obj, params, tools):
        return payload(obj, params, tools)

    def action(self, obj, name, params, tools):
        if name != "render":
            raise NotFoundError(f"Unknown action: {name}")
        return payload(obj, params, tools)


class JsonExporter(Exporter):
    id = "json"
    label = "OC-DFG model (JSON)"
    accepts = (KIND,)
    extension = ".json"
    mime = "application/json"
    requires_tools = ("storage",)

    def export(self, obj, params, tools):
        stored = load(obj, tools)
        stored["provenance"] = {
            "name": obj.name,
            "parents": list(obj.parents),
            "pm4py_version": obj.meta.get("pm4py_version"),
        }
        return json.dumps(stored, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")


class SvgExporter(Exporter):
    id = "svg"
    label = "OC-DFG graph (SVG)"
    accepts = (KIND,)
    extension = ".svg"
    mime = "image/svg+xml"
    requires_tools = ("storage",)

    def fields(self, obj, tools):
        return view_fields(obj.meta.get("view"))

    def export(self, obj, params, tools):
        config = options(params, obj.meta.get("view"))
        return render(decode(load(obj, tools)["model"]), config).encode("utf-8")


class DotExporter(SvgExporter):
    id = "dot"
    label = "OC-DFG graph (Graphviz DOT)"
    extension = ".gv"
    mime = "text/vnd.graphviz"

    def export(self, obj, params, tools):
        config = options(params, obj.meta.get("view"))
        return graph(decode(load(obj, tools)["model"]), config).source.encode("utf-8")
