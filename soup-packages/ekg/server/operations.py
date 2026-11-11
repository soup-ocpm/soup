"""
------------------------------------------------------------------------
File : operations.py
Description: LoadEkg ("load") - "Carica in Memgraph": makes an "ekg"
             object the graph in Memgraph (ensure_loaded), rebuilding it
             only if another one is active, or always with "force". It
             produces no object.
Project : soup-packages/ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from soup.core.contracts import Field, ObjectDraft, ObjectRef, Operation, OperationInput, ToolAccess

from .builder import EKG_KIND, MEMGRAPH, STORAGE
from .state import ensure_loaded


class LoadEkg(Operation):
    id = "load"
    label = "Load into Memgraph"
    description = "Loads the EKG into Memgraph, rebuilding it from its dataset if another graph is loaded."
    group = "EKG"
    inputs = (OperationInput("ekg", (EKG_KIND,)),)
    produces = (EKG_KIND,)
    requires_tools = (MEMGRAPH, STORAGE)

    def fields(self, inputs: Mapping[str, ObjectRef], tools: ToolAccess) -> list[Field]:
        return [Field("force", "Force rebuild", type="bool", default=False,
                      help="Rebuild the graph even if it is already loaded.")]

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:
        ensure_loaded(inputs["ekg"], tools, force=bool(params.get("force")))
        return []
