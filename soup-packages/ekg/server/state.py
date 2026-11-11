"""
------------------------------------------------------------------------
File : state.py
Description: The graph state of "ekg" objects. Memgraph holds one graph
             at a time; the memgraph tool's state key is the object's
             graph key (graph_key_of): meta.graph_key (set by build_ekg,
             by the adoption and by derive_state, kept by every rebuild),
             or its id for an object without one (old or adopted).
             A root "ekg" object (an import, a conversion)
             is a staged dataset (meta.dataset). A derived object (e.g.
             an analysis, an aggregate graph), of kind "ekg" or of any
             other kind, declares meta.state = {provider, spec} and lists
             its parent among its parents (an "ekg" object or another
             derived one): the provider, contributed to
             "ekg.state_providers" by some package, knows how to apply
             `spec` to the graph of the parent.
             - ensure_loaded(obj, tools, force=False): if obj is not the
               active state (or with force), publish "ekg.before_reset",
               then the loader rebuilds the root's dataset (build steps,
               counts and process times saved in its config like the
               legacy /complete-graph/build did) and applies, in order,
               the states of the derived objects from the root down to
               obj.
             - derive_state(parent, mutate, tools): the graph of a new
               derived object, made in place on the loaded parent with
               the memgraph tool's advance(); if mutate fails the parent
               is rebuilt (compensating action) and the error re-raised.
             - dispose(obj, tools): if obj is active, "ekg.before_reset"
               and the graph is emptied; a root's files are removed.
             - buildable_problem(obj): why the graph of obj cannot be
               built (a legacy config with one column for two standard
               roles, meta.warning of the adoption), or None; read from
               the meta, without the volume. ensure_loaded refuses such a
               dataset with a ValidationError (400) before any query.
             `tools` are the caller's: it must declare "memgraph". The
             parents are read from the catalog and the datasets from the
             storage with this package's own tools.
Project : soup-packages/ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping
from dataclasses import replace
from typing import Any, cast

from soup_pkg_tool_memgraph.api import GraphDatabase, Run

from soup.core.contracts import Catalog, NotFoundError, ObjectRef, ValidationError

from .builder import (
    EKG_BEFORE_RESET,
    EKG_BUILT,
    EKG_KIND,
    MEMGRAPH,
    STORAGE,
    RunDatabase,
    build_context,
    new_graph_key,
)
from .dataset_repository import DatasetRepository, StorageSpaceTool
from .ekg_service import EkgService
from .event_log import config_mapping_problem, mapping_problem
from .process_timer import ProcessTimer
from .runtime import current

CATALOG = "catalog"

_LOGGER = logging.getLogger("soup.ekg")


class StateProvider(ABC):
    """
    Contributed to "ekg.state_providers" (contribution key = `key`). A
    derived object with meta.state = {"provider": key, "spec": ...} is
    loaded by applying `spec` to the graph of its parent.
    """

    key: str = ""

    @abstractmethod
    def apply(self, spec: Mapping[str, Any], db: GraphDatabase) -> None:
        raise NotImplementedError


def is_derived(obj: ObjectRef) -> bool:
    return isinstance(obj.meta.get("state"), Mapping)


def graph_key_of(obj: ObjectRef) -> str:
    """The memgraph tool state of obj's graph: meta.graph_key, else (an old or adopted object) its id."""

    key = obj.meta.get("graph_key")
    if not isinstance(key, str) or not key:
        return obj.id
    return key


def chain_of(obj: ObjectRef, catalog: Catalog) -> list[ObjectRef]:
    """
    [root, ..., obj]: obj and its ancestors up to the first one that is
    not derived (the "ekg" root). obj is an "ekg" object or a derived
    object of any kind; each parent is an "ekg" object or a derived one.
    """

    if obj.kind != EKG_KIND and not is_derived(obj):
        raise ValidationError(f"Object '{obj.name}' is a {obj.kind!r}, not an EKG")
    chain = [obj]
    while is_derived(chain[-1]):
        current_obj = chain[-1]
        parent = None
        for parent_id in current_obj.parents:
            candidate = catalog.get(parent_id)
            if candidate is not None and (candidate.kind == EKG_KIND or is_derived(candidate)):
                parent = candidate
                break
        if parent is None:
            raise NotFoundError(f"EKG object '{current_obj.name}' has no EKG parent to apply its state to")
        if any(item.id == parent.id for item in chain):
            raise ValidationError(f"EKG object '{current_obj.name}' has a cycle in its parents")
        chain.append(parent)
    chain.reverse()
    if chain[0].kind != EKG_KIND or not chain[0].meta.get("dataset"):
        raise NotFoundError(f"EKG object '{chain[0].name}' has no dataset")
    return chain


def root_of(obj: ObjectRef) -> ObjectRef:
    """The root "ekg" object (the dataset) obj derives from; obj itself for a root."""

    return chain_of(obj, current().tools.typed(CATALOG, Catalog))[0]


def unbuildable_message(dataset: str, problem: str) -> str:
    return f"The graph of dataset '{dataset}' cannot be built: {problem}"


