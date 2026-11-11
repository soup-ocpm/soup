"""
------------------------------------------------------------------------
File : kinds.py
Description: The object kinds a contribution to "ekg.graph_views",
             "ekg.queries" or "ekg.json_parts" applies to: its `kinds`
             attribute, ("ekg",) by default. The standard contributions of
             ekg_views declare STANDARD_KINDS, because the graph of an
             "ekg_class" object (ekg_class_graph) also holds the EKG of its
             parent. accepted_kinds() is what "Interrogazioni" and "JSON
             del grafo" accept: "ekg", plus every other kind that has at
             least one contribution dedicated to it (whose kinds do not
             include "ekg") - so with ekg_class_graph disabled an
             "ekg_class" object gets neither of them.
Project : soup-packages/ekg_views
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

EKG_KIND = "ekg"
OCED_KIND = "oced_importer.log"

DEFAULT_KINDS = (EKG_KIND,)
STANDARD_KINDS = (EKG_KIND, "ekg_class", OCED_KIND)


def kinds_of(item: Any) -> tuple[str, ...]:
    kinds = getattr(item, "kinds", DEFAULT_KINDS)
    return (kinds,) if isinstance(kinds, str) else tuple(kinds or ())


def applies_to(item: Any, kind: str) -> bool:
    return kind in kinds_of(item)


def accepted_kinds(items: Iterable[Any]) -> tuple[str, ...]:
    accepted = [EKG_KIND]
    for item in items:
        kinds = kinds_of(item)
        if OCED_KIND in kinds and OCED_KIND not in accepted:
            accepted.append(OCED_KIND)
        if EKG_KIND in kinds:
            continue
        accepted.extend(kind for kind in kinds if kind not in accepted)
    return tuple(accepted)
