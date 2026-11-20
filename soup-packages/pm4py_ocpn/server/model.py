from __future__ import annotations
import json
import math
import uuid
from pm4py.objects.petri_net.exporter import exporter
from pm4py.objects.petri_net.importer import importer
from pm4py.visualization.ocel.ocpn import visualizer
from graphviz.backend import ExecutableNotFound, CalledProcessError
from soup.core.contracts import Field, ValidationError, NotFoundError

KIND = "pm4py_ocpn.model"
SCHEMA = "soup.pm4py_ocpn/1"

def space(tools):
    return tools.get("storage").space("pm4py_ocpn")

def options(params):
    direction = params.get("rankdir", "LR")
    if direction not in ("LR", "TB"):
        raise ValidationError("Invalid graph direction.")
    return {"rankdir": direction}

def view_fields():
    return [Field("rankdir", "Direction", type="select", choices=("LR", "TB"), default="LR")]

def encode(model):
    return {"activities": sorted(model["activities"]),
            "object_types": sorted(model["petri_nets"]),
            "double_arcs_on_activity": model["double_arcs_on_activity"],
            "petri_nets": {kind: exporter.serialize(net, im, fm).decode("utf-8")
                           for kind, (net, im, fm) in model["petri_nets"].items()}}

def decode(model):
    return {**model, "petri_nets": {kind: importer.deserialize(xml.encode("utf-8"))
                                   for kind, xml in model["petri_nets"].items()}, "tbr_results": {}}

def save(model, summary, tools):
    filename = uuid.uuid4().hex + ".json"
    space(tools).write(filename, json.dumps({"schema": SCHEMA, "model": encode(model), "summary": summary}, ensure_ascii=False, allow_nan=False).encode())
    return filename

def load(obj, tools):
    filename = obj.meta.get("file")
    if not filename or not space(tools).exists(filename):
        raise NotFoundError("OC-PN model not found in storage.")
    try:
        stored = json.loads(space(tools).read(filename))
        if stored["schema"] != SCHEMA:
            raise ValueError("Unsupported schema")
        return stored
    except (ValueError, KeyError, TypeError) as error:
        raise ValidationError("Invalid stored OC-PN model. Rediscover it from the source log.") from error

def graph(model, config):
    return visualizer.apply(model, parameters={**config, "format": "svg", "bgcolor": "white"})

def render(model, config):
    try:
        return graph(model, config).pipe(format="svg").decode("utf-8")
    except (ExecutableNotFound, CalledProcessError) as error:
        raise ValidationError("Graphviz could not render the OC-PN. Check that dot is installed on the server.") from error

def payload(obj, params, tools):
    stored = load(obj, tools)
    config = options({**obj.meta.get("view", {}), **params})
    return {"svg": render(decode(stored["model"]), config), "summary": stored["summary"], "options": config}
