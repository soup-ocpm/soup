"""
------------------------------------------------------------------------
File : serializers.py
Description: The single place where /api/v3 turns what the core returns
             into JSON: objects and the workspace tree, importers,
             operations, visualizers, exporters, fields and preview
             blocks, packages, the frontend manifest, tools and health.
             Every JSON answer uses the Result envelope
             ({http_status_code, message, response_data}) also used by
             the error handler. module_url() is the only place that
             knows the URL of a package's app files.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any
from urllib.parse import quote

from flask import Response, jsonify

from soup.core.contracts import Exporter, Field, Importer, Inspection, ObjectRef, Operation, Visualizer
from soup.core.packages import STATUS_ACTIVE, PackageInfo
from soup.core.packages.frontend import FrontendModule
from soup.core.registry import Registered
from soup.core.results import Result
from soup.core.services.system_service import Health, ToolStatus
from soup.core.services.workspace_service import WorkspaceNode

APP_FILES_URL = "/api/v3/packages/{package}/app/{path}"


def ok(message: str, data: Any = None, status: int = 200) -> tuple[Response, int]:
    return jsonify(Result(status, message, data).to_dict()), status


def module_url(package: str, entry: str | None) -> str | None:
    """The URL of a package's bundle; None when the package has no (active) app part."""

    if not entry:
        return None
    return APP_FILES_URL.format(package=quote(package, safe=""), path=quote(entry, safe="/"))


# --- objects --------------------------------------------------------------- #
def object_ref(obj: ObjectRef) -> dict[str, Any]:
    return obj.to_dict()


def object_refs(objects: Iterable[ObjectRef]) -> list[dict[str, Any]]:
    return [object_ref(obj) for obj in objects]


def workspace_node(node: WorkspaceNode) -> dict[str, Any]:
    return {
        "object": object_ref(node.object),
        "package": node.object.created_by.package,
        "package_status": node.package_status,
        "package_missing": node.package_status != STATUS_ACTIVE,
        "children": [workspace_node(child) for child in node.children],
    }


# --- forms and previews ---------------------------------------------------- #
def fields(items: Iterable[Field]) -> list[dict[str, Any]]:
    return [item.to_dict() for item in items]


def blocks(items: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(block) for block in items]


def inspection(value: Inspection) -> dict[str, Any]:
    return {"preview": blocks(value.preview), "fields": fields(value.fields)}


# --- contributions --------------------------------------------------------- #
def importer(entry: Registered[Importer], entry_url: str | None) -> dict[str, Any]:
    item = entry.item
    return {
        "id": entry.key,
        "label": item.label or item.id,
        "description": item.description,
        "extensions": list(item.extensions),
        "produces": item.produces,
        "package": entry.package,
        "config_element": item.config_element,
        # The module defining config_element; None when the generic form is used.
        "module_url": entry_url if item.config_element else None,
    }


def operation(entry: Registered[Operation]) -> dict[str, Any]:
    item = entry.item
    return {
        "id": entry.key,
        "label": item.label or item.id,
        "description": item.description,
        "group": item.group,
        "inputs": [slot.to_dict() for slot in item.inputs],
        "produces": list(item.produces),
        "package": entry.package,
    }


def visualizer(entry: Registered[Visualizer], entry_url: str | None) -> dict[str, Any]:
    item = entry.item
    return {
        "id": entry.key,
        "label": item.label or item.id,
        "package": entry.package,
        "element": item.element,
        "module_url": entry_url,
    }


def exporter(
    entry: Registered[Exporter], options: Iterable[Field], file_type: tuple[str, str] | None = None
) -> dict[str, Any]:
    """`file_type`: the (extension, mime) of this object's file (default: the exporter's own)."""

    item = entry.item
    extension, mime = file_type or (item.extension, item.mime)
    return {
        "id": entry.key,
        "label": item.label or item.id,
        "package": entry.package,
        "extension": extension,
        "mime": mime,
        "fields": fields(options),
    }


# --- packages and system --------------------------------------------------- #
def package(info: PackageInfo) -> dict[str, Any]:
    return info.to_dict()


def frontend_module(module: FrontendModule) -> dict[str, Any]:
    return {
        "name": module.name,
        "version": module.version,
        "databases": list(module.databases),
        "database": module.database,
        "module_url": module_url(module.name, module.entry),
        "requires": list(module.requires),
    }


def tool_status(tool: ToolStatus) -> dict[str, Any]:
    return {"name": tool.name, "package": tool.package, "ok": tool.ok, "health": dict(tool.health)}


def health(value: Health) -> dict[str, Any]:
    return {
        "status": value.status,
        "tools": [tool_status(tool) for tool in value.tools],
        "problems": list(value.problems),
    }
