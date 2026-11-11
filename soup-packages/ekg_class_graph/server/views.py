"""
------------------------------------------------------------------------
File : views.py
Description: ClassGraphView ("class"), contributed to "ekg.graph_views"
             for "ekg_class" objects: the :DF_C relationships between the
             :Class nodes (the legacy get_limit_class_graph_query) and the
             :OBSERVED ones of the events (hidden by default). A class is
             named by the values of its entity types (its properties but
             Event_Id, Type and Count), like the nodes of the old
             aggregate graph page; a :DF_C is grouped by the entity type
             it aggregates (its Type).
Project : soup-packages/ekg_class_graph
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from soup_pkg_ekg_views.api import EdgeListGraphView

from .classes import CLASS, DF_C, EVENT, OBSERVED

CLASS_KIND = "ekg_class"

_CLASS_KEYS = ("Event_Id", "Type", "Count")


class ClassGraphView(EdgeListGraphView):
    key = "class"
    label = "Aggregated graph"
    kinds = (CLASS_KIND,)
    relationships = {DF_C: (CLASS, CLASS), OBSERVED: (EVENT, CLASS)}
    default_relations = (DF_C,)

    def node_label(self, labels: Sequence[str], props: Mapping[str, Any]) -> str:
        if CLASS in labels:
            values = [str(value) for key, value in sorted(props.items())
                if key not in _CLASS_KEYS and value is not None]
            return " / ".join(values) or str(props.get("Event_Id", CLASS))
        return str(props.get("ActivityName", super().node_label(labels, props)))

    def node_group(self, labels: Sequence[str], props: Mapping[str, Any]) -> str:
        return CLASS if CLASS in labels else EVENT

    def edge_type(self, rel_type: str, props: Mapping[str, Any]) -> str:
        if rel_type == DF_C and props.get("Type"):
            return str(props["Type"])
        return rel_type

    def edge_label(self, rel_type: str, props: Mapping[str, Any]) -> str:
        return self.edge_type(rel_type, props)
