"""
------------------------------------------------------------------------
File : test_requirements_check.py
Description: The check at startup of app.py and tests/e2e_server.py
             (soup.startup.requirements_check): the versions of Flask,
             Werkzeug, pandas and numpy against a requirements file, with
             the installed versions given by a fake (no real environment
             is read): the right ones pass, a wrong or missing one gives
             the message with the Python in use, the versions and the
             command, SOUP_SKIP_REQUIREMENTS_CHECK=1 skips it, and
             ensure_requirements stops the process with exit code 2.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import importlib.metadata
from pathlib import Path

import pytest

from soup.startup.requirements_check import (
    SKIP_VARIABLE,
    ensure_requirements,
    mismatches,
    pinned,
    requirements_problem,
)

REQUIREMENTS = """\
# The libraries of the host
-r other.txt
Flask==3.1.3
Flask-Cors==6.0.5
Werkzeug==3.1.9  # comment after the pin
waitress==3.0.2

pandas==2.2.3
numpy==2.2.6
docker~=7.1.0
"""

RIGHT = {"Flask": "3.1.3", "Werkzeug": "3.1.9", "pandas": "2.2.3", "numpy": "2.2.6"}


@pytest.fixture
def requirements(tmp_path: Path) -> Path:
    path = tmp_path / "requirements.txt"
    path.write_text(REQUIREMENTS, encoding="utf-8")
    return path


def installed(versions: dict[str, str]):
    def version_of(name: str) -> str:
        if name not in versions:
            raise importlib.metadata.PackageNotFoundError(name)
        return versions[name]

    return version_of


def test_reads_the_pins_skipping_comments_blank_lines_and_options(requirements):
    pins = pinned(requirements)
    assert {name: str(spec) for name, spec in pins.items()} == {
        "flask": "==3.1.3",
        "flask-cors": "==6.0.5",
        "werkzeug": "==3.1.9",
        "waitress": "==3.0.2",
        "pandas": "==2.2.3",
        "numpy": "==2.2.6",
        "docker": "~=7.1.0",
    }


def test_the_right_versions_pass(requirements):
    assert mismatches(requirements, version_of=installed(RIGHT)) == []
    assert requirements_problem(requirements, env={}, version_of=installed(RIGHT)) is None


def test_a_wrong_version_gives_the_message_with_python_versions_and_command(requirements):
    versions = {**RIGHT, "Flask": "2.3.3"}

    [wrong] = mismatches(requirements, version_of=installed(versions))
    assert (wrong.name, str(wrong.required), wrong.found) == ("Flask", "==3.1.3", "2.3.3")

    message = requirements_problem(requirements, env={}, version_of=installed(versions), python="C:/Python312/python.exe")
    assert message is not None
    assert "Python in use: C:/Python312/python.exe" in message
    assert "Flask: found 2.3.3, required ==3.1.3" in message
    assert "npm run setup:server" in message
    assert "python scripts/setup_venv.py" in message
    assert f"{SKIP_VARIABLE}=1" in message
    # Only the wrong library is listed.
    assert "Werkzeug" not in message


def test_a_missing_package_is_reported_as_not_installed(requirements):
    versions = {name: version for name, version in RIGHT.items() if name != "numpy"}

    [missing] = mismatches(requirements, version_of=installed(versions))
    assert (missing.name, missing.found) == ("numpy", None)
    message = requirements_problem(requirements, env={}, version_of=installed(versions))
    assert message is not None
    assert "numpy: found not installed, required ==2.2.6" in message


def test_a_library_not_pinned_is_not_checked(tmp_path):
    path = tmp_path / "requirements.txt"
    path.write_text("Flask==3.1.3\n", encoding="utf-8")
    assert mismatches(path, version_of=installed({"Flask": "3.1.3"})) == []


@pytest.mark.parametrize(("value", "skipped"), [("1", True), (" 1 ", True), ("0", False), ("", False), ("true", False)])
def test_the_variable_skips_the_check_only_when_1(requirements, value, skipped):
    wrong = installed({**RIGHT, "pandas": "3.0.6"})
    problem = requirements_problem(requirements, env={SKIP_VARIABLE: value}, version_of=wrong)
    assert (problem is None) is skipped


def test_ensure_requirements_stops_the_process_with_the_message(requirements, monkeypatch, capsys):
    monkeypatch.delenv(SKIP_VARIABLE, raising=False)
    monkeypatch.setattr(importlib.metadata, "version", installed({**RIGHT, "Werkzeug": "2.0.0"}))
    with pytest.raises(SystemExit) as stopped:
        ensure_requirements(requirements)
    assert stopped.value.code == 2
    assert "Werkzeug: found 2.0.0, required ==3.1.9" in capsys.readouterr().err


def test_ensure_requirements_returns_with_the_right_versions(requirements, monkeypatch):
    monkeypatch.delenv(SKIP_VARIABLE, raising=False)
    monkeypatch.setattr(importlib.metadata, "version", installed(RIGHT))
    ensure_requirements(requirements)
