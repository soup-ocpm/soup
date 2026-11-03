"""
------------------------------------------------------------------------
File : test_flask_app_errors.py
Description: Tests that the generic error handler in soup/api/flask_app.py
             does not swallow werkzeug.exceptions.HTTPException: routing
             errors Flask/Werkzeug already know how to answer (404 Not
             Found, 405 Method Not Allowed) must come through unchanged,
             not get flattened into a 500 by the catch-all handler.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import pytest

from soup.api.flask_app import build_flask_app
from soup.core.settings import Settings
from tests.api_client import soup_client
from tests.fakes import FakeDatabase, InMemoryFileStorage, fake_tool_engine


@pytest.fixture
def client():
    settings = Settings.from_env({"SOUP_PACKAGES": ""})
    engine = fake_tool_engine(settings, db=FakeDatabase(), files=InMemoryFileStorage())
    app = build_flask_app(engine)
    app.config["TESTING"] = True
    return soup_client(app)


def test_unknown_route_returns_404(client):
    response = client.get("/api/v3/this-route-does-not-exist")
    assert response.status_code == 404


def test_wrong_method_on_known_route_returns_405(client):
    # POST /api/v3/imports exists; GET on it does not.
    response = client.get("/api/v3/imports")
    assert response.status_code == 405


def test_404_body_is_werkzeugs_own_not_the_domain_error_envelope(client):
    response = client.get("/api/v3/this-route-does-not-exist")
    # The generic Exception handler would have wrapped this as
    # {"http_status_code": 500, ...}; a passthrough HTTPException does not.
    assert response.status_code == 404
    assert b"Internal Server Error" not in response.data
