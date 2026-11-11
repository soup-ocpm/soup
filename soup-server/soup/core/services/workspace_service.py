"""
------------------------------------------------------------------------
File : workspace_service.py
Description: WorkspaceService - the objects of the workspace as a tree
             of provenance (an operation's outputs under the objects it
             consumed), plus rename, description, thumbnail and delete.
             Deleting an object publishes "object.before_delete", asks
             the contributor that created it (importer or operation) to
             dispose of its data, then removes it from the catalog. An
             object with children is deleted only with cascade=True
             (children first), otherwise 409. If the contributor of the
             object (or of a descendant, with cascade) is not loaded, its
             data cannot be disposed of: 409 naming the packages
             involved, unless force=True, which removes the objects from
             the catalog only and records them in the OrphanedDataLog so
             the leftovers can be cleaned up later. Each node also says
             whether the package that created the object is active,
             disabled or missing (uninstalled): the object stays in the
             catalog either way. Thumbnails are SVG markup of at most
             MAX_THUMBNAIL_BYTES.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import builtins
import logging
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from typing import Any

from soup.core.contracts import (
    CREATED_BY_IMPORTER,
    ConflictError,
    Importer,
    NotFoundError,
    ObjectRef,
    Operation,
    ValidationError,
    validate_name,
)
from soup.core.contracts.database import Database
from soup.core.event_bus import EventBus
from soup.core.events import OBJECT_BEFORE_DELETE
from soup.core.registry import Registry
from soup.core.services.core_tools import CoreTools
from soup.core.services.orphaned_data import OrphanedDataLog

_LOGGER = logging.getLogger("soup.workspace")

# Package name -> "active" | "disabled" | "missing" (PackageManager.package_status).
PackageStatus = Callable[[str], str]


MAX_THUMBNAIL_BYTES = 1024 * 1024


def _always_active(package: str) -> str:
    return "active"


@dataclass
class WorkspaceNode:
    object: ObjectRef
    children: list[WorkspaceNode] = field(default_factory=list)
    package_status: str = "active"

    def to_dict(self) -> dict[str, Any]:
        return {
            "object": self.object.to_dict(),
            "package_status": self.package_status,
            "children": [child.to_dict() for child in self.children],
        }


def _order(obj: ObjectRef) -> tuple[str, str, str]:
    return (obj.created_at, obj.name.lower(), obj.id)


class WorkspaceService:
    def __init__(  # noqa: PLR0913, PLR0917 - the collaborators, injected by build_engine
        self,
        importers: Registry[Importer],
        operations: Registry[Operation],
        core_tools: CoreTools,
        event_bus: EventBus,
        package_status: PackageStatus = _always_active,
        orphaned_data: OrphanedDataLog | None = None,
        database: Database | None = None,
    ):
        self._importers = importers
        self._operations = operations
        self._core_tools = core_tools
        self._event_bus = event_bus
        self._package_status = package_status
        self._orphaned_data = orphaned_data
        self._database = database

    def list(self) -> builtins.list[WorkspaceNode]:
        """
        Roots are objects with no parent in the catalog. An object with
        several parents (an operation with several inputs) appears under
        each of them.
        """

        objects = sorted(self._core_tools.catalog_reader().list(), key=_order)
        ids = {obj.id for obj in objects}
        children: dict[str, builtins.list[ObjectRef]] = {}
        roots = []
        for obj in objects:
            known_parents = [parent for parent in dict.fromkeys(obj.parents) if parent in ids]
            if not known_parents:
                roots.append(obj)
            for parent in known_parents:
                children.setdefault(parent, []).append(obj)

        def build(obj: ObjectRef, path: frozenset[str]) -> WorkspaceNode:
            node = WorkspaceNode(obj, package_status=self._package_status(obj.created_by.package))
            for child in children.get(obj.id, ()):
                if child.id not in path:  # defensive: provenance should never loop
                    node.children.append(build(child, path | {child.id}))
            return node

        return [build(root, frozenset({root.id})) for root in roots]

    def get(self, object_id: str) -> ObjectRef:
        return self._core_tools.object(object_id)

    def exists(self, name: str) -> bool:
        """Whether an object is already called `name` (names are not unique: the UI warns)."""

        if not isinstance(name, str) or not name:
            raise ValidationError("Name must be a non-empty string")
        return any(obj.name == name for obj in self._core_tools.catalog_reader().list())

    def update(self, object_id: str, name: str | None = None, description: str | None = None) -> ObjectRef:
        """Change the name and/or the description; None leaves a value as it is."""

        ref = self.get(object_id)
        if name is not None:
            validate_name(name)
            ref = replace(ref, name=name)
        if description is not None:
            if not isinstance(description, str):
                raise ValidationError("Description must be a string")
            ref = replace(ref, description=description)
        return self._update(ref)

    def rename(self, object_id: str, name: str) -> ObjectRef:
        validate_name(name)
        return self._update(replace(self.get(object_id), name=name))

    def update_description(self, object_id: str, description: str) -> ObjectRef:
        if not isinstance(description, str):
            raise ValidationError("Description must be a string")
        return self._update(replace(self.get(object_id), description=description))

    def get_thumbnail(self, object_id: str) -> str | None:
        ref = self.get(object_id)
        return self._core_tools.catalog_reader().get_thumbnail(ref.id)

    def thumbnail(self, object_id: str) -> str:
        """:raises NotFoundError: unknown object, or no thumbnail set"""

        svg = self.get_thumbnail(object_id)
        if svg is None:
            raise NotFoundError(f"Object '{object_id}' has no thumbnail")
        return svg

    def set_thumbnail(self, object_id: str, svg: str | None) -> None:
        """`svg` None (or empty) removes the thumbnail."""

        if svg is not None and not isinstance(svg, str):
            raise ValidationError("Thumbnail must be SVG text")
        if svg is not None and not svg.strip():
            svg = None
        if svg is not None:
            if len(svg.encode("utf-8")) > MAX_THUMBNAIL_BYTES:
                raise ValidationError(f"Thumbnail must be at most {MAX_THUMBNAIL_BYTES // 1024} KB")
            if "<svg" not in svg:
                raise ValidationError("Thumbnail must be SVG markup")
        ref = self.get(object_id)
        self._core_tools.catalog_writer().set_thumbnail(ref.id, svg)

    def delete(
        self, object_id: str, cascade: bool = False, force: bool = False, *, confirm_database_drop: bool = False
    ) -> builtins.list[str]:
        """
        Return the ids deleted, children before parents.
        :raises ConflictError: the object has children and cascade is
            False; or the contributor of one of the objects to delete is
            not loaded and force is False (details: packages, objects)
        """

        root = self.get(object_id)
        catalog = self._core_tools.catalog()
        direct_children = catalog.children(root.id)
        if direct_children and not cascade:
            raise ConflictError(
                f"Object '{root.name}' has {len(direct_children)} derived object(s); delete them first or use cascade",
                details={"children": [child.id for child in direct_children]},
            )

        ordered: builtins.list[ObjectRef] = []
        seen: set[str] = set()

        def visit(obj: ObjectRef) -> None:
            seen.add(obj.id)
            for child in sorted(catalog.children(obj.id), key=_order):
                if child.id not in seen:
                    visit(child)
            ordered.append(obj)

        visit(root)
        orphans = [obj for obj in ordered if self._contributor(obj) is None]
        if orphans and not force:
            packages = list(dict.fromkeys(obj.created_by.package for obj in orphans))
            names = ", ".join(f"'{package}'" for package in packages)
            raise ConflictError(
                f"Package {names} is not active: enable it again to delete the data too, "
                "or use force=true to remove the objects from the catalog only",
                details={"packages": packages, "objects": [obj.id for obj in orphans]},
            )
        databases = [
            obj.meta["neo4j_database"] for obj in ordered
            if obj.meta.get("neo4j_managed") is True and self._contributor(obj) is not None
        ]
        if databases and not confirm_database_drop:
            raise ValidationError(
                "Deletion irreversibly drops the registered Neo4j database and ALL its nodes and relationships. "
                "Explicitly confirm database deletion.", details={"databases": databases},
            )
        for obj in ordered:
            self._delete_one(obj, confirm_database_drop=confirm_database_drop)
        return [obj.id for obj in ordered]

    # ------------------------------------------------------------------ #
    def _update(self, ref: ObjectRef) -> ObjectRef:
        self._core_tools.catalog_writer().update(ref)
        return ref

    def _contributor(self, obj: ObjectRef) -> Any:
        """The loaded importer/operation able to dispose of `obj`, or None."""

        creator = obj.created_by
        registry: Registry[Any] = self._importers if creator.type == CREATED_BY_IMPORTER else self._operations
        contributor = registry.get(creator.contributor_id)
        if contributor is None or not self._core_tools.available(contributor.requires_tools):
            return None
        return contributor

    def _delete_one(self, obj: ObjectRef, *, confirm_database_drop: bool = False) -> None:
        self._event_bus.publish(OBJECT_BEFORE_DELETE, {"object": obj.to_dict()})
        creator = obj.created_by
        contributor = self._contributor(obj)
        if contributor is None:
            # Only reached with force=True (delete() refuses otherwise).
            _LOGGER.warning(
                "%s '%s' (package '%s') is not loaded: data of object '%s' was not disposed of",
                creator.type, creator.contributor_id, creator.package, obj.id,
            )
            if self._orphaned_data is not None:
                self._orphaned_data.record(obj)
        else:
            tools = self._core_tools.toolbox(f"{creator.type} '{creator.contributor_id}'", contributor.requires_tools)
            if obj.meta.get("neo4j_managed") is True:
                if self._database is None or self._database.backend != "neo4j":
                    raise ValidationError("Neo4j is required to delete this managed dataset database.")
                self._database.drop_dataset(obj.id, confirmed=confirm_database_drop)
            contributor.dispose(obj, tools)
        self._core_tools.catalog_writer().remove(obj.id)
