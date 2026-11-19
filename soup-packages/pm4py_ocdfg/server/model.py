from __future__ import annotations

import json
import math
import uuid
from statistics import mean, median

from graphviz.backend import CalledProcessError, ExecutableNotFound
from pm4py.visualization.ocel.ocdfg import visualizer
from pm4py.visualization.ocel.ocdfg.variants import classic

from soup.core.contracts import Field, NotFoundError, ValidationError

from .codec import decode, encode
from .interactive import interactive_graph

KIND = "pm4py_ocdfg.model"
NAMESPACE = "pm4py_ocdfg"
DEFAULTS = dict(
    annotation="frequency",
    act_metric="events",
    edge_metric="event_couples",
    act_threshold=0,
    edge_threshold=0,
    performance_aggregation="median",
    rankdir="LR",
)
CHOICES = dict(
    annotation=("frequency", "performance"),
    act_metric=("events", "unique_objects", "total_objects"),
    edge_metric=("event_couples", "unique_objects", "total_objects"),
    performance_aggregation=("mean", "median", "min", "max", "sum"),
    rankdir=("LR", "TB"),
)
LABELS = dict(
    annotation="Annotation",
    act_metric="Activity metric",
    edge_metric="Edge metric",
    act_threshold="Minimum activity frequency",
    edge_threshold="Minimum edge frequency",
    performance_aggregation="Performance aggregation",
    rankdir="Direction",
)


def view_fields(defaults=None):
    values = {**DEFAULTS, **(defaults or {})}
    return [
        Field(
            key,
            LABELS[key],
            type="select" if key in CHOICES else "number",
            default=values[key],
            choices=CHOICES.get(key, ()),
            help="" if key in CHOICES else "An integer greater than or equal to zero.",
        )
        for key in DEFAULTS
    ]


def options(params, defaults=None):
    result = {**DEFAULTS, **(defaults or {})}
    result.update({key: params[key] for key in DEFAULTS if key in params})
    for key, choices in CHOICES.items():
        if result[key] not in choices:
            raise ValidationError(f"Invalid value for '{key}'.")
    for key in ("act_threshold", "edge_threshold"):
        value = result[key]
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            or value < 0
            or int(value) != value
        ):
            raise ValidationError(f"'{key}' must be an integer greater than or equal to zero.")
        result[key] = int(value)
    if result["annotation"] == "performance" and result["edge_metric"] == "unique_objects":
        raise ValidationError(
            "PM4Py does not support performance with unique_objects edges. Choose event_couples or total_objects."
        )
    return result


def space(tools):
    return tools.get("storage").space(NAMESPACE)


def save(model, summary, tools):
    filename = f"{uuid.uuid4().hex}.json"
    payload = {"schema": "soup.pm4py_ocdfg/1", "summary": summary, "model": encode(model)}
    space(tools).write(filename, json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8"))
    return filename


def load(obj, tools):
    filename = obj.meta.get("file")
    if not filename or not space(tools).exists(filename):
        raise NotFoundError("OC-DFG model not found in storage.")
    try:
        stored = json.loads(space(tools).read(filename))
        if not isinstance(stored, dict) or stored.get('schema') != 'soup.pm4py_ocdfg/1':
            raise ValueError('Unsupported stored model schema')
        decode(stored['model'])
        stored['summary']['activities']
        return stored
    except (ValueError, KeyError, TypeError) as error:
        raise ValidationError('The stored OC-DFG model is invalid. Rediscover it from its source log.') from error


def dispose(obj, tools):
    if obj.meta.get("file"):
        space(tools).delete(obj.meta["file"])


def graph(model, config):
    # The enum works across PM4Py versions whose underlying parameter key changed.
    parameters = {key: value for key, value in config.items() if key != "performance_aggregation"}
    parameters[classic.Parameters.PERFORMANCE_AGGREGATION_MEASURE] = config["performance_aggregation"]
    parameters.update(format="svg", bgcolor="white")
    return visualizer.apply(model, variant=visualizer.Variants.CLASSIC, parameters=parameters)


def render(model, config):
    try:
        return graph(model, config).pipe(format="svg").decode("utf-8")
    except ExecutableNotFound as error:
        raise ValidationError(
            "Graphviz is unavailable. Install the 'dot' executable on the SOUP server and restart it. "
            "Discovery and JSON/DOT exports remain available."
        ) from error
    except CalledProcessError as error:
        raise ValidationError('Graphviz could not render this OC-DFG. Check the server logs and Graphviz installation.') from error



def summarize(model, log):
    def counts(mapping):
        return {key: len(value) for key, value in sorted(mapping.items())}

    edges = []
    for kind in sorted(model["object_types"]):
        for source, target in sorted(model["edges"]["event_couples"].get(kind, {})):
            pair = (source, target)
            metrics = {metric: len(by_type.get(kind, {}).get(pair, ())) for metric, by_type in model["edges"].items()}
            performance = {}
            for metric, by_type in model.get("edges_performance", {}).items():
                values = by_type.get(kind, {}).get(pair, [])
                if len(values):
                    performance[metric] = {
                        "mean": float(mean(values)),
                        "median": float(median(values)),
                        "min": float(min(values)),
                        "max": float(max(values)),
                        "sum": float(sum(values)),
                    }
            edges.append(
                {
                    "object_type": kind,
                    "source": source,
                    "target": target,
                    "frequency": metrics,
                    "performance_seconds": performance,
                }
            )
    return {
        "events": len(log.events),
        "objects": len(log.objects),
        "relations": len(log.relations),
        "object_types": sorted(model["object_types"]),
        "activities": sorted(model["activities"]),
        "activity_frequency": {metric: counts(values) for metric, values in model["activities_indep"].items()},
        "start_activities": {
            metric: {kind: counts(values) for kind, values in by_type.items()}
            for metric, by_type in model["start_activities"].items()
        },
        "end_activities": {
            metric: {kind: counts(values) for kind, values in by_type.items()}
            for metric, by_type in model["end_activities"].items()
        },
        "edges": edges,
    }


def payload(obj, params, tools):
    stored = load(obj, tools)
    config = options(params, obj.meta.get("view"))
    model = decode(stored["model"])
    interactive = interactive_graph(model, config)
    warning, svg = "", ""
    try:
        svg = render(model, config)
    except ValidationError as error:
        warning = str(error)
    return {"svg": svg, "warning": warning, "options": config, "summary": stored["summary"],
            "interactive": interactive}
