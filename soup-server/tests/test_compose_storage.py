"""
------------------------------------------------------------------------
File : test_compose_storage.py
Description: The backend of docker-compose.yaml has no access to Docker:
             no /var/run/docker.sock, the "local" storage on the
             soup-volume volume mounted on /soup as in Memgraph (which
             reads the same files with LOAD CSV), and it waits for the
             one-off volume-init service. Its image runs as an
             unprivileged user with the UID/GID of the "memgraph" user of
             the Memgraph image (101/103 in memgraph/memgraph 3.13.2), created
             after pip install.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import re
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[2]
COMPOSE = REPOSITORY / "docker-compose.yaml"
DOCKERFILE = REPOSITORY / "soup-server" / "Dockerfile"


def _services() -> dict[str, str]:
    """Service name -> the text of its block in docker-compose.yaml."""

    text = COMPOSE.read_text(encoding="utf-8")
    body = text[text.index("services:"):text.index("\nvolumes:")]
    parts = re.split(r"^  ([a-z][a-z-]*):\s*$", body, flags=re.MULTILINE)
    return dict(zip(parts[1::2], parts[2::2], strict=True))


def test_the_backend_has_no_docker_socket_and_uses_the_local_storage_on_the_volume():
    flask = _services()["flask"]
    assert "docker.sock" not in COMPOSE.read_text(encoding="utf-8")
    assert "- SOUP_STORAGE_KIND=local" in flask
    assert "- SOUP_LOCAL_STORAGE_ROOT=/soup" in flask
    assert "- soup-volume:/soup" in flask
    assert re.search(r"volume-init:\s*\n\s*condition: service_completed_successfully", flask)


def test_memgraph_reads_the_same_volume_on_the_same_path():
    services = _services()
    assert "- soup-volume:/soup" in services["memgraph"]
    assert "- soup-volume:/soup" in services["volume-init"]
    assert "- soup-installed-packages:/data/soup-packages" in services["volume-init"]


def test_memgraph_has_named_volumes_and_no_persistence():
    memgraph = _services()["memgraph"]
    for line in (
        "- memgraph-data:/var/lib/memgraph",
        "- memgraph-etc:/etc/memgraph",
        "- memgraph-log:/var/log/memgraph",
        "- --storage-snapshot-interval-sec=0",
        "- --storage-snapshot-on-exit=false",
        "- --storage-wal-enabled=false",
        "- --data-recovery-on-startup=false",
    ):
        assert line in memgraph
    top_level = COMPOSE.read_text(encoding="utf-8").split("\nvolumes:", 1)[1]
    for volume in ("memgraph-data:", "memgraph-etc:", "memgraph-log:"):
        assert f"\n  {volume}" in top_level


def test_the_long_running_services_restart_and_volume_init_does_not():
    services = _services()
    for name in ("memgraph", "lab", "flask", "angular"):
        assert "restart: unless-stopped" in services[name], name
    assert "restart:" not in services["volume-init"]


def test_volume_init_only_changes_owners():
    init = _services()["volume-init"]
    command = re.search(r"entrypoint: (\[.*\])", init)
    assert command is not None
    assert "chown -h 101:103" in command.group(1)  # The IDs of soup-server/Dockerfile
    for verb in ("rm ", "mv ", "-delete"):
        assert verb not in command.group(1)


def test_the_backend_image_runs_as_the_uid_and_gid_of_memgraph_after_pip_install():
    text = DOCKERFILE.read_text(encoding="utf-8")
    assert re.search(r"^ARG SOUP_UID=101$", text, flags=re.MULTILINE)
    assert re.search(r"^ARG SOUP_GID=103$", text, flags=re.MULTILINE)
    final = text[text.rindex("\nFROM "):]
    assert final.index("pip install") < final.index("useradd") < final.index("\nUSER soup")
    assert final.rstrip().splitlines()[-1].startswith("CMD ")
