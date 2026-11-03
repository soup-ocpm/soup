"""
------------------------------------------------------------------------
File : app.py
Description: Process entrypoint. Builds the Engine (soup.core.engine)
             and the Flask app that serves it (soup.api.flask_app),
             registers Engine.shutdown() to run on process exit (closes
             the database driver, shuts down plugins), and runs the app.
             Debug mode only with SOUP_DEBUG=1/true: the Werkzeug
             debugger runs Python code for whoever reaches the port. The
             reloader is always off, so the engine is built once. First
             of all the versions of Flask, Werkzeug, pandas and numpy are
             checked against requirements.txt (soup.startup), before
             Flask is even imported: another environment stops with a
             message instead of failing later.
Date creation: 20-02-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""

import atexit
import os
from collections.abc import Mapping
from pathlib import Path

from soup.startup.requirements_check import ensure_requirements

REQUIREMENTS = Path(__file__).resolve().parent / "requirements.txt"


def debug_from_env(env: Mapping[str, str]) -> bool:
    """SOUP_DEBUG set to "1" or "true" (any case); off otherwise."""

    return env.get("SOUP_DEBUG", "").strip().lower() in ("1", "true")


def main() -> None:
    ensure_requirements(REQUIREMENTS)
    # After the check: these import Flask and pandas.
    from soup.api.flask_app import build_flask_app
    from soup.core.engine import build_engine
    from soup.core.settings import Settings

    engine = build_engine(Settings.from_env())
    atexit.register(engine.shutdown)

    app = build_flask_app(engine)
    app.run(host='0.0.0.0', port=8080, debug=debug_from_env(os.environ), use_reloader=False)


if __name__ == '__main__':
    main()
