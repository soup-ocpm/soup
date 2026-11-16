"""Non-destructive PromG BPIC17 -> SOUP Neo4j EKG compatibility projection.

PromG's original nodes and typed DF relationships remain unchanged. All writes
are scoped to the SOUP-created dataset database passed by its importer.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from soup.core.contracts.database import Database

_ASSETS = Path(__file__).parent / "assets" / "BPIC17.json"
HEADER = json.loads(_ASSETS.read_text(encoding="utf-8"))
BATCH_SIZE = 10_000


def _identifier(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise ValueError(f"Unsafe PromG relationship or entity type {value!r}")
    return f"`{value}`"


def entity_types() -> tuple[str, ...]:
    return tuple(node["type"] for node in HEADER["nodes"] if node.get("include", True) and node["type"] != "Event" and node["type"] != "Activity") + tuple(
        relation["type"] for relation in HEADER["relations"]
        if relation.get("model_as_node") and relation.get("include", True)
    )


def df_types() -> tuple[tuple[str, str], ...]:
    return tuple(
        ("DF_" + item["type"].upper() if item.get("include_label_in_df") else "DF", item["type"])
        for item in (*HEADER["nodes"], *HEADER["relations"])
        if item.get("include", True) and item.get("infer_df")
    )


def _count(db: Database, query: str, params: dict[str, Any] | None = None) -> int:
    result = db.execute(query, params or {})
    return int(result[0]["count"]) if result else 0


def normalize_graph(db: Database, owner: str, *, batch_size: int = BATCH_SIZE) -> dict[str, Any]:
    """Add SOUP labels/properties and DF projection; safe to rerun after failure.

    This does not construct synthetic object-object REL edges from PromG's
    reified CASE_* semantics; those require a separately validated mapping.
    """
    if db.backend != "neo4j":
        raise ValueError("PromG BPIC17 compatibility projection requires Neo4j")
    if batch_size < 1:
        raise ValueError("batch_size must be positive")

    # Dataset databases are exclusive. Do not project another dataset's graph.
    foreign = _count(db, "MATCH (n) WHERE n.Log IS NOT NULL AND n.Log <> $owner RETURN count(n) AS count", {"owner": owner})
    if foreign:
        raise ValueError("Refusing to normalize graph with nodes owned by another dataset")

    # All transformations are bounded transactions. BPIC17 has too many
    # events for a single large Neo4j write transaction.
    def batches(query: str, params: dict[str, Any] | None = None) -> int:
        total = 0
        parameters = {"batch": batch_size, **(params or {})}
        while True:
            processed = _count(db, query, parameters)
            total += processed
            if processed == 0:
                return total

    # Adding Type does not remove the PromG labels or its native lowercase
    # `type` attribute (ApplicationType, etc.).
    by_type: dict[str, int] = {}
    for kind in entity_types():
        ident = _identifier(kind)
        batches(
            f"MATCH (n:Entity:{ident}) WHERE n._soup_entity_normalized IS NULL "
            "WITH n LIMIT $batch "
            "SET n.Type = $kind, n.Value = coalesce(n.Value, n.sysId, elementId(n)), "
            "n._soup_entity_normalized = true RETURN count(n) AS count",
            {"kind": kind},
        )
        by_type[kind] = _count(
            db, f"MATCH (n:Entity:{ident}) RETURN count(n) AS count"
        )

    # Keep native timestamp values and activities. Do not parse timestamps
    # and risk changing PromG's original ordering or timezone semantics.
    batches(
        "MATCH (e:Event) WHERE e._soup_event_normalized IS NULL "
        "WITH e LIMIT $batch "
        "SET e.ActivityName = coalesce(e.ActivityName, e.activity), "
        "e.Timestamp = coalesce(e.Timestamp, e.timestamp), "
        "e.Event_Id = coalesce(e.Event_Id, e.sysId, elementId(e)), "
        "e._soup_event_normalized = true RETURN count(e) AS count"
    )
    # Required by SOUP's Neo4j EKG views and Ocean. Tag all original
    # nodes, including Activity nodes and reified relation nodes.
    batches(
        "MATCH (n) WHERE n.Log IS NULL WITH n LIMIT $batch "
        "SET n.Log = $owner RETURN count(n) AS count", {"owner": owner}
    )
    batches(
        "MATCH (:Event)-[r:CORR]->(n:Entity) "
        "WHERE r._soup_corr_normalized IS NULL WITH r, n LIMIT $batch "
        "SET r.Type = coalesce(r.Type, n.Type), "
        "r._soup_corr_normalized = true RETURN count(r) AS count"
    )

    counts: dict[str, int] = {}
    for native_type, kind in df_types():
        if native_type == "DF":
            # PromG native DF (if configured) must not be duplicated.
            counts[native_type] = _count(db, "MATCH ()-[r:DF]->() RETURN count(r) AS count")
            continue
        ident = _identifier(native_type)
        # A completed batch atomically creates its SOUP :DF counterpart and
        # marks the PromG source relationship. Retrying cannot double-create.
        query = (
            f"MATCH (a:Event)-[original:{ident}]->(b:Event) "
            "WHERE original._soup_projected IS NULL "
            "WITH a, original, b LIMIT $batch "
            "CREATE (a)-[df:DF]->(b) "
            "SET df += properties(original) "
            "SET df.Type = $kind, df._soup_promg_source = elementId(original), "
            "original._soup_projected = true "
            "RETURN count(df) AS count"
        )
        while True:
            created = _count(db, query, {"batch": batch_size, "kind": kind})
            if created == 0:
                break
        native_count = _count(db, f"MATCH ()-[r:{ident}]->() RETURN count(r) AS count")
        projected_count = _count(
            db, "MATCH ()-[r:DF {Type: $kind}]->() "
            "WHERE r._soup_promg_source IS NOT NULL RETURN count(r) AS count", {"kind": kind}
        )
        if native_count != projected_count:
            raise RuntimeError(
                f"DF projection mismatch for {kind}: {native_count} native / {projected_count} projected"
            )
        counts[kind] = projected_count

    # Re-tag all nodes after projections, even though DF creates no nodes.
    return {"entities_by_type": by_type, "df_by_type": counts,
            "events": _count(db, "MATCH (e:Event) RETURN count(e) AS count"),
            "normalization": "promg_bpic17_to_soup_v1"}
