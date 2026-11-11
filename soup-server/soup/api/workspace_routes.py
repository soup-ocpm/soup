"""
------------------------------------------------------------------------
File : workspace_routes.py
Description: /api/v3/objects - the workspace over HTTP, delegating to
             WorkspaceService:
             - GET    /api/v3/objects                  provenance tree
             - GET    /api/v3/objects/exists?name=x    {name, exists}
             - GET    /api/v3/objects/<id>
             - PUT    /api/v3/objects/<id>             JSON {name?, description?}
             - DELETE /api/v3/objects/<id>             ?cascade=true, ?force=true
             - GET    /api/v3/objects/<id>/thumbnail   image/svg+xml
             - PUT    /api/v3/objects/<id>/thumbnail   raw SVG body (empty: remove)
             Thumbnails are served with a Content-Security-Policy that
             blocks scripts: an SVG opened directly runs in our origin.
             Domain errors propagate to the handler in flask_app.py.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from flask import Blueprint, Response, request
from flask.typing import ResponseReturnValue

from soup.api import request_args, serializers
from soup.core.engine import Engine

WORKSPACE_ROUTES_BLUEPRINT_NAME = "workspace_routes_bp"

SVG_MIME = "image/svg+xml"
_SVG_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    "X-Content-Type-Options": "nosniff",
}


def build_workspace_blueprint(engine: Engine) -> Blueprint:
    blueprint = Blueprint(WORKSPACE_ROUTES_BLUEPRINT_NAME, __name__)
    workspace = engine.workspace_service

    @blueprint.route("/api/v3/objects", methods=["GET"])
    def list_objects() -> ResponseReturnValue:
        return serializers.ok("Objects", [serializers.workspace_node(node) for node in workspace.list()])

    @blueprint.route("/api/v3/objects/exists", methods=["GET"])
    def object_exists() -> ResponseReturnValue:
        name = request_args.required_arg("name")
        return serializers.ok("Object name", {"name": name, "exists": workspace.exists(name)})

    @blueprint.route("/api/v3/objects/<object_id>", methods=["GET"])
    def get_object(object_id: str) -> ResponseReturnValue:
        return serializers.ok("Object", serializers.object_ref(workspace.get(object_id)))

    @blueprint.route("/api/v3/objects/<object_id>", methods=["PUT"])
    def update_object(object_id: str) -> ResponseReturnValue:
        body = request_args.json_body()
        updated = workspace.update(object_id, name=body.get("name"), description=body.get("description"))
        return serializers.ok("Object updated", serializers.object_ref(updated))

    @blueprint.route("/api/v3/objects/<object_id>", methods=["DELETE"])
    def delete_object(object_id: str) -> ResponseReturnValue:
        deleted = workspace.delete(
            object_id, cascade=request_args.flag("cascade"), force=request_args.flag("force"),
            confirm_database_drop=request_args.flag("confirm_database_drop"),
        )
        return serializers.ok("Object deleted", {"deleted": deleted})

    @blueprint.route("/api/v3/objects/<object_id>/thumbnail", methods=["GET"])
    def get_thumbnail(object_id: str) -> ResponseReturnValue:
        return Response(workspace.thumbnail(object_id), mimetype=SVG_MIME, headers=_SVG_HEADERS)

    @blueprint.route("/api/v3/objects/<object_id>/thumbnail", methods=["PUT"])
    def set_thumbnail(object_id: str) -> ResponseReturnValue:
        workspace.set_thumbnail(object_id, request.get_data(as_text=True))
        return serializers.ok("Thumbnail updated", {"id": object_id})

    return blueprint
