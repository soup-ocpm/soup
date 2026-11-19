"""A JSON graph for soup_base, derived from the complete stored PM4Py model."""
from __future__ import annotations

import json
from statistics import mean, median

ACT_PREFIX = {"events": "E", "unique_objects": "UO", "total_objects": "TO"}
AGGREGATE = {"mean": mean, "median": median, "min": min, "max": max, "sum": sum}


def _id(*parts):
    return json.dumps(parts, ensure_ascii=False, separators=(",", ":"))


def _label(text):
    # soup_base's renderer interprets backslash escapes in labels.
    return str(text).replace("\\", "\\\\").replace("\n", "\\n")


def duration_label(seconds):
    for unit, factor in (("d", 86400), ("h", 3600), ("min", 60)):
        if seconds >= factor:
            return f"{seconds / factor:.3g} {unit}"
    return f"{seconds:.3g} s"


def _activity_nodes(model, config):
    metric = config["act_metric"]
    nodes = []
    for activity, values in sorted(model["activities_indep"][metric].items()):
        if len(values) < config["act_threshold"]:
            continue
        props = {"Category": "Activity", "Activity": activity,
                 **{key: len(counts.get(activity, ())) for key, counts in model["activities_indep"].items()}}
        nodes.append({"id": _id("activity", activity),
                      "label": f"{_label(activity)}\\n{ACT_PREFIX[metric]}={len(values)}",
                      "group": "", "props": props})
    return nodes


def _df_edges(model, config, kind, shown):
    edges = []
    metric = config["edge_metric"]
    for pair, values in sorted(model["edges"][metric].get(kind, {}).items()):
        source, target = (_id("activity", activity) for activity in pair)
        if source not in shown or target not in shown or len(values) < config["edge_threshold"]:
            continue
        props = {"Category": "Directly follows", "Object type": kind, "Source": pair[0], "Target": pair[1],
                 **{key: len(counts.get(kind, {}).get(pair, ())) for key, counts in model["edges"].items()}}
        timings = model.get("edges_performance", {}).get(metric, {}).get(kind, {}).get(pair, ())
        text = str(len(values))
        if len(timings):
            props.update({f"{key} (s)": float(aggregate(timings)) for key, aggregate in AGGREGATE.items()})
        if config["annotation"] == "performance":
            value = props.get(f"{config['performance_aggregation']} (s)")
            text = duration_label(value) if value is not None else "n/a"
        edges.append({"id": _id("df", kind, *pair), "source": source, "target": target,
                      "group": kind, "label": f"{_label(kind)}: {text}", "props": {**props, "weight": len(values)}})
    return edges


def _boundaries(model, config, kind, shown):
    nodes, edges = [], []
    for role, section, caption in (("start", "start_activities", "Start"), ("end", "end_activities", "End")):
        boundary = _id(role, kind)
        for activity, values in sorted(model[section][config["act_metric"]].get(kind, {}).items()):
            aid = _id("activity", activity)
            if aid not in shown or len(values) < config["edge_threshold"]:
                continue
            if not any(node["id"] == boundary for node in nodes):
                nodes.append({"id": boundary, "label": f"{caption}\\n{_label(kind)}", "group": kind,
                              "props": {"Category": caption, "Object type": kind}})
            source, target = (boundary, aid) if role == "start" else (aid, boundary)
            edges.append({"id": _id(role, kind, activity), "source": source, "target": target, "group": kind,
                          "label": f"{_label(kind)}: {len(values)}",
                          "props": {"Category": caption, "Object type": kind, "Activity": activity,
                                    "Metric": config["act_metric"], "Count": len(values), "weight": len(values)}})
    return nodes, edges


def interactive_graph(model, config):
    nodes = _activity_nodes(model, config)
    shown = {node["id"] for node in nodes}
    edges = []
    for kind in sorted(model["object_types"]):
        edges.extend(_df_edges(model, config, kind, shown))
        boundary_nodes, boundary_edges = _boundaries(model, config, kind, shown)
        nodes.extend(boundary_nodes)
        edges.extend(boundary_edges)
    return {"nodes": nodes, "edges": edges, "directed": True}
