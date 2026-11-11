"""
------------------------------------------------------------------------
File : queries.py
Description: What ekg_class_graph contributes to the extension points of
             ekg_views for "ekg_class" objects (kinds ("ekg_class",)):
             - to "ekg.queries" (group "Grafo aggregato"): the :Class
               nodes, the :OBSERVED and :DF_C relationships and their
               counts (the legacy /api/v2/graph/class/nodes, /obs, /dfc
               and their /count);
             - to "ekg.json_parts": "Class nodes", "OBS relationships"
               ({obs_data, obs_count}) and "DF_C relationships"
               ({dfc_data, dfc_count}), each with its own data under its
               own key - the old downloadJsonSelected exported the :CORR
               for OBS and DF_C, and get_obs_relationships_s called its
               count "corr_count".
Project : soup-packages/ekg_class_graph
------------------------------------------------------------------------
"""

from __future__ import annotations

from soup_pkg_ekg_views.api import (
    CountQuery,
    GraphQuery,
    JsonPart,
    NodeListQuery,
    NodesPart,
    RelationshipListQuery,
    RelationshipsPart,
)

from .classes import CLASS, DF_C, EVENT, OBSERVED
from .views import CLASS_KIND

GROUP = "Aggregated graph"
KINDS = (CLASS_KIND,)


def class_queries() -> list[GraphQuery]:
    queries: list[GraphQuery] = [
        NodeListQuery("class.nodes", "Class nodes", GROUP, node_label=CLASS),
        RelationshipListQuery("class.obs", "OBSERVED relationships", GROUP, EVENT, OBSERVED, CLASS),
        RelationshipListQuery("class.dfc", "DF_C relationships", GROUP, CLASS, DF_C, CLASS),
        CountQuery("class.count_nodes", "Number of Class nodes", GROUP, node_label=CLASS),
        CountQuery("class.count_obs", "Number of OBSERVED relationships", GROUP, relationship=OBSERVED),
        CountQuery("class.count_dfc", "Number of DF_C relationships", GROUP, relationship=DF_C),
    ]
    for query in queries:
        query.kinds = KINDS
    return queries


def class_parts() -> list[JsonPart]:
    return [
        NodesPart("class_nodes", "Class nodes", CLASS, KINDS),
        RelationshipsPart("obs", "OBS relationships", EVENT, OBSERVED, CLASS, "obs", KINDS),
        RelationshipsPart("dfc", "DF_C relationships", CLASS, DF_C, CLASS, "dfc", KINDS),
    ]
