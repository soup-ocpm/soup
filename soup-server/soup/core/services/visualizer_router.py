"""
------------------------------------------------------------------------
File : visualizer_router.py
Description: VisualizerRouter - offers the visualizers that accept an
             object's kind (the user picks one when there are several;
             none is a valid answer) and forwards the component's
             requests: data() for the initial JSON, action() for
             interactive requests. package_of() tells the API which
             package serves the Web Component's module.
             visualizers_for_kind() lists them for a kind without an
             object (the host draws the blocks of an import preview with
             a visualizer of "report"). Visualizers are
             addressed by their full key "<package>.<id>"
             (visualizers_for() lists them with their key and package).
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from soup.core.contracts import NotFoundError, ObjectRef, ValidationError, Visualizer
from soup.core.registry import Registered, Registry
from soup.core.services.core_tools import CoreTools, ObjectLike, kinds_of
from soup.core.toolbox import ToolBox


class VisualizerRouter:
    def __init__(self, visualizers: Registry[Visualizer], core_tools: CoreTools):
        self._visualizers = visualizers
        self._core_tools = core_tools

    def visualizers_for(self, obj: ObjectLike) -> list[Registered[Visualizer]]:
        ref = self._core_tools.object(obj)
        found = [entry for entry in self._visualizers.entries() if self._applies(entry.item, ref, entry.package)]
        return sorted(found, key=lambda entry: (entry.item.label.lower(), entry.key))

    def visualizers_for_kind(self, kind: str) -> list[Registered[Visualizer]]:
        if not isinstance(kind, str) or not kind:
            raise ValidationError("Kind must be a non-empty string")
        found = [entry for entry in self._visualizers.entries() if self._accepts_kind(entry.item, kind)]
        return sorted(found, key=lambda entry: (entry.item.label.lower(), entry.key))

    def package_of(self, visualizer_id: str) -> str:
        if self._visualizers.get(visualizer_id) is None:
            raise NotFoundError(f"Visualizer '{visualizer_id}' not found")
        return self._visualizers.owner_of(visualizer_id) or ""

    def data(self, visualizer_id: str, obj: ObjectLike, params: Mapping[str, Any] | None = None) -> Any:
        visualizer, ref = self._resolve(visualizer_id, obj)
        with self._core_tools.graph_scope((ref,)):
            return visualizer.data(ref, dict(params or {}), self._toolbox(visualizer_id, visualizer))

    def action(
        self, visualizer_id: str, obj: ObjectLike, name: str, params: Mapping[str, Any] | None = None
    ) -> Any:
        if not isinstance(name, str) or not name:
            raise ValidationError("Action name must be a non-empty string")
        visualizer, ref = self._resolve(visualizer_id, obj)
        with self._core_tools.graph_scope((ref,)):
            return visualizer.action(ref, name, dict(params or {}), self._toolbox(visualizer_id, visualizer))

    # ------------------------------------------------------------------ #
    def _applies(self, visualizer: Visualizer, obj: ObjectRef, package: str) -> bool:
        return self._accepts_kind(visualizer, obj.kind) and self._core_tools.supports(package, (obj,))

    def _accepts_kind(self, visualizer: Visualizer, kind: str) -> bool:
        return kind in kinds_of(visualizer.accepts) and self._core_tools.available(visualizer.requires_tools)

    def _resolve(self, visualizer_id: str, obj: ObjectLike) -> tuple[Visualizer, ObjectRef]:
        ref = self._core_tools.object(obj)
        visualizer = self._visualizers.get(visualizer_id)
        if visualizer is None or not self._applies(visualizer, ref, self.package_of(visualizer_id)):
            raise NotFoundError(f"Visualizer '{visualizer_id}' is not available for object '{ref.id}'")
        return visualizer, ref

    def _toolbox(self, key: str, visualizer: Visualizer) -> ToolBox:
        return self._core_tools.toolbox(f"visualizer '{key}'", visualizer.requires_tools)
