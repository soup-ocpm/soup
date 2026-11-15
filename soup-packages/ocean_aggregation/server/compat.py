"""OCEAN execution within SOUP's dataset/state boundaries; upstream code is unchanged."""
from __future__ import annotations

import importlib
import threading
from collections.abc import Callable, Iterator, Mapping
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

from soup.core.contracts import ExtensionPointError, PluginContext, ServiceUnavailableError, ValidationError
from soup.core.contracts.database import CypherExecutor

from .ocean_lib.aggregation.aggregate_ekg import AggregateEkg
from .ocean_lib.configurator.knowledge import knowledge
from .ocean_lib.query import aggregation_query as _original_queries

# The preserved upstream module intentionally has no complete type annotations.
queries: Any = _original_queries

AGGREGATION_LOCK = threading.RLock()

class _Record(dict[str, Any]):
    def __getitem__(self, key: str | int) -> Any:
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


class _Rows:
    """Adapt SOUP's database.execute result to the Neo4j Result methods used by Ocean."""
    def __init__(self, rows: list[dict[str, Any]]):
        self.rows = rows

    def single(self) -> _Record | None:
        row = next(iter(self.rows), None)
        return _Record(row) if row is not None else None

    def data(self) -> list[dict[str, Any]]:
        return self.rows

    def consume(self) -> None:
        return None


class _Session:
    def __init__(self, database: CypherExecutor):
        self.database = database

    def run(self, query: str) -> _Rows:
        return _Rows(self.database.execute(query))

PROVIDER = "ocean_aggregation.state"
POINT = "ekg.state_providers"
# The original MINMAX generator interpolates a Python list of expression strings,
# producing literal strings instead of the actual min/max. Never silently fix it.
UNSUPPORTED_FUNCTIONS = {"MINMAX"}


def ekg_api() -> Any:
    try:
        return importlib.import_module("soup_pkg_ekg.api")
    except ImportError as exc:
        raise ServiceUnavailableError("Memgraph Ocean aggregation requires the active ekg package") from exc


class RunExecutor:
    backend = "memgraph"

    def __init__(self, run: Callable[[Any], list[dict[str, Any]]]):
        self.run = run

    def execute(self, query: str, parameters: Mapping[str, Any] | None = None) -> list[dict[str, Any]]:
        # The supplied run is owned/locked by the selected EKG state loader.
        return self.run(ekg_api().Query(query, parameters or {}))


@contextmanager
def configuration(log: Any, ekg: Any) -> Iterator[None]:
    with AGGREGATION_LOCK:
        previous = knowledge.log, knowledge.ekg, knowledge.entities
        try:
            knowledge.log, knowledge.ekg, knowledge.entities = log, ekg, set()
            yield
        finally:
            knowledge.log, knowledge.ekg, knowledge.entities = previous


def check_queries(db: Any, log: Any, ekg: Any, spec: Any) -> None:
    """Plan every original query before any Class deletion or aggregation write."""
    with configuration(log, ekg):
        statements = []
        for step in spec.steps:
            if step.aggr_type == "ENTITIES":
                knowledge.entities.add(step.ent_type)
            statements.append(queries.generate_cypher_from_step_q(step))
            for attr in step.attr_aggrs:
                if attr.function.value in UNSUPPORTED_FUNCTIONS:
                    raise ValidationError(
                        "MINMAX is unsupported: the original OCEAN generator returns expression strings, "
                        "not min/max values."
                    )
                statements.append(queries.aggregate_attributes(step.aggr_type, attr.name, attr.function))
                if attr.function.value in {"SUM", "AVG"}:
                    # EXPLAIN cannot detect numeric aggregation over text-valued CSV properties.
                    where = f" WHERE n.{ekg.type_tag} = $type" if step.aggr_type == "ENTITIES" else ""
                    label = "Entity" if step.aggr_type == "ENTITIES" else "Event"
                    expression = queries.translate_aggr_function(attr.name, attr.function)
                    statements_probe = f"MATCH (n:{label}){where} RETURN {expression} AS value"
                    try:
                        db.execute(statements_probe, {"type": step.ent_type})
                    except Exception as exc:
                        raise ValidationError(
                            f"{db.backend}: {attr.function.value} is unsupported for attribute {attr.name}: {exc}"
                        ) from exc
        statements.extend([queries.finalize_c_q("Event"), queries.finalize_c_q("Entity"),
                           queries.add_counter_to_class_nodes_q(), queries.generate_df_c_q(),
                           queries.generate_corr_c_q(), queries.count_not_aggregated_nodes_q("Event"),
                           queries.count_not_aggregated_nodes_q("Entity")])
        for query in statements:
            try:
                db.execute("EXPLAIN " + query)
            except Exception as exc:
                raise ValidationError(
                    f"{db.backend} does not support this original OCEAN query: {exc}. No aggregation was performed."
                ) from exc


def execute_ocean(db: Any, log: Any, ekg: Any, spec: Any) -> dict[str, Any]:
    with configuration(log, ekg):
        aggregate: Any = AggregateEkg.__new__(AggregateEkg)
        aggregate.log, aggregate.ekg = log, ekg
        aggregate.session = _Session(db)
        aggregate.benchmark, aggregate.verification = {}, {}
        aggregate.aggregate(spec)
        aggregate.infer_rels()
        return {"benchmark": dict(aggregate.benchmark), "verification": dict(aggregate.verification)}


def require_no_classes(db: Any) -> None:
    if db.execute("MATCH (c:Class) RETURN count(c) AS classes")[0]["classes"]:
        raise ValidationError(
            "This Memgraph state already contains Class nodes. "
            "Select an unaggregated EKG dataset; no aggregation was performed."
        )


class OceanState:
    key = PROVIDER

    def apply(self, spec: Mapping[str, Any], graph: Any) -> None:
        # Called only while ekg rebuilds the selected parent under its state lock.
        from .contributions import _entity_types, _properties, _spec  # noqa: PLC0415 - replay after registration avoids a module cycle

        db = RunExecutor(graph.run)
        require_no_classes(db)
        log, ekg = SimpleNamespace(**spec["log_config"]), SimpleNamespace(**spec["ekg_config"])
        types = _entity_types(db, ekg.type_tag)
        parsed = _spec(spec["configuration"]["steps"], event_props=_properties(db, "Event"),
                       entity_types=types, entity_columns=tuple(log.entities),
                       entity_properties={kind: _properties(db, "Entity", ekg.type_tag, kind) for kind in types})
        check_queries(db, log, ekg, parsed)
        execute_ocean(db, log, ekg, parsed)


def register_state(ctx: PluginContext) -> None:
    try:
        ctx.contributions(POINT)
    except ExtensionPointError:
        return  # Neo4j-only deployments do not need the Memgraph EKG package.
    ctx.contribute(POINT, OceanState(), key=PROVIDER)


def state_available(ctx: PluginContext) -> bool:
    try:
        return any(getattr(item, "key", None) == PROVIDER for item in ctx.contributions(POINT))
    except ExtensionPointError:
        return False
