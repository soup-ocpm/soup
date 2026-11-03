"""
------------------------------------------------------------------------
File : test_api_v3_security.py
Description: Requests from other sites (soup/api/security.py and the CORS
             of flask_app.py). A request that changes data (POST, PUT,
             PATCH, DELETE under /api/v3) without X-Soup-Client: 1 gets
             403 and changes nothing; with it, it passes, unless its
             Origin is neither one of SOUP_CORS_ORIGINS nor the backend's
             own. GET needs no header. CORS answers the preflight of the
             app's origins (X-Soup-Client allowed, Content-Disposition
             exposed) and gives no Access-Control-Allow-Origin to any
             other origin. SOUP_CORS_ORIGINS is read by Settings.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import pytest

from soup.api.flask_app import build_flask_app
from soup.api.security import CLIENT_HEADER, mutation_refusal
from soup.core.engine import build_engine
from soup.core.settings import DEFAULT_CORS_ORIGINS, Settings
from tests.api_client import code_client, data_of
from tests.fakes import CoreToolsPackage

APP = "http://localhost:4200"
EVIL = "https://evil.example"
PREFERENCE = "/api/v3/preferences/theme"


@pytest.fixture
def clients():
    """(with the header, as the app; without it, as a page of another site or a bare script)."""

    client, engine, _core = code_client()
    app = build_flask_app(engine)
    app.config["TESTING"] = True
    return client, app.test_client()


def stored(client) -> object:
    return data_of(client.get(PREFERENCE))["value"]


# --------------------------------------------------------------------------- the header
@pytest.mark.parametrize(("method", "path"), [
    ("post", "/api/v3/operations/x/run"),
    ("put", PREFERENCE),
    ("patch", PREFERENCE),
    ("delete", "/api/v3/objects/missing"),
])
def test_a_request_that_changes_data_without_the_header_gets_403(clients, method, path):
    _, bare = clients
    response = getattr(bare, method)(path, json={"value": "dark"})
    assert response.status_code == 403
    assert f"Missing header {CLIENT_HEADER}" in response.get_json()["message"]


def test_without_the_header_nothing_changes_and_with_it_the_change_is_made(clients):
    app_client, bare = clients
    assert bare.put(PREFERENCE, json={"value": "dark"}).status_code == 403
    assert stored(app_client) is None

    assert app_client.put(PREFERENCE, json={"value": "dark"}).status_code == 200
    assert stored(app_client) == "dark"


def test_get_needs_no_header(clients):
    _, bare = clients
    assert bare.get("/api/v3/health").status_code == 200
    assert bare.get(PREFERENCE).status_code == 200


def test_the_header_must_be_1(clients):
    _, bare = clients
    assert bare.put(PREFERENCE, json={"value": "x"}, headers={CLIENT_HEADER: "yes"}).status_code == 403
    assert bare.put(PREFERENCE, json={"value": "x"}, headers={CLIENT_HEADER: "1"}).status_code == 200


# --------------------------------------------------------------------------- the Origin, in depth
def test_with_the_header_but_from_another_site_it_gets_403(clients):
    app_client, _ = clients
    response = app_client.put(PREFERENCE, json={"value": "evil"}, headers={"Origin": EVIL})
    assert response.status_code == 403
    assert response.get_json()["message"].startswith(f"Origin {EVIL} not allowed")
    assert stored(app_client) is None


@pytest.mark.parametrize("origin", [APP, "http://127.0.0.1:4200", "http://localhost"])
def test_with_the_header_from_the_app_or_the_backend_itself_it_passes(clients, origin):
    # http://localhost is the backend's own origin in the test client.
    app_client, _ = clients
    assert app_client.put(PREFERENCE, json={"value": origin}, headers={"Origin": origin}).status_code == 200
    assert stored(app_client) == origin


@pytest.mark.parametrize(("method", "path", "headers", "expected"), [
    ("GET", "/api/v3/objects", {"Origin": EVIL}, None),
    ("OPTIONS", "/api/v3/objects", {"Origin": EVIL}, None),
    ("POST", "/not-the-api", {}, None),
    ("POST", "/api/v3", {}, "Missing header"),
    ("POST", "/api/v3x/run", {}, None),
    ("post", "/api/v3/run", {CLIENT_HEADER: "1"}, None),
    ("POST", "/api/v3/run", {CLIENT_HEADER: "1", "Origin": "http://localhost:4200/"}, None),
    ("POST", "/api/v3/run", {CLIENT_HEADER: "1", "Origin": "null"}, "Origin null not allowed"),
])
def test_mutation_refusal(method, path, headers, expected):
    reason = mutation_refusal(method, path, headers, "http://127.0.0.1:8080", DEFAULT_CORS_ORIGINS)
    if expected is None:
        assert reason is None
    else:
        assert reason is not None and reason.startswith(expected)


# --------------------------------------------------------------------------- CORS
def test_the_preflight_of_the_app_allows_the_header(clients):
    _, bare = clients
    response = bare.options(PREFERENCE, headers={
        "Origin": APP,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type, x-soup-client",
    })
    assert response.headers["Access-Control-Allow-Origin"] == APP
    allowed = response.headers["Access-Control-Allow-Headers"].lower()
    assert "x-soup-client" in allowed
    assert "content-type" in allowed


def test_another_origin_gets_no_cors_header(clients):
    _, bare = clients
    preflight = bare.options(PREFERENCE, headers={
        "Origin": EVIL,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "x-soup-client",
    })
    assert "Access-Control-Allow-Origin" not in preflight.headers
    assert "Access-Control-Allow-Origin" not in bare.get("/api/v3/health", headers={"Origin": EVIL}).headers


def test_the_app_reads_the_answers_and_content_disposition(clients):
    _, bare = clients
    response = bare.get("/api/v3/health", headers={"Origin": APP})
    assert response.headers["Access-Control-Allow-Origin"] == APP
    assert "Content-Disposition" in response.headers["Access-Control-Expose-Headers"]


# --------------------------------------------------------------------------- settings
def test_soup_cors_origins_is_read_from_the_environment():
    assert Settings.from_env({}).cors_origins == ("http://localhost:4200", "http://127.0.0.1:4200")
    assert Settings.from_env({"SOUP_CORS_ORIGINS": "http://localhost:5000/, http://example.test "}).cors_origins == (
        "http://localhost:5000",
        "http://example.test",
    )
    # Empty: the defaults (an empty list would lock the app out).
    assert Settings.from_env({"SOUP_CORS_ORIGINS": " , "}).cors_origins == DEFAULT_CORS_ORIGINS


def test_the_origins_of_the_settings_are_the_ones_cors_answers():
    settings = Settings.from_env({"SOUP_PACKAGES": "", "SOUP_CORS_ORIGINS": "http://localhost:5000"})
    bare = build_flask_app(build_engine(settings, extra_plugins=[CoreToolsPackage()])).test_client()

    allowed = bare.get("/api/v3/health", headers={"Origin": "http://localhost:5000"})
    assert allowed.headers["Access-Control-Allow-Origin"] == "http://localhost:5000"
    assert "Access-Control-Allow-Origin" not in bare.get("/api/v3/health", headers={"Origin": APP}).headers
    # And a change from the default app origin is refused, it is not in the list any more.
    refused = bare.put(PREFERENCE, json={"value": "x"}, headers={CLIENT_HEADER: "1", "Origin": APP})
    assert refused.status_code == 403
