"""
------------------------------------------------------------------------
File : plugin.py
Description: SoupPlugin (the interface every package implements) and
             PluginContext (the facade the host offers to packages during
             registration, so they contribute to the host's registries
             without ever importing the host's concrete implementation).
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping, Sequence
from typing import Any, Protocol

from soup.core.contracts.database import Database
from soup.core.contracts.version import CONTRACTS_API_VERSION

EventHandler = Callable[[Mapping[str, Any]], None]


def contribution_key(package: str, contribution_id: str) -> str:
    """
    The key an importer/operation/visualizer/exporter is registered and
    addressed by: "<package>.<id>". Ids are unique within a package only,
    so two packages may both offer an importer "csv".
    """

    return f"{package}.{contribution_id}"


class PluginContext(Protocol):
    """
    Facade offered to a package's register(ctx) call. Every add_* call
    attributes the contribution to the package currently being
    registered - the package never passes its own name. Duplicate keys
    raise PluginConflictError naming both packages.

    - add_importer / add_operation / add_visualizer / add_exporter:
      keyed by contribution_key(package, id), "<package>.<id>", so ids
      only need to be unique within the package; the routers, the API
      and ObjectRef.created_by.contributor_id use that full key. A
      contribution may only require tools the package requires or
      provides.
    - add_tool: keyed by the tool's global name, which must be declared
      in the package's provides_tools. `tools` gives the package access
      to the tools it requires or provides.
    - add_extension_point(name) opens a point (global name, declared in
      the package's extension_points) that other packages (which list
      this one in `requires`) contribute to with contribute(); the owner
      reads them with contributions(), ordered by `order` then by
      registration.
    - subscribe(event, handler, critical) / publish(event, payload): the
      EventBus. The core publishes only its lifecycle events
      (soup/core/events.py); domain events are constants declared by the
      publishing package in its api.py. A failing handler is logged and
      does not stop the others, unless it subscribed as critical: then
      its error propagates to the publisher.
    """

    @property
    def database(self) -> Database:
        ...

    @property
    def tools(self) -> Any:
        ...

    def add_importer(self, importer: Any) -> None:
        ...

    def add_operation(self, operation: Any) -> None:
        ...

    def add_visualizer(self, visualizer: Any) -> None:
        ...

    def add_exporter(self, exporter: Any) -> None:
        ...

    def add_tool(self, tool: Any) -> None:
        ...

    def add_extension_point(self, name: str) -> None:
        ...

    def contribute(self, point: str, item: Any, key: str, order: int = 0) -> None:
        ...

    def contributions(self, point: str) -> list[Any]:
        ...

    def subscribe(self, event: str, handler: EventHandler, critical: bool = False) -> None:
        ...

    def publish(self, event: str, payload: Mapping[str, Any]) -> None:
        ...


class SoupPlugin(ABC):
    """
    Base interface every package implements. `name` must be unique among
    loaded packages; `requires` lists the names of packages that must
    load (successfully) before this one; `requires_tools` lists the tools
    it uses and `provides_tools` the tools it adds (a package loads after
    the providers of its tools, and is dropped if one is missing);
    `extension_points` the extension points it opens. Tool and extension
    point names are global: two active packages cannot declare the same
    one. `api_version` must be compatible with the host's
    soup.core.contracts.CONTRACTS_API_VERSION (see version.py). For a
    package on disk, all of these come from soup-package.json.
    """

    databases: Sequence[str] = ("memgraph",)
    name: str = ""
    version: str = "0.0.0"
    requires: Sequence[str] = ()
    requires_tools: Sequence[str] = ()
    provides_tools: Sequence[str] = ()
    extension_points: Sequence[str] = ()
    api_version: str = CONTRACTS_API_VERSION

    @abstractmethod
    def register(self, ctx: PluginContext) -> None:
        """Contribute this package's importers/operations/visualizers/... to `ctx`."""
        raise NotImplementedError

    def on_shutdown(self, ctx: PluginContext) -> None:
        """Optional cleanup hook, called in reverse load order. No-op by default."""
        return None
