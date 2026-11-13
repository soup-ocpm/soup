"""
------------------------------------------------------------------------
File : core_tools.py
Description: CoreTools - how the core's own services reach the tools
             they depend on (the Catalog and Preferences ports, provided
             by packages), resolve object ids through the catalog and
             build the ToolBox handed to each contribution. A missing
             core tool is not a startup error: the services that need it
             answer 503 with a clear message. Every other tool (memgraph,
             storage, ...) is reached only by the packages that declare
             it, through their ToolBox.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterable, Iterator
from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime
from typing import Any, TypeVar

from soup.core.contracts import (
    CATALOG_TOOL,
    PREFERENCES_TOOL,
    Catalog,
    NotFoundError,
    ObjectRef,
    Preferences,
    ServiceUnavailableError,
    Tool,
    ValidationError,
)
from soup.core.contracts.database import Database
from soup.core.database import resolve_graph_context
from soup.core.registry import Registry
from soup.core.services.catalog_ports import CatalogReader, CatalogWriter
from soup.core.toolbox import ToolBox

T = TypeVar("T", bound=Tool)

ObjectLike = ObjectRef | str

# Core tools: (name, port) pairs that build_engine checks after loading
# the packages, so a missing one is reported in the PackageReport.
CORE_TOOLS: tuple[tuple[str, type[Tool]], ...] = (
    (CATALOG_TOOL, Catalog),
    (PREFERENCES_TOOL, Preferences),
)

# The date format of created_at, the one of the legacy dataset configs:
# datetime.now().strftime(DATE_FORMAT)[:-3], "2025-01-01T10:00:00.123".
DATE_FORMAT = "%Y-%m-%dT%H:%M:%S.%f"


def new_object_id() -> str:
    return str(uuid.uuid4())


def timestamp(clock: Callable[[], datetime]) -> str:
    """DATE_FORMAT with milliseconds: "2025-01-01T10:00:00.123"."""

    return clock().strftime(DATE_FORMAT)[:-3]


def check_object_id(object_id: Any) -> str:
    """Object ids are uuids assigned by the core; anything else is refused (400)."""

    if not isinstance(object_id, str):
        raise ValidationError(f"Invalid object id: {object_id!r}")
    try:
        uuid.UUID(object_id)
    except ValueError:
        raise ValidationError(f"Invalid object id: {object_id!r}") from None
    return object_id


class CoreTools:
    def __init__(
        self, tools: Registry[Tool], *, database: Database | None = None,
        package_databases: Callable[[str], tuple[str, ...]] | None = None,
    ):
        self._tools = tools
        self.database = database
        self._package_databases = package_databases

    def backend(self, obj: ObjectRef) -> str | None:
        target = resolve_graph_context(obj, lambda key: self.catalog_reader().get(key))
        return target[0] if target is not None else None

    def supports(self, package: str, objects: Iterable[ObjectRef] = ()) -> bool:
        if self._package_databases is None or self.database is None:
            return True
        supported = set(self._package_databases(package))
        if not supported.intersection(self.database.backends):
            return False
        return all(self.backend(obj) in supported.intersection(self.database.backends) | {None} for obj in objects)

    @contextmanager
    def graph_scope(self, objects: Iterable[ObjectRef] = (), *, memgraph: bool = False) -> Iterator[None]:
        if memgraph or any(self.backend(obj) == "memgraph" for obj in objects):
            tool = self._tools.get("memgraph")
            if tool is None:
                raise ServiceUnavailableError("Memgraph is not available for this dataset")
            session = getattr(tool, "session", None)
            if not callable(session):
                raise ServiceUnavailableError("The Memgraph provider does not support dataset operation sessions")
            with session():
                yield
        else:
            yield

    def catalog(self) -> Catalog:
        return self._port(CATALOG_TOOL, Catalog, "the object catalog")

    def catalog_reader(self) -> CatalogReader:
        """The catalog, for who only looks objects up."""

        return self.catalog()

    def catalog_writer(self) -> CatalogWriter:
        """The catalog, for who only adds, changes or removes objects."""

        return self.catalog()

    def preferences(self) -> Preferences:
        return self._port(PREFERENCES_TOOL, Preferences, "user preferences")

    def object(self, obj: ObjectLike) -> ObjectRef:
        """Resolve an id (or pass an ObjectRef through). :raises NotFoundError:"""

        if isinstance(obj, ObjectRef):
            return obj
        ref = self.catalog_reader().get(check_object_id(obj))
        if ref is None:
            raise NotFoundError(f"Object '{obj}' not found")
        backend = self.backend(ref)
        if backend and ref.meta.get("backend") != backend:
            ref = replace(ref, meta={**ref.meta, "backend": backend})
        return ref

    def available(self, names: Iterable[str]) -> bool:
        return all(name in self._tools for name in names)

    def toolbox(self, owner: str, requires_tools: Iterable[str]) -> ToolBox:
        return ToolBox(self._tools, tuple(requires_tools or ()), owner)

    def _port(self, name: str, port: type[T], what: str) -> T:
        tool = self._tools.get(name)
        if tool is None:
            raise ServiceUnavailableError(
                f"{what.capitalize()} is not available: no loaded package provides the '{name}' tool"
            )
        if not isinstance(tool, port):
            raise ServiceUnavailableError(
                f"{what.capitalize()} is not available: the '{name}' tool is a "
                f"{type(tool).__name__}, not a {port.__name__}"
            )
        return tool


def missing_core_tools(tools: Registry[Tool]) -> list[str]:
    """Human-readable problems with the core tools, for the PackageReport."""

    problems = []
    for name, port in CORE_TOOLS:
        tool = tools.get(name)
        if tool is None:
            problems.append(f"No package provides the '{name}' tool: services that need it will answer 503")
        elif not isinstance(tool, port):
            problems.append(
                f"The '{name}' tool is a {type(tool).__name__}, not a {port.__name__}: "
                "services that need it will answer 503"
            )
    return problems


def kinds_of(value: Any) -> tuple[str, ...]:
    """A contribution's `accepts`, whether declared as one kind or several."""

    return (value,) if isinstance(value, str) else tuple(value or ())
