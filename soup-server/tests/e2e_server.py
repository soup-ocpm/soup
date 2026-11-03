"""
------------------------------------------------------------------------
File : e2e_server.py
Description: The backend of the frontend end-to-end tests
             (soup-app/e2e, Playwright): a real Flask app on an engine
             with the in-memory catalog and preferences (CoreToolsPackage)
             and no bundled package, in throw-away folders, with package
             installation allowed. No Docker, no Memgraph: the tests
             install the packages they need from zips. A tool_storage
             installed by a test keeps its files in the same throw-away
             folder (SOUP_STORAGE_KIND=local, SOUP_LOCAL_STORAGE_ROOT=
             <root>/storage, always); since it also provides
             the catalog and the preferences, a test disables
             test_core_tools before installing it. Not a test module
             (pytest does not collect it).
             Run from soup-server/: python -m tests.e2e_server
             (SOUP_E2E_PORT, default 8080; npm run e2e uses 8081), with
             the Python of soup-server/.venv (npm run setup:server):
             before importing Flask the versions of requirements.txt are
             checked (soup.startup), and another environment stops with
             a message (SOUP_SKIP_REQUIREMENTS_CHECK=1 skips it).
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from soup.startup.requirements_check import ensure_requirements

REQUIREMENTS = Path(__file__).resolve().parent.parent / "requirements.txt"


def main() -> None:
    ensure_requirements(REQUIREMENTS)
    # After the check: these import Flask and pandas.
    from soup.api.flask_app import build_flask_app
    from soup.core.engine import build_engine
    from soup.core.settings import Settings
    from tests.fakes import CoreToolsPackage

    root = Path(tempfile.mkdtemp(prefix="soup-e2e-"))
    bundled, installed = root / "bundled", root / "installed"
    bundled.mkdir()
    # Read by tool_storage when it is installed: local files, never a Docker volume.
    os.environ["SOUP_STORAGE_KIND"] = "local"
    os.environ["SOUP_LOCAL_STORAGE_ROOT"] = str(root / "storage")
    settings = Settings(
        packages_path=(str(bundled), str(installed)),
        installed_packages_dir=str(installed),
        allow_package_install=True,
        # The app of the e2e tests (ng serve --port 4201): the only origin CORS answers.
        cors_origins=("http://localhost:4201", "http://127.0.0.1:4201"),
    )
    engine = build_engine(settings, extra_plugins=[CoreToolsPackage()])
    app = build_flask_app(engine)
    port = int(os.environ.get("SOUP_E2E_PORT", "8080"))
    print(f"SOUP e2e backend on http://127.0.0.1:{port} (data in {root})", flush=True)
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
