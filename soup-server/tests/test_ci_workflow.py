"""
------------------------------------------------------------------------
File : test_ci_workflow.py
Description: .github/workflows/ci.yml runs the checks with the versions
             the images use: Python of soup-server/Dockerfile (and 3.10,
             the lowest supported, mypy's python_version), Node of both
             Dockerfiles (and of .nvmrc), the Memgraph image of
             docker-compose.yaml for the smoke tests; it never pushes an
             image. Read as text (no YAML library in requirements).
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import re
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[2]
WORKFLOW = (REPOSITORY / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")


def _one(pattern: str, text: str) -> str:
    found = re.findall(pattern, text, flags=re.MULTILINE)
    assert len(found) == 1, (pattern, found)
    return str(found[0])


def test_python_is_the_one_of_the_backend_image_and_3_10():
    image = _one(r"^FROM python:(\S+?)-slim", (REPOSITORY / "soup-server" / "Dockerfile").read_text(encoding="utf-8"))
    assert _one(r'^  PYTHON_VERSION: "(\S+)"$', WORKFLOW) == image
    assert _one(r"^        python: \[(.+)\]$", WORKFLOW) == f'"3.10", "{image}"'
    assert 'python_version = "3.10"' in (REPOSITORY / "soup-server" / "pyproject.toml").read_text(encoding="utf-8")


def test_node_is_the_one_of_both_images_and_of_nvmrc():
    version = _one(r'^  NODE_VERSION: "(\S+)"$', WORKFLOW)
    for dockerfile in ("soup-server/Dockerfile", "soup-app/Dockerfile"):
        assert _one(r"^FROM node:(\S+?)-alpine", (REPOSITORY / dockerfile).read_text(encoding="utf-8")) == version
    assert (REPOSITORY / ".nvmrc").read_text(encoding="utf-8").strip() == version


def test_the_smoke_tests_run_on_the_memgraph_of_docker_compose():
    compose = (REPOSITORY / "docker-compose.yaml").read_text(encoding="utf-8")
    images = set(re.findall(r"image: (memgraph/memgraph:\S+)", compose))
    assert len(images) == 1
    assert _one(r"^        image: (memgraph/\S+)$", WORKFLOW) == images.pop()
    for package in ("ekg_views", "ekg_analysis"):
        assert f"../soup-packages/{package}/tests/memgraph_smoke.py" in WORKFLOW


def test_every_area_has_its_job_and_no_image_is_pushed():
    jobs = re.findall(r"^  ([a-z]+):$", WORKFLOW.split("\njobs:\n", 1)[1], flags=re.MULTILINE)
    assert jobs == ["backend", "packages", "app", "memgraph", "docker"]
    assert "push: false" in WORKFLOW and "push: true" not in WORKFLOW
    assert WORKFLOW.count("cache: pip") >= 3 and WORKFLOW.count("cache: npm") == 2
