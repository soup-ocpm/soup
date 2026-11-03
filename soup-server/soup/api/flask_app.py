"""
------------------------------------------------------------------------
File : flask_app.py
Description: build_flask_app(engine) assembles the Flask app from the
             /api/v3 blueprints (workspace, import, operation,
             visualizer, package and system), thin wrappers around the
             core routers that serialize through serializers.py.
             Request bodies are capped at Settings.max_upload_mb (413).
             CORS answers only the origins of the SOUP app
             (Settings.cors_origins); a request that changes data needs
             the header X-Soup-Client and an allowed Origin, if it has one
             (security.py), otherwise 403.
             soup/api is the only place in soup/ that imports Flask;
             soup/core and the packages never do.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import logging

from flask import Flask, Request, current_app, jsonify, request
from flask.typing import ResponseReturnValue
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from soup.api.import_routes import build_import_blueprint
from soup.api.operation_routes import build_operation_blueprint
from soup.api.package_routes import build_package_blueprint
from soup.api.security import CLIENT_HEADER, mutation_refusal
from soup.api.system_routes import build_system_blueprint
from soup.api.visualizer_routes import build_visualizer_blueprint
from soup.api.workspace_routes import build_workspace_blueprint
from soup.core.contracts.errors import DomainError
from soup.core.engine import Engine
from soup.core.results import Result

V3_PREFIX = "/api/v3/"
V3_MAX_CONTENT_LENGTH = "SOUP_V3_MAX_CONTENT_LENGTH"


class SoupRequest(Request):
    """
    MAX_CONTENT_LENGTH is app-wide: this request applies the upload
    limit to /api/v3 (the package bundles and the other routes are not
    uploads). Werkzeug answers 413 when the body is larger. As in Flask
    3.1, a limit set on the request itself wins (nothing sets one).
    """

    @property
    def max_content_length(self) -> int | None:
        if self._max_content_length is not None:
            return self._max_content_length
        if self.path.startswith(V3_PREFIX):
            return current_app.config.get(V3_MAX_CONTENT_LENGTH)
        return super().max_content_length

    @max_content_length.setter
    def max_content_length(self, value: int | None) -> None:
        self._max_content_length = value


def build_flask_app(engine: Engine) -> Flask:
    app = Flask(__name__)
    app.request_class = SoupRequest
    app.config[V3_MAX_CONTENT_LENGTH] = engine.settings.max_upload_bytes

    app.register_blueprint(build_package_blueprint(engine))
    app.register_blueprint(build_workspace_blueprint(engine))
    app.register_blueprint(build_import_blueprint(engine))
    app.register_blueprint(build_operation_blueprint(engine))
    app.register_blueprint(build_visualizer_blueprint(engine))
    app.register_blueprint(build_system_blueprint(engine))
    _register_error_handlers(app)
    _register_mutation_guard(app, engine.settings.cors_origins)

    # Only the pages of the SOUP app may call the API from a browser; they
    # send X-Soup-Client on the requests that change data (allowed by the
    # preflight). The host reads the name of an exported file from
    # Content-Disposition: on another origin the browser hides the header
    # unless it is exposed.
    CORS(
        app,
        origins=list(engine.settings.cors_origins),
        allow_headers=["Content-Type", CLIENT_HEADER],
        expose_headers=["Content-Disposition"],
    )

    log = logging.getLogger("werkzeug")
    log.setLevel(logging.ERROR)

    return app


def _register_mutation_guard(app: Flask, allowed_origins: tuple[str, ...]) -> None:
    """403 for a request that changes data without X-Soup-Client or from another site (security.py)."""

    @app.before_request
    def _refuse_foreign_mutations() -> ResponseReturnValue | None:
        own_origin = f"{request.scheme}://{request.host}"
        headers = {name: request.headers.get(name, "") for name in (CLIENT_HEADER, "Origin")}
        reason = mutation_refusal(request.method, request.path, headers, own_origin, allowed_origins)
        if reason is None:
            return None
        return jsonify(Result(403, reason).to_dict()), 403


def _register_error_handlers(app: Flask) -> None:
    """One place that turns an exception into an HTTP response."""

    @app.errorhandler(DomainError)
    def _handle_domain_error(error: DomainError) -> ResponseReturnValue:
        # `details` (e.g. the packages blocking a disable) go in response_data.
        result = Result(error.http_status_code, str(error), error.details or None)
        return jsonify(result.to_dict()), error.http_status_code

    @app.errorhandler(HTTPException)
    def _handle_http_exception(error: HTTPException) -> ResponseReturnValue:
        # Flask/Werkzeug's own routing errors (404 Not Found, 405 Method
        # Not Allowed, ...) are already well-formed responses - let them
        # through as-is instead of flattening them into a 500.
        return error

    @app.errorhandler(Exception)
    def _handle_unexpected_error(error: Exception) -> ResponseReturnValue:
        result = Result(500, f"Internal Server Error: {error}")
        return jsonify(result.to_dict()), 500
