"""
------------------------------------------------------------------------
File : setup_venv.py
Description: Prepares the Python environment of the project,
             soup-server/.venv (ignored by git): creates it with the
             Python that runs this script (3.10 or later; reused if it
             exists), upgrades pip and installs requirements-dev.txt (the
             libraries of the image and the dev tools), then prints its
             Python and the versions of Flask, Werkzeug, pandas and numpy.
             The Python of the system is only used to create the
             environment: nothing is installed into it. Standard library
             only, the same on Windows, Linux and macOS.
             Run: cd soup-app && npm run setup:server
             or, from soup-server/: python scripts/setup_venv.py
             The e2e tests (soup-app/playwright.config.ts) use the Python
             of this environment when it exists.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import os
import subprocess
import sys
import venv
from pathlib import Path

MINIMUM = (3, 10)
SERVER = Path(__file__).resolve().parent.parent
ENVIRONMENT = SERVER / ".venv"
REQUIREMENTS = SERVER / "requirements-dev.txt"
SHOWN = ("Flask", "Werkzeug", "pandas", "numpy")

VERSIONS = (
    "import importlib.metadata as m, sys\n"
    "print('Python', sys.version.split()[0], sys.executable)\n"
    "for name in sys.argv[1:]:\n"
    "    try:\n"
    "        print(f'{name} {m.version(name)}')\n"
    "    except m.PackageNotFoundError:\n"
    "        print(f'{name} not installed')\n"
)


def environment_python(environment: Path = ENVIRONMENT) -> Path:
    """The Python of a virtual environment: Scripts\\python.exe on Windows, bin/python elsewhere."""

    if os.name == "nt":
        return environment / "Scripts" / "python.exe"
    return environment / "bin" / "python"


def run(command: list[str], echo: bool = True) -> None:
    if echo:
        print("$", " ".join(command), flush=True)
    subprocess.run(command, check=True, cwd=SERVER)


def main() -> int:
    if sys.version_info < MINIMUM:
        print(f"Python {MINIMUM[0]}.{MINIMUM[1]} or later is needed, this is {sys.version.split()[0]} ({sys.executable}).",
              file=sys.stderr)
        return 1
    python = environment_python()
    if python.exists():
        print(f"Reusing {ENVIRONMENT}", flush=True)
    else:
        print(f"Creating {ENVIRONMENT} with {sys.executable}", flush=True)
        venv.EnvBuilder(with_pip=True).create(ENVIRONMENT)
    try:
        run([str(python), "-m", "pip", "install", "--upgrade", "pip"])
        run([str(python), "-m", "pip", "install", "-r", str(REQUIREMENTS)])
        print("\nThe environment of soup-server:", flush=True)
        run([str(python), "-c", VERSIONS, *SHOWN], echo=False)
    except subprocess.CalledProcessError as error:
        print(f"Failed: {error}", file=sys.stderr)
        return error.returncode or 1
    print(f"\nReady. Python of the project: {python}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
