"""
------------------------------------------------------------------------
File : plugin_context.py
Description: Concrete, host-side implementation of the PluginContext
             facade (soup.core.contracts.PluginContext) handed to each
             package's register(ctx) call.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from soup.core.contracts import (
    EventHandler,
    Exporter,
    ExtensionPointNotDeclaredError,
    Importer,
    Operation,
    OperationInput,
    SoupPlugin,
    Tool,
    ToolNotDeclaredError,
    Visualizer,
    contribution_key,
)
from soup.core.database import CypherDatabase, DatabaseConfig
from soup.core.event_bus import EventBus
from soup.core.extension_points import ExtensionPoints
from soup.core.registry import Registry
from soup.core.toolbox import ToolBox


def _non_empty_str(value: Any, what: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{what} must be a non-empty string, got {value!r}")
    return value


def _kinds(value: Any, what: str) -> tuple[str, ...]:
    kinds = (value,) if isinstance(value, str) else tuple(value or ())
    if not kinds or not all(isinstance(kind, str) and kind for kind in kinds):
        raise ValueError(f"{what} must list at least one object kind")
    return kinds


class DefaultPluginContext:
    """
    Holds the host's extension registries and attributes every
    contribution to whichever package is currently being registered.
    `PluginManager` opens/closes the current package around each call to
    plugin.register(ctx), and removes its contributions (remove_owner) if
    the call fails; packages never pass their own name. Importers,
    operations, visualizers and exporters are keyed "<package>.<id>"
    (contribution_key); tools and extension points keep their global
    name and must be declared by the package.
    """

    def __init__(self, event_bus: EventBus | None = None, database: CypherDatabase | None = None) -> None:
        self.database = database if database is not None else CypherDatabase(DatabaseConfig())
        self.importers: Registry[Importer] = Registry("importer")
        self.operations: Registry[Operation] = Registry("operation")
        self.visualizers: Registry[Visualizer] = Registry("visualizer")
        self.exporters: Registry[Exporter] = Registry("exporter")
        self.tool_registry: Registry[Tool] = Registry("tool")
        self.extension_points = ExtensionPoints()
        self.event_bus = event_bus if event_bus is not None else EventBus()

        self._current_plugin: str | None = None
        self._declared_tools: frozenset[str] = frozenset()
        self._provides_tools: frozenset[str] = frozenset()
        self._declared_points: frozenset[str] = frozenset()

    def _registries(self) -> tuple[Registry[Any], ...]:
        return (self.importers, self.operations, self.visualizers, self.exporters, self.tool_registry)

    # --- used internally by PluginManager; not part of the package-facing API ---
    def _set_current_plugin(self, name: str | None) -> None:
        self._current_plugin = name
        self._declared_tools = frozenset()
        self._provides_tools = frozenset()
        self._declared_points = frozenset()

    def _begin_plugin(self, plugin: SoupPlugin) -> None:
        self._current_plugin = plugin.name
        self._provides_tools = frozenset(plugin.provides_tools)
        self._declared_tools = frozenset(plugin.requires_tools) | self._provides_tools
        self._declared_points = frozenset(plugin.extension_points)

    def _end_plugin(self) -> None:
        self._set_current_plugin(None)

    def remove_owner(self, owner: str) -> None:
        """Remove everything `owner` contributed: registries, extension points, subscriptions."""

        for registry in self._registries():
            registry.remove_owner(owner)
        self.extension_points.remove_owner(owner)
        self.event_bus.remove_owner(owner)

    def _require_current_plugin(self) -> str:
        if self._current_plugin is None:
            raise RuntimeError("No package is currently being registered")
        return self._current_plugin

    def _check_required_tools(self, contribution: str, requires_tools: Iterable[str]) -> None:
        for tool_name in tuple(requires_tools or ()):
            if tool_name not in self._declared_tools:
                raise ToolNotDeclaredError(f"{self._require_current_plugin()} ({contribution})", tool_name)

    # --- contributions API exposed to packages (soup.core.contracts.PluginContext) ---
    @property
    def tools(self) -> ToolBox:
        """The tools the current package declared (requires_tools + provides_tools)."""

        return ToolBox(self.tool_registry, self._declared_tools, self._require_current_plugin())

    def add_importer(self, importer: Importer) -> None:
        owner = self._require_current_plugin()
        if not isinstance(importer, Importer):
            raise TypeError(f"add_importer expects an Importer, got {type(importer).__name__}")
        key = contribution_key(owner, _non_empty_str(importer.id, "Importer.id"))
        _non_empty_str(importer.produces, f"Importer '{key}'.produces")
        self._check_required_tools(f"importer '{key}'", importer.requires_tools)
        self.importers.register(importer, owner, key)

    def add_operation(self, operation: Operation) -> None:
        owner = self._require_current_plugin()
        if not isinstance(operation, Operation):
            raise TypeError(f"add_operation expects an Operation, got {type(operation).__name__}")
        key = contribution_key(owner, _non_empty_str(operation.id, "Operation.id"))
        inputs = tuple(operation.inputs or ())
        if not inputs or not all(isinstance(item, OperationInput) for item in inputs):
            raise ValueError(f"Operation '{key}'.inputs must list at least one OperationInput")
        names = [item.name for item in inputs]
        if len(set(names)) != len(names):
            raise ValueError(f"Operation '{key}' has duplicate input names {names}")
        _kinds(operation.produces, f"Operation '{key}'.produces")
        self._check_required_tools(f"operation '{key}'", operation.requires_tools)
        self.operations.register(operation, owner, key)

    def add_visualizer(self, visualizer: Visualizer) -> None:
        owner = self._require_current_plugin()
        if not isinstance(visualizer, Visualizer):
            raise TypeError(f"add_visualizer expects a Visualizer, got {type(visualizer).__name__}")
        key = contribution_key(owner, _non_empty_str(visualizer.id, "Visualizer.id"))
        _kinds(visualizer.accepts, f"Visualizer '{key}'.accepts")
        element = _non_empty_str(visualizer.element, f"Visualizer '{key}'.element")
        if "-" not in element:
            raise ValueError(f"Visualizer '{key}'.element must be a custom-element tag (with a '-'), got {element!r}")
        self._check_required_tools(f"visualizer '{key}'", visualizer.requires_tools)
        self.visualizers.register(visualizer, owner, key)

    def add_exporter(self, exporter: Exporter) -> None:
        owner = self._require_current_plugin()
        if not isinstance(exporter, Exporter):
            raise TypeError(f"add_exporter expects an Exporter, got {type(exporter).__name__}")
        key = contribution_key(owner, _non_empty_str(exporter.id, "Exporter.id"))
        _kinds(exporter.accepts, f"Exporter '{key}'.accepts")
        extension = _non_empty_str(exporter.extension, f"Exporter '{key}'.extension")
        if not extension.startswith("."):
            raise ValueError(f"Exporter '{key}'.extension must start with '.', got {extension!r}")
        self._check_required_tools(f"exporter '{key}'", exporter.requires_tools)
        self.exporters.register(exporter, owner, key)

    def add_tool(self, tool: Tool) -> None:
        owner = self._require_current_plugin()
        if not isinstance(tool, Tool):
            raise TypeError(f"add_tool expects a Tool, got {type(tool).__name__}")
        key = _non_empty_str(tool.name, "Tool.name")
        if key not in self._provides_tools:
            raise ToolNotDeclaredError(owner, key, "provides_tools")
        self.tool_registry.register(tool, owner, key)

    def add_extension_point(self, name: str) -> None:
        owner = self._require_current_plugin()
        if name not in self._declared_points:
            raise ExtensionPointNotDeclaredError(owner, name)
        self.extension_points.add_point(name, owner)

    def contribute(self, point: str, item: Any, key: str, order: int = 0) -> None:
        self.extension_points.contribute(point, item, key, order, self._require_current_plugin())

    def contributions(self, point: str) -> list[Any]:
        return self.extension_points.contributions(point)

    def subscribe(self, event: str, handler: EventHandler, critical: bool = False) -> None:
        self.event_bus.subscribe(event, handler, self._require_current_plugin(), critical)

    def publish(self, event: str, payload: Mapping[str, Any]) -> None:
        self.event_bus.publish(event, payload)
