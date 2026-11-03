"""
------------------------------------------------------------------------
File : test_package_routes.py
Description: Tests for /api/v3/packages (soup/api/package_routes.py):
             list, install from a multipart zip, disable with a 409 that
             carries the dependents, enable, uninstall, and 403 when
             installation is not allowed.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import io
import sys

import pytest

from soup.api.flask_app import build_flask_app
from soup.core.engine import build_engine
from soup.core.settings import Settings
from tests.api_client import soup_client
from tests.package_builder import build_zip, write_package


@pytest.fixture(autouse=True)
def _forget_test_modules():
    before = set(sys.modules)
    yield
    for name in set(sys.modules) - before:
        if name.startswith("soup_pkg_"):
            del sys.modules[name]


def _client(tmp_path, allow_install=True):
    bundled, installed = tmp_path / "bundled", tmp_path / "installed"
    write_package(bundled, "alpha")
    settings = Settings(
        packages_path=(str(bundled), str(installed)),
        installed_packages_dir=str(installed),
        allow_package_install=allow_install,
    )
    app = build_flask_app(build_engine(settings))
    app.config["TESTING"] = True
    return soup_client(app)


def _upload(client, data, **form):
    return client.post(
        "/api/v3/packages",
        data={"file": (io.BytesIO(data), "package.zip"), **form},
        content_type="multipart/form-data",
    )


def test_list_packages(tmp_path):
    response = _client(tmp_path).get("/api/v3/packages")

    assert response.status_code == 200
    [alpha] = response.get_json()["response_data"]
    assert (alpha["name"], alpha["status"], alpha["origin"]) == ("alpha", "active", "bundled")
    # The default template registers only its marker importer.
    assert alpha["contributions"] == {
        "importers": ["alpha.alpha"], "operations": [], "visualizers": [], "exporters": [], "tools": [],
    }


def test_install_disable_enable_uninstall(tmp_path):
    client = _client(tmp_path)

    installed = _upload(client, build_zip(tmp_path, "beta", requires=["alpha"]))
    assert installed.status_code == 201
    assert installed.get_json()["response_data"]["status"] == "active"

    conflict = client.post("/api/v3/packages/alpha/disable")
    assert conflict.status_code == 409
    assert conflict.get_json()["response_data"] == {"dependents": ["beta"]}

    cascade = client.post("/api/v3/packages/alpha/disable?cascade=true")
    assert cascade.status_code == 200
    assert cascade.get_json()["response_data"] == {"disabled": ["beta", "alpha"]}

    assert client.post("/api/v3/packages/alpha/enable").status_code == 200
    assert client.post("/api/v3/packages/beta/enable").get_json()["response_data"]["status"] == "active"

    assert client.delete("/api/v3/packages/beta").status_code == 200
    names = [item["name"] for item in client.get("/api/v3/packages").get_json()["response_data"]]
    assert names == ["alpha"]


def test_install_errors_are_translated(tmp_path):
    client = _client(tmp_path)

    assert client.post("/api/v3/packages", data={}, content_type="multipart/form-data").status_code == 400
    assert _upload(client, b"not a zip").status_code == 400
    assert _upload(client, build_zip(tmp_path, "alpha", version="2.0.0")).status_code == 409
    assert _upload(client, build_zip(tmp_path, "alpha", version="2.0.0"), allow_override="true").status_code == 201
    assert client.post("/api/v3/packages/ghost/enable").status_code == 404
    assert client.post("/api/v3/packages/..%2Fetc/enable").status_code in (400, 404)


def test_install_and_uninstall_are_403_when_not_allowed(tmp_path):
    client = _client(tmp_path, allow_install=False)

    response = _upload(client, build_zip(tmp_path, "beta"))

    assert response.status_code == 403
    assert "SOUP_ALLOW_PACKAGE_INSTALL" in response.get_json()["message"]
    assert client.delete("/api/v3/packages/alpha").status_code == 403
