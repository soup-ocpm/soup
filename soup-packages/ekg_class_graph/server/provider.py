"""
------------------------------------------------------------------------
File : provider.py
Description: ClassStateProvider ("ekg_class_graph.classes"), contributed
             to "ekg.state_providers": an "ekg_class" object is a derived
             object (meta.state {provider, spec: {entity_types}}, its "ekg"
             parent among the parents), so ekg's ensure_loaded rebuilds the
             parent and then builds the classes with this provider - the
             one loading path of every EKG object, used by ekg_views too.
Project : soup-packages/ekg_class_graph
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import soup_pkg_ekg.api as ekg
from soup_pkg_ekg.api import GraphDatabase

from soup.core.contracts import ValidationError

from .classes import build_classes

CLASSES_PROVIDER = "ekg_class_graph.classes"


def entity_types_of(spec: Mapping[str, Any]) -> list[str]:
    types = spec.get("entity_types", [])
    if types is None:
        types = []
    if not isinstance(types, list) or not all(isinstance(item, str) and item for item in types):
        raise ValidationError("Entity types must be a list of non-empty strings (or omitted)")
    # The stored specification represents optional entity dimensions only.
    return list(dict.fromkeys(types))


class ClassStateProvider(ekg.StateProvider):
    key = CLASSES_PROVIDER

    def apply(self, spec: Mapping[str, Any], db: GraphDatabase) -> None:
        build_classes(db.run, entity_types_of(spec))