def buildable_problem(obj: ObjectRef) -> str | None:
    """
    Why the graph of obj cannot be built, or None: meta.warning of a root
    adopted with meta.buildable false, or one column for two standard
    roles in meta.mapping (a root adopted before that check).
    """

    root = root_of(obj)
    warning = root.meta.get("warning")
    if root.meta.get("buildable") is False and isinstance(warning, str) and warning:
        return warning
    mapping = root.meta.get("mapping")
    if not isinstance(mapping, Mapping):
        return None
    problem = mapping_problem(mapping.get("event_id"), mapping.get("timestamp"), mapping.get("activity"))
    return unbuildable_message(str(root.meta.get("dataset")), problem) if problem else None


def ensure_loaded(obj: ObjectRef, tools: Any, force: bool = False) -> bool:
    """
    Make `obj` the graph in Memgraph. Returns True if it was (re)built,
    False if it was already the active state.
    """

    runtime = current()
    memgraph = tools.get(MEMGRAPH)
    chain = chain_of(obj, runtime.tools.typed(CATALOG, Catalog))
    graph_key = graph_key_of(obj)
    if not force and memgraph.is_loaded(graph_key):
        return False

    root = chain[0]
    dataset = root.meta["dataset"]
    repository = DatasetRepository(cast(StorageSpaceTool, runtime.tools.get(STORAGE)))
    providers =[(runtime.state_provider(item.meta["state"].get("provider", "")), item) for item in chain[1:]]
    config = repository.load_config(dataset)
    problem = config_mapping_problem(config)
    if problem:
        raise ValidationError(unbuildable_message(dataset, problem))
    ctx = build_context(repository, dataset, config)
    counts: dict[str, int] = {}
    times: dict[str, str] = {}

    def loader(run: Run) -> None:
        db = RunDatabase(run)
        service = EkgService(db, runtime.build_steps)
        service.build(ctx, times)
        counts.update(service.counts())
        for provider, item in providers:
            provider.apply(item.meta["state"].get("spec") or {}, db)

    runtime.publish(EKG_BEFORE_RESET, {"object": obj.id, "active": memgraph.current_state(), "reason": "load"})
    with ProcessTimer() as timer:
        loaded = memgraph.ensure_loaded(graph_key, loader, force=force)
    if not loaded:
        return False

    # Like the legacy /complete-graph/build: the counts and the times of
    # the last build of the dataset go back into its config.
    config.update(counts)
    process_info = dict(config.get("process_info") or {})
    process_info.update(times)
    process_info["init_time"] = timer.started_at
    process_info["finish_time"] = timer.finished_at
    config["process_info"] = process_info
    repository.save_config(dataset, config)
    catalog = runtime.tools.typed(CATALOG, Catalog)
    for item in {root.id: root, obj.id: obj}.values():
        recorded = {
            **(item.meta.get("process_info") or {}),
            **{key: value for key, value in process_info.items() if value is not None},
        }
        catalog.update(replace(item, meta={**item.meta, "process_info": recorded}))

    runtime.publish(EKG_BUILT, {"object": obj.id, "graph_key": graph_key, "dataset": dataset, "counts": dict(counts)})
    return True


def derive_state(parent: ObjectRef, mutate: Callable[[Any], None], tools: Any) -> str:
    """
    The graph of a new object derived from `parent` (compensating action,
    C26): load `parent`, then mutate(run) changes its graph in place (the
    memgraph tool's advance) and the active state becomes a new graph
    key, returned for the draft's meta.graph_key - the first opening of
    the object does not rebuild. A later rebuild of the object goes
    through its StateProvider and sets the same key again.

    :raises ConflictError: another graph was loaded meanwhile (nothing
        was changed)
    If mutate fails, the graph of `parent` is rebuilt (the active state is
    its key again) and the error re-raised.
    """

    memgraph = tools.get(MEMGRAPH)
    ensure_loaded(parent, tools)
    graph_key = new_graph_key()
    mutated = False

    def tracked(run: Run) -> None:
        nonlocal mutated
        mutated = True
        mutate(run)

    try:
        memgraph.advance(graph_key_of(parent), graph_key, tracked)
    except Exception:
        # A ConflictError of advance itself comes before mutate: the graph
        # was not touched and needs no rebuild.
        if mutated:
            _rebuild(parent, tools)
        raise
    return graph_key


def _rebuild(parent: ObjectRef, tools: Any) -> None:
    try:
        ensure_loaded(parent, tools, force=True)
    except Exception:  # noqa: BLE001 - the original error is the one to report
        _LOGGER.exception("The graph of '%s' could not be rebuilt after a failed change", parent.name)


def dispose(obj: ObjectRef, tools: Any) -> None:
    """
    Remove what an "ekg" object holds: the graph if it is the active
    state, and the dataset files of a root. Tolerates partial state (a
    failed import has empty meta).
    """

    runtime = current()
    memgraph = tools.get(MEMGRAPH)
    graph_key = graph_key_of(obj)
    if memgraph.current_state() == graph_key:
        runtime.publish(EKG_BEFORE_RESET, {"object": None, "active": graph_key, "reason": "dispose"})
        memgraph.clear()
    dataset = obj.meta.get("dataset")
    if dataset and not is_derived(obj):
        DatasetRepository(cast(StorageSpaceTool, runtime.tools.get(STORAGE))).delete(dataset)
