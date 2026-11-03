"""
------------------------------------------------------------------------
File : test_api_v3_packages_frontend.py
Description: Tests for the package side of /api/v3 (soup/api/
             package_routes.py, soup/core/packages/frontend.py): the
             contributions and errors in GET /api/v3/packages, the static
             files of app/dist (Content-Type, an ETag per file from version, size and mtime, 304,
             every path escaping app/dist refused), the frontend manifest
             ordered by dependencies, and a disabled package disappearing
             from importers, operations, visualizers, manifest and files.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import os

import pytest

from soup.core.contracts import NotFoundError

from tests.api_client import data_of, disk_client, imported_id
from tests.package_builder import FAILING_PLUGIN, FEATURE_PLUGIN, write_package

BUNDLE = b"customElements.define('feat-view', class extends HTMLElement {});"


def _feature(tmp_path, name="feat", **kwargs):
    files = {"dist/index.js": BUNDLE, "dist/styles/main.css": b"a{}", "src/secret.ts": b"source"}
    return write_package(
        tmp_path / "bundled", name, plugin_source=FEATURE_PLUGIN, app_entry="dist/index.js", app_files=files, **kwargs
    )


def test_packages_list_contributions_and_errors(tmp_path):
    _feature(tmp_path)
    write_package(tmp_path / "bundled", "broken", plugin_source=FAILING_PLUGIN)
    client, _ = disk_client(tmp_path)

    by_name = {info["name"]: info for info in data_of(client.get("/api/v3/packages"))}

    feat = by_name["feat"]
    assert (feat["status"], feat["version"], feat["app_entry"]) == ("active", "1.0.0", "dist/index.js")
    assert feat["contributions"] == {
        "importers": ["feat.csv"],
        "operations": ["feat.copy"],
        "visualizers": ["feat.view"],
        "exporters": [],
        "tools": [],
    }
    broken = by_name["broken"]
    assert broken["status"] == "failed"
    assert "register failed on purpose" in broken["error"]
    assert all(keys == [] for keys in broken["contributions"].values())


def test_static_files_of_app_dist(tmp_path):
    _feature(tmp_path)
    client, _ = disk_client(tmp_path)

    response = client.get("/api/v3/packages/feat/app/index.js")
    assert response.status_code == 200
    assert response.mimetype == "text/javascript"
    assert response.data == BUNDLE
    etag = response.headers["ETag"]
    assert "feat-1.0.0" in etag

    css = client.get("/api/v3/packages/feat/app/styles/main.css")
    assert (css.status_code, css.mimetype) == (200, "text/css")

    cached = client.get("/api/v3/packages/feat/app/index.js", headers={"If-None-Match": etag})
    assert cached.status_code == 304
    cached.close()  # a 304 has no body to read: release the file send_file opened

    assert client.get("/api/v3/packages/feat/app/missing.js").status_code == 404
    assert client.get("/api/v3/packages/ghost/app/index.js").status_code == 404
    assert client.get("/api/v3/packages/_x/app/index.js").status_code == 404


@pytest.mark.parametrize("path", [
    "../src/secret.ts",
    "..%2fsrc%2fsecret.ts",
    "%2e%2e/src/secret.ts",
    "styles/../../src/secret.ts",
    "..\\src\\secret.ts",
    "..%5csrc%5csecret.ts",
    "../../soup-package.json",
    "../../server/plugin.py",
    "C:/Windows/win.ini",
    "index.js%00.css",
])
def test_static_files_never_leave_app_dist(tmp_path, path):
    _feature(tmp_path)
    client, _ = disk_client(tmp_path)

    response = client.get(f"/api/v3/packages/feat/app/{path}")

    assert response.status_code == 404
    assert b"source" not in response.data
    assert b"register" not in response.data


@pytest.mark.parametrize("path", ["/etc/passwd", r"C:\Windows\win.ini", "", "../index.js", "dist/../../x"])
def test_app_file_refuses_absolute_and_unsafe_paths(tmp_path, path):
    # "//etc/passwd" never reaches the route (Werkzeug merges the slashes
    # with a redirect): check the core directly.
    _feature(tmp_path)
    _, engine = disk_client(tmp_path)

    with pytest.raises(NotFoundError):
        engine.frontend.app_file("feat", path)


def test_every_file_of_a_package_has_its_own_etag(tmp_path):
    _feature(tmp_path)
    client, _ = disk_client(tmp_path)

    bundle = client.get("/api/v3/packages/feat/app/index.js").headers["ETag"]
    css = client.get("/api/v3/packages/feat/app/styles/main.css").headers["ETag"]

    assert bundle != css
    assert "feat-1.0.0-" in bundle and "feat-1.0.0-" in css


REBUILT = b"export const rebuilt = 'with more code';"
REBUILT_AGAIN = b"export const rebuilt = 'with more CODE';"  # the same size as REBUILT


def test_a_rebuilt_bundle_with_the_same_version_gets_a_new_etag(tmp_path):
    package_dir = _feature(tmp_path)
    client, _ = disk_client(tmp_path)
    bundle = package_dir / "app" / "dist" / "index.js"
    url = "/api/v3/packages/feat/app/index.js"
    old = client.get(url).headers["ETag"]

    # Rebuilt: another content, the version unchanged.
    bundle.write_bytes(REBUILT)
    new = client.get(url).headers["ETag"]
    assert new != old

    # The same size, written later (the modification time changes).
    stat = bundle.stat()
    bundle.write_bytes(REBUILT_AGAIN)
    os.utime(bundle, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000_000))
    newest = client.get(url).headers["ETag"]
    assert newest not in (old, new)

    # The browser's copy: still valid with the current ETag, refreshed with the old one.
    current = client.get(url, headers={"If-None-Match": newest})
    assert current.status_code == 304
    current.close()
    stale = client.get(url, headers={"If-None-Match": old})
    assert stale.status_code == 200
    assert stale.data == REBUILT_AGAIN


def test_the_etag_is_computed_from_the_metadata_only(tmp_path):
    package_dir = _feature(tmp_path)
    client, _ = disk_client(tmp_path)
    bundle = package_dir / "app" / "dist" / "index.js"
    stat = bundle.stat()

    etag = client.get("/api/v3/packages/feat/app/index.js").headers["ETag"]

    assert etag == f'"feat-1.0.0-{stat.st_size}-{stat.st_mtime_ns}"'


def test_static_files_do_not_follow_links_out_of_dist(tmp_path):
    package_dir = _feature(tmp_path)
    try:
        os.symlink(package_dir / "app" / "src" / "secret.ts", package_dir / "app" / "dist" / "link.ts")
    except (OSError, NotImplementedError):
        pytest.skip("symbolic links are not available")
    client, _ = disk_client(tmp_path)

    assert client.get("/api/v3/packages/feat/app/link.ts").status_code == 404


def test_frontend_manifest_lists_dependencies_first(tmp_path):
    bundled = tmp_path / "bundled"
    # Alphabetically "aaa_ui" comes first, but it needs "zzz_base",
    # through "mmm_logic", which has no app part.
    write_package(bundled, "zzz_base", app_entry="dist/base.js", app_files={"dist/base.js": b"//"})
    write_package(bundled, "mmm_logic", requires=["zzz_base"])
    write_package(bundled, "aaa_ui", requires=["mmm_logic"], app_entry="dist/ui.js", app_files={"dist/ui.js": b"//"})
    client, _ = disk_client(tmp_path)

    manifest = data_of(client.get("/api/v3/frontend/manifest"))

    assert manifest == [
        {"name": "zzz_base", "version": "1.0.0", "module_url": "/api/v3/packages/zzz_base/app/base.js",
         "requires": []},
        {"name": "aaa_ui", "version": "1.0.0", "module_url": "/api/v3/packages/aaa_ui/app/ui.js",
         "requires": ["mmm_logic"]},
    ]


def test_disabled_package_disappears_everywhere(tmp_path):
    _feature(tmp_path)
    client, _ = disk_client(tmp_path)
    object_id = imported_id(client, "feat.csv")

    [visualizer] = data_of(client.get(f"/api/v3/objects/{object_id}/visualizers"))
    assert visualizer["module_url"] == "/api/v3/packages/feat/app/index.js"
    assert visualizer["element"] == "feat-view"
    assert [op["id"] for op in data_of(client.get(f"/api/v3/operations?objects={object_id}"))] == ["feat.copy"]
    assert [m["name"] for m in data_of(client.get("/api/v3/frontend/manifest"))] == ["feat"]

    assert client.post("/api/v3/packages/feat/disable").status_code == 200

    assert data_of(client.get("/api/v3/importers?filename=log.csv")) == []
    assert data_of(client.get(f"/api/v3/operations?objects={object_id}")) == []
    assert data_of(client.get(f"/api/v3/objects/{object_id}/visualizers")) == []
    assert data_of(client.get("/api/v3/frontend/manifest")) == []
    assert client.get("/api/v3/packages/feat/app/index.js").status_code == 404
    feat = next(info for info in data_of(client.get("/api/v3/packages")) if info["name"] == "feat")
    assert feat["status"] == "disabled"
    assert all(keys == [] for keys in feat["contributions"].values())

    assert client.post("/api/v3/packages/feat/enable").status_code == 200
    assert [m["name"] for m in data_of(client.get("/api/v3/frontend/manifest"))] == ["feat"]
    assert len(data_of(client.get("/api/v3/importers?filename=log.csv"))) == 1
