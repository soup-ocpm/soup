"""Non-destructive PromG BPIC17 -> SOUP Neo4j EKG compatibility projection.

PromG's original nodes and typed DF relationships remain unchanged. All writes
are scoped to the SOUP-created dataset database passed by its importer.
"""

from __future__ import annotations

import json
import re
from contextlib import contextmanager
from pathlib import Path
from time import perf_counter
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from soup.core.contracts.database import Database

_ASSETS = Path(__file__).parent / "assets" / "BPIC17.json"
HEADER = json.loads(_ASSETS.read_text(encoding="utf-8"))
BATCH_SIZE = 10_000


def _identifier(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise ValueError(f"Unsafe PromG relationship or entity type {value!r}")
    return f"`{value}`"


def entity_types() -> tuple[str, ...]:
    return tuple(
        node["type"]
        for node in HEADER["nodes"]
        if node.get("include", True)
        and node["type"] != "Event"
        and node["type"] != "Activity"
    ) + tuple(
        relation["type"]
        for relation in HEADER["relations"]
        if relation.get("model_as_node") and relation.get("include", True)
    )


def df_types() -> tuple[tuple[str, str], ...]:
    return tuple(
        (
            "DF_" + item["type"].upper() if item.get("include_label_in_df") else "DF",
            item["type"],
        )
        for item in (*HEADER["nodes"], *HEADER["relations"])
        if item.get("include", True) and item.get("infer_df")
    )


def _count(db: Database, query: str, params: dict[str, Any] | None = None) -> int:
    result = db.execute(query, params or {})
    return int(result[0]["count"]) if result else 0


@contextmanager
def timed_phase(info: dict[str, Any], name: str):
    started = perf_counter()
    try:
        yield
    finally:
        durations = info.setdefault("duration_seconds", {})
        durations[name] = durations.get(name, 0.0) + perf_counter() - started


def normalize_graph(
    db: Database,
    owner: str,
    *,
    batch_size: int = BATCH_SIZE,
    process_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Add SOUP labels/properties and DF projection; safe to rerun after failure.

    This does not construct synthetic object-object REL edges from PromG's
    reified CASE_* semantics; those require a separately validated mapping.
    """
    if db.backend != "neo4j":
        raise ValueError("PromG BPIC17 compatibility projection requires Neo4j")
    if batch_size < 1:
        raise ValueError("batch_size must be positive")

    # Dataset databases are exclusive. Do not project another dataset's graph.
    foreign = _count(
        db,
        "MATCH (n) WHERE n.Log IS NOT NULL AND n.Log <> $owner RETURN count(n) AS count",
        {"owner": owner},
    )
    if foreign:
        raise ValueError(
            "Refusing to normalize graph with nodes owned by another dataset"
        )

    info = process_info if process_info is not None else {}

    # Database.execute uses an implicit transaction, as required by native
    # subtransactions. The outer scan runs once; committed markers make a new
    # invocation skip completed rows after any interruption. Never wrap this
    # query in Database.transaction or a retrying managed write transaction.
    def batches(
        match: str, variables: str, updates: str, params: dict[str, Any] | None = None
    ) -> int:
        # Read completion markers inside the bounded transaction. Reading them
        # in the outer scan makes Neo4j insert a graph-sized Eager buffer before
        # DF projection because the inner transaction also changes the marker.
        source, condition = match.split(" WHERE ", 1)
        query = (
            source
            + " CALL { WITH "
            + variables
            + " WITH "
            + variables
            + " WHERE "
            + condition
            + " "
            + updates
            + " } IN TRANSACTIONS OF $batch ROWS RETURN count(*) AS count"
        )
        return _count(db, query, {"batch": batch_size, **(params or {})})

    with timed_phase(info, "normalization_nodes"):
        # Adding Type does not remove the PromG labels or its native lowercase
        # `type` attribute (ApplicationType, etc.).
        by_type: dict[str, int] = {}
        for kind in entity_types():
            ident = _identifier(kind)
            batches(
                f"MATCH (n:Entity:{ident}) WHERE n._soup_entity_normalized IS NULL ",
                "n",
                "SET n.Type = $kind, n.Value = coalesce(n.Value, n.sysId, elementId(n)), "
                "n._soup_entity_normalized = true",
                {"kind": kind},
            )
            by_type[kind] = _count(
                db, f"MATCH (n:Entity:{ident}) RETURN count(n) AS count"
            )

        # Keep native timestamp values and activities. Do not parse timestamps
        # and risk changing PromG's original ordering or timezone semantics.
        batches(
            "MATCH (e:Event) WHERE e._soup_event_normalized IS NULL ",
            "e",
            "SET e.ActivityName = coalesce(e.ActivityName, e.activity), "
            "e.Timestamp = coalesce(e.Timestamp, e.timestamp), "
            "e.Event_Id = coalesce(e.Event_Id, e.sysId, elementId(e)), "
            "e._soup_event_normalized = true",
        )
        # Required by SOUP's Neo4j EKG views and Ocean. Tag all original
        # nodes, including Activity nodes and reified relation nodes.
        batches(
            "MATCH (n) WHERE n.Log IS NULL", "n", "SET n.Log = $owner", {"owner": owner}
        )
    with timed_phase(info, "normalization_corr"):
        batches(
            "MATCH (:Event)-[r:CORR]->(n:Entity) WHERE r._soup_corr_normalized IS NULL",
            "r, n",
            "SET r.Type = coalesce(r.Type, n.Type), r._soup_corr_normalized = true",
        )

    with timed_phase(info, "normalization_df"):
        counts: dict[str, int] = {}
        for native_type, kind in df_types():
            if native_type == "DF":
                # PromG native DF (if configured) must not be duplicated.
                counts[native_type] = _count(
                    db, "MATCH ()-[r:DF]->() RETURN count(r) AS count"
                )
                continue
            ident = _identifier(native_type)
            # A completed batch atomically creates its SOUP :DF counterpart and
            # marks the PromG source relationship. Retrying cannot double-create.
            batches(
                f"MATCH (a:Event)-[original:{ident}]->(b:Event) "
                "WHERE original._soup_projected IS NULL",
                "a, original, b",
                "CREATE (a)-[df:DF]->(b) "
                "SET df += properties(original) "
                "SET df.Type = $kind, df._soup_promg_source = elementId(original), "
                "original._soup_projected = true",
                {"kind": kind},
            )
            counts[kind] = _count(
                db, f"MATCH ()-[r:{ident}]->() RETURN count(r) AS count"
            )

        # One grouped scan instead of rescanning all projected relationships per type.
        projected = {
            row["kind"]: int(row["count"])
            for row in db.execute(
                "MATCH ()-[r:DF]->() WHERE r._soup_promg_source IS NOT NULL "
                "RETURN r.Type AS kind, count(r) AS count"
            )
        }
        for native_type, kind in df_types():
            if native_type != "DF" and counts[kind] != projected.get(kind, 0):
                raise RuntimeError(
                    f"DF projection mismatch for {kind}: {counts[kind]} native / {projected.get(kind, 0)} projected"
                )

    return {
        "entities_by_type": by_type,
        "df_by_type": counts,
        "events": _count(db, "MATCH (e:Event) RETURN count(e) AS count"),
        "normalization": "promg_bpic17_to_soup_v1",
    }
