"""Workspace metadata required by the shared SOUP Neo4j EKG consumers."""

from __future__ import annotations

from typing import Any


def soup_metadata(summary: dict[str, Any], *, filename: str = "BPI_Challenge_2017.csv") -> dict[str, Any]:
    return {
        "normalization": summary,
        "log_config": {
            "event_id": "Event_Id",
            "event_activity": "ActivityName",
            "event_timestamp": "Timestamp",
            "entity_id": "Value",
            "events": {"path": filename, "attr": ["Event_Id", "Timestamp", "ActivityName"], "attr_types": {}},
            "entities": {
                kind: {"path": "", "attr": ["Value", "Type"], "attr_types": {}, "type": kind}
                for kind in summary["entities_by_type"]
            },
        },
        "ekg_config": {"type_tag": "Type", "entity_type_mode": "property"},
    }
