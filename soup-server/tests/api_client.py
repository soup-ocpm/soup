"""
------------------------------------------------------------------------
File : api_client.py
Description: Flask test clients for the /api/v3 tests: an app built on
             an engine with the in-memory core tools and packages defined
             in code (mediator_doubles), or with packages written on disk
             (package_builder) in a temporary bundled folder. Also small
             helpers to read the Result envelope and to import a file.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any, Iterable, Optional

from soup.api.flask_app import build_flask_app
from soup.core.contracts import SoupPlugin
from soup.core.engine import Engine, build_engine
from soup.core.settings import Settings
from tests.fakes import CoreToolsPackage


def soup_client(app):
    """
    A test client that, like the SOUP app, sends X-Soup-Client: 1 with every
    request (without it the requests that change data get 403: see
    test_api_v3_security.py for the requests without it).
    """

    client = app.test_client()
    client.environ_base["HTTP_X_SOUP_CLIENT"] = "1"
    return client


def client_for(engine: Engine):
    app = build_flask_app(engine)
    app.config["TESTING"] = True
    return soup_client(app)


def code_client(*packages: SoupPlugin, with_core_tools: bool = True, max_upload_mb: Optional[int] = None):
    """(client, engine, core tools package) with only `packages` loaded, all defined in code."""

    core = CoreToolsPackage()
    env = {"SOUP_PACKAGES": ""}
    if max_upload_mb is not None:
        env["SOUP_MAX_UPLOAD_MB"] = str(max_upload_mb)
    extra = [core, *packages] if with_core_tools else list(packages)
    engine = build_engine(Settings.from_env(env), extra_plugins=extra)
    return client_for(engine), engine, core


def disk_client(tmp_path: Path, extra_plugins: Iterable[SoupPlugin] = (), allow_install: bool = True):
    """
    (client, engine) loading every package written under tmp_path/bundled
    (write them first), plus the in-memory core tools.
    """

    bundled, installed = tmp_path / "bundled", tmp_path / "installed"
    bundled.mkdir(exist_ok=True)
    settings = Settings(
        packages_path=(str(bundled), str(installed)),
        installed_packages_dir=str(installed),
        allow_package_install=allow_install,
    )
    engine = build_engine(settings, extra_plugins=[CoreToolsPackage(), *extra_plugins])
    return client_for(engine), engine


def data_of(response) -> Any:
    assert response.is_json, response.data
    return response.get_json()["response_data"]


def import_file(
    client,
    importer_id: str,
    name: str = "log",
    filename: str = "log.csv",
    content: bytes = b"a,b\n1,2\n",
    **form: Any,
):
    data = {"file": (io.BytesIO(content), filename), "importer_id": importer_id, "name": name, **form}
    if isinstance(data.get("options"), dict):
        data["options"] = json.dumps(data["options"])
    return client.post("/api/v3/imports", data=data, content_type="multipart/form-data")


def imported_id(client, importer_id: str, name: str = "log", **kwargs: Any) -> str:
    response = import_file(client, importer_id, name=name, **kwargs)
    assert response.status_code == 201, response.get_json()
    return data_of(response)["id"]
