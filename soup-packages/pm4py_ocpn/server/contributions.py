import json
import pm4py
from soup.core.contracts import Operation, OperationInput, ObjectDraft, Field, ValidationError, Visualizer, NotFoundError, Exporter
from .source import object_types, read_ocel
from .model import KIND, options, view_fields, save, load, decode, graph, render, payload, space

class DiscoverOcpn(Operation):
    id = "discover"
    label = "Discover OC-PN (PM4Py)"
    description = "Discover an object-centric Petri net using the Inductive Miner."
    group = "Process discovery"
    inputs = (OperationInput("log", ("ocel_tables", "ekg")),)
    produces = (KIND,)
    requires_tools = ("storage", "memgraph")

    def fields(self, inputs, tools):
        source = inputs["log"]
        kinds = object_types(source, tools)
        return [Field("name", "Name", required=True, default=f"{source.name} OC-PN"),
                Field("object_types", "Object types", type="multiselect", choices=tuple(kinds), default=kinds, required=True),
                *view_fields()]

    def run(self, inputs, params, tools):
        source = inputs["log"]
        config = options(params)
        available = object_types(source, tools)
        chosen = params.get("object_types", available)
        if not isinstance(chosen, list) or not chosen or any(not isinstance(k, str) or k not in available for k in chosen):
            raise ValidationError("Select at least one object type present in the log.")
        log = read_ocel(source, tools, sorted(set(chosen)))
        model = pm4py.discover_oc_petri_net(log)
        summary = {"events": len(log.events), "objects": len(log.objects), "relations": len(log.relations),
                   "object_types": sorted(model["petri_nets"]), "activities": sorted(model["activities"]),
                   "places": sum(len(n.places) for n, _, _ in model["petri_nets"].values())}
        filename = save(model, summary, tools)
        return [ObjectDraft(params.get("name") or f"{source.name} OC-PN", KIND,
                            {"file": filename, "summary": summary, "view": config, "source_id": source.id, "pm4py_version": pm4py.__version__})]

    def dispose(self, obj, tools):
        if obj.meta.get("file"):
            space(tools).delete(obj.meta["file"])

class OcpnVisualizer(Visualizer):
    id = "graph"
    label = "OC-PN"
    accepts = (KIND,)
    element = "soup-pkg-pm4py-ocpn"
    requires_tools = ("storage",)

    def data(self, obj, params, tools):
        return payload(obj, params, tools)

    def action(self, obj, name, params, tools):
        if name != "render":
            raise NotFoundError(f"Unknown action: {name}")
        return payload(obj, params, tools)

class JsonExporter(Exporter):
    id = "json"
    label = "OC-PN model (JSON with PNML nets)"
    accepts = (KIND,)
    extension = ".json"
    mime = "application/json"
    requires_tools = ("storage",)

    def export(self, obj, params, tools):
        stored = load(obj, tools)
        stored["provenance"] = {"name": obj.name, "parents": list(obj.parents), "pm4py_version": obj.meta.get("pm4py_version")}
        return json.dumps(stored, ensure_ascii=False, indent=2).encode()

class SvgExporter(JsonExporter):
    id = "svg"
    label = "OC-PN graph (SVG)"
    extension = ".svg"
    mime = "image/svg+xml"

    def fields(self, obj, tools):
        return view_fields()

    def export(self, obj, params, tools):
        return render(decode(load(obj, tools)["model"]), options({**obj.meta.get("view", {}), **params})).encode()

class DotExporter(SvgExporter):
    id = "dot"
    label = "OC-PN graph (Graphviz DOT)"
    extension = ".gv"
    mime = "text/vnd.graphviz"

    def export(self, obj, params, tools):
        return graph(decode(load(obj, tools)["model"]), options({**obj.meta.get("view", {}), **params})).source.encode()
