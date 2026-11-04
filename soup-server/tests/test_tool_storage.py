"""
------------------------------------------------------------------------
File : test_tool_storage.py
Description: Tests for the tool_storage package's "storage" tool:
             round-trip and isolation per namespace on the in-memory and
             the local-filesystem backends, hostile namespaces and file
             names refused, path_for, delete_space, StorageConfig and the
             Docker backend on a fake Docker client (argv commands, no
             shell; DockerException -> 503, missing file -> 404).
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import io
import tarfile
from types import SimpleNamespace

import pytest
from docker.errors import DockerException, NotFound

from soup.core.contracts import FileStorage, NotFoundError, ServiceUnavailableError, ValidationError
from tests.fakes import InMemoryFileStorage, fake_storage_tool
from tests.packages import bundled_api, bundled_source

api = bundled_api("tool_storage")

from soup_pkg_tool_storage.backends.docker import DockerVolumeStorage  # noqa: E402
from soup_pkg_tool_storage.backends.local import LocalFileStorage  # noqa: E402
from soup_pkg_tool_storage.config import StorageConfig, build_backend  # noqa: E402

HOSTILE = ["", ".", "..", "../etc", "a/b", "a\\b", "_catalog", " x", "x\n"]


@pytest.fixture(params=["memory", "local"])
def backend(request, tmp_path) -> FileStorage:
    return InMemoryFileStorage() if request.param == "memory" else LocalFileStorage(str(tmp_path))


@pytest.fixture
def storage(backend):
    return api.StorageTool(backend, root="/soup")


def test_round_trip_in_a_namespace(storage):
    space = storage.space("orders")

    assert space.exists("orders.csv") is False
    space.write("orders.csv", b"a,b\n")

    assert space.exists("orders.csv") is True
    assert space.read("orders.csv") == b"a,b\n"
    assert space.list() == ["orders.csv"]

    space.delete("orders.csv")
    assert space.exists("orders.csv") is False
    assert space.list() == []


def test_namespaces_are_isolated(storage, backend):
    storage.space("orders").write("data.csv", b"orders")
    storage.space("invoices").write("data.csv", b"invoices")

    assert storage.space("orders").read("data.csv") == b"orders"
    assert storage.space("invoices").read("data.csv") == b"invoices"
    # Each namespace is a folder under the root.
    assert backend.read("orders/data.csv") == b"orders"


def test_list_filters_by_prefix(storage):
    space = storage.space("orders")
    for name in ("orders.csv", "orders_entity.csv", "other.json"):
        space.write(name, b"x")

    assert space.list("orders") == ["orders.csv", "orders_entity.csv"]


def test_reading_a_missing_file_is_not_found(storage):
    with pytest.raises(NotFoundError):
        storage.space("orders").read("missing.csv")


@pytest.mark.parametrize("namespace", HOSTILE)
def test_hostile_namespaces_are_refused(storage, namespace):
    with pytest.raises(ValidationError):
        storage.space(namespace)
    with pytest.raises(ValidationError):
        storage.path_for(namespace, "a.csv")
    with pytest.raises(ValidationError):
        storage.delete_space(namespace)


@pytest.mark.parametrize("name", HOSTILE)
def test_hostile_file_names_are_refused(storage, backend, name):
    space = storage.space("orders")
    for call in (lambda: space.write(name, b"x"), lambda: space.read(name), lambda: space.exists(name),
                 lambda: space.delete(name), lambda: storage.path_for("orders", name)):
        with pytest.raises(ValidationError):
            call()
    assert backend.list("") == []


def test_path_for_is_under_the_root(storage):
    assert storage.path_for("orders", "orders.csv") == "/soup/orders/orders.csv"
    assert api.StorageTool(InMemoryFileStorage(), root="/custom/").path_for("a", "b.csv") == "/custom/a/b.csv"


def test_delete_space_removes_only_that_namespace(storage):
    storage.space("orders").write("a.csv", b"x")
    storage.space("orders").write("b.csv", b"y")
    storage.space("orders_old").write("a.csv", b"z")

    storage.delete_space("orders")
    storage.delete_space("never_created")  # no-op

    assert storage.space("orders").list() == []
    assert storage.space("orders_old").list() == ["a.csv"]


def test_a_subspace_is_a_folder_inside_the_namespace(storage, backend):
    analyses = storage.space("orders").subspace("Analyses")
    analyses.write("a1.json", b"{}")

    assert backend.read("orders/Analyses/a1.json") == b"{}"
    assert analyses.list() == ["a1.json"]
    assert storage.space("orders").list() == ["Analyses"]
    assert analyses.subspace("deeper").namespace == "orders"
    analyses.delete("a1.json")
    assert analyses.list() == []


@pytest.mark.parametrize("name", HOSTILE)
def test_hostile_subspace_names_are_refused(storage, name):
    with pytest.raises(ValidationError):
        storage.space("orders").subspace(name)


def test_namespaces_lists_the_valid_names_at_the_root(storage, backend):
    storage.space("orders").write("orders.csv", b"x")
    storage.space("invoices").write("invoices.csv", b"x")
    backend.write("_catalog/objects/x.json", b"{}")

    assert storage.namespaces() == ["invoices", "orders"]


def test_health(storage):
    assert storage.health() == {"ok": True}

    class _Broken(InMemoryFileStorage):
        def list(self, prefix=""):
            raise OSError("disk gone")

    assert api.StorageTool(_Broken()).health() == {"ok": False, "error": "disk gone"}


def test_os_errors_become_503():
    class _Broken(InMemoryFileStorage):
        def write(self, path, data):
            raise PermissionError("read-only volume")

    with pytest.raises(ServiceUnavailableError, match="read-only volume"):
        api.StorageTool(_Broken()).space("orders").write("a.csv", b"x")


def test_local_backend_refuses_paths_outside_its_root(tmp_path):
    backend = LocalFileStorage(str(tmp_path / "root"))

    with pytest.raises(ValueError):
        backend.write("../outside.txt", b"x")
    assert not (tmp_path / "outside.txt").exists()


def test_fake_storage_tool_is_the_package_tool():
    assert isinstance(fake_storage_tool(), api.StorageTool)


# ---------------------------------------------------------------------- #
# Configuration
# ---------------------------------------------------------------------- #

def test_config_reads_the_environment(tmp_path):
    assert StorageConfig.from_env({}) == StorageConfig("docker", "soup-database", "/soup")
    config = StorageConfig.from_env({
        "SOUP_STORAGE_KIND": "local",
        "SOUP_CONTAINER_NAME": "other",
        "SOUP_LOCAL_STORAGE_ROOT": str(tmp_path),
    })
    assert config == StorageConfig("local", "other", str(tmp_path))
    assert isinstance(build_backend(config), LocalFileStorage)
    assert isinstance(build_backend(StorageConfig()), DockerVolumeStorage)
    with pytest.raises(ValueError, match="SOUP_STORAGE_KIND"):
        build_backend(StorageConfig(kind="ftp"))


def test_manifest():
    manifest = bundled_source("tool_storage").manifest

    assert manifest.provides_tools == ("storage", "catalog", "preferences")
    assert manifest.requires_tools == ()


# ---------------------------------------------------------------------- #
# Docker backend, on a fake Docker client
# ---------------------------------------------------------------------- #

class _FakeContainer:
    def __init__(self):
        self.files: dict[str, bytes] = {}
        self.commands: list[list[str]] = []
        self.users: list[object] = []
        self.modes: list[int] = []
        self.fail_with = None

    def exec_run(self, argv, user=None):
        self.commands.append(list(argv))
        self.users.append(user)
        if self.fail_with is not None:
            raise self.fail_with
        if argv[0] == "test":
            return SimpleNamespace(exit_code=0 if argv[-1] in self.files else 1, output=b"")
        if argv[0] == "ls":
            prefix = argv[-1].rstrip("/") + "/"
            names = sorted({p[len(prefix):].split("/")[0] for p in self.files if p.startswith(prefix)})
            return SimpleNamespace(exit_code=0 if names else 2, output="\n".join(names).encode("utf-8"))
        if argv[0] == "rm":
            for path in [p for p in self.files if p == argv[-1] or p.startswith(argv[-1] + "/")]:
                del self.files[path]
        return SimpleNamespace(exit_code=0, output=b"")

    def put_archive(self, directory, stream):
        with tarfile.open(fileobj=stream, mode="r") as tar:
            for member in tar.getmembers():
                self.modes.append(member.mode)
                self.files[f"{directory}/{member.name}"] = tar.extractfile(member).read()
        return True

    def get_archive(self, path):
        if path not in self.files:
            raise NotFound("no such file")
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w") as tar:
            info = tarfile.TarInfo(name=path.rpartition("/")[2])
            info.size = len(self.files[path])
            tar.addfile(info, io.BytesIO(self.files[path]))
        return [buffer.getvalue()], {}


def _docker(container=None, fail_with=None):
    container = container or _FakeContainer()

    def client_factory():
        if fail_with is not None:
            raise fail_with
        return SimpleNamespace(containers=SimpleNamespace(get=lambda name: container))

    return DockerVolumeStorage("soup-database", "/soup", client_factory=client_factory), container


def test_docker_round_trip_through_in_memory_tar_archives():
    backend, container = _docker()
    storage = api.StorageTool(backend)

    storage.space("orders").write("orders.csv", b"a,b\n")

    assert container.files == {"/soup/orders/orders.csv": b"a,b\n"}
    assert storage.space("orders").read("orders.csv") == b"a,b\n"
    assert storage.space("orders").exists("orders.csv") is True
    assert storage.space("orders").list() == ["orders.csv"]
    storage.delete_space("orders")
    assert container.files == {}


def test_docker_commands_are_argv_lists_never_a_shell():
    backend, container = _docker()
    storage = api.StorageTool(backend)
    storage.space("my orders").write("a.csv", b"x")
    storage.space("my orders").exists("a.csv")
    storage.space("my orders").list()
    storage.delete_space("my orders")

    assert [command[0] for command in container.commands] == ["mkdir", "test", "ls", "rm"]
    assert all("sh" not in command for command in container.commands)
    assert container.commands[0] == ["mkdir", "-p", "/soup/my orders"]


def test_docker_commands_run_as_root_and_files_stay_readable_by_memgraph():
    # memgraph/memgraph runs as the "memgraph" user, which cannot write
    # in the root-owned volume: the commands do not depend on the image's USER.
    backend, container = _docker()
    storage = api.StorageTool(backend)
    storage.space("orders").write("orders.csv", b"a,b\n")
    storage.space("orders").exists("orders.csv")
    storage.space("orders").list()
    storage.delete_space("orders")

    assert container.users == ["root"] * 4
    assert container.modes == [0o644]


def test_docker_missing_file_is_not_found():
    backend, _container = _docker()

    with pytest.raises(NotFoundError):
        api.StorageTool(backend).space("orders").read("missing.csv")


def test_docker_unreachable_is_503():
    backend, _container = _docker(fail_with=DockerException("daemon not running"))
    storage = api.StorageTool(backend)

    with pytest.raises(ServiceUnavailableError, match="daemon not running"):
        storage.space("orders").write("a.csv", b"x")
    assert storage.health()["ok"] is False


def test_docker_failing_command_is_503():
    backend, container = _docker()
    container.fail_with = DockerException("exec failed")

    with pytest.raises(ServiceUnavailableError, match="exec failed"):
        api.StorageTool(backend).space("orders").exists("a.csv")


def test_docker_refuses_paths_outside_its_root():
    backend, _container = _docker()

    with pytest.raises(ValueError):
        backend.write("../etc/passwd", b"x")
    with pytest.raises(ValueError):
        backend.delete("")
