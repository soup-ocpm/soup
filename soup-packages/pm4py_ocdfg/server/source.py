"""Read input through public package APIs and tools only."""

from __future__ import annotations

import json
from typing import Any

import pandas as pd
import soup_pkg_ekg.api as ekg
import soup_pkg_ocel.api as ocel
from pm4py.objects.ocel.obj import OCEL

from soup.core.contracts import ObjectRef, ValidationError

EID, ACT, TIME = "ocel:eid", "ocel:activity", "ocel:timestamp"
OID, TYPE = "ocel:oid", "ocel:type"

# Fixed identifiers, no user values interpolated in Cypher. Internal node IDs
# keep distinct Event_Id values and entities with the same value in two types.
EVENTS_QUERY = ekg.Query("""
MATCH (e:Event)
OPTIONAL MATCH (e)-[c:CORR]->(o:Entity)
WHERE c.Type IS NULL OR c.Type = o.Type
RETURN ID(e) AS event_id, e.ActivityName AS activity, e.Timestamp AS timestamp,
       o.Type AS object_type, o.Value AS object_value
ORDER BY e.Timestamp, ID(e)
""")
TYPES_QUERY = ekg.Query("MATCH (o:Entity) RETURN DISTINCT o.Type AS object_type ORDER BY object_type")


def object_types(obj: ObjectRef, tools) -> list[str]:
    if obj.kind == ocel.TABLES_KIND:
        return sorted(ocel.read_log(obj, tools).objects_per_type())
    if obj.kind != ekg.EKG_KIND:
        raise ValidationError('Select an OCEL tables or Memgraph EKG dataset.')
    memgraph = tools.get('memgraph')
    with memgraph.session():
        ekg.ensure_loaded(obj, tools)
        rows = memgraph.run(TYPES_QUERY)
    return sorted(
        {
            str(row["object_type"])
            for row in rows
            if row.get("object_type") is not None
        }
    )


def _timestamp(value: Any) -> Any:
    if hasattr(value, "to_native"):
        value = value.to_native()
    return value.isoformat() if hasattr(value, "isoformat") else value


def read_rows(obj: ObjectRef, tools, chosen: list[str]):
    events: dict[str, dict] = {}
    objects: dict[str, dict] = {}
    links: set[tuple[str, str]] = set()
    if obj.kind == ocel.TABLES_KIND:
        log = ocel.read_log(obj, tools)
        objects = {item.id: {OID: item.id, TYPE: item.type} for item in log.objects if item.type in chosen}
        for event in log.events:
            events[event.id] = {EID: event.id, ACT: event.type, TIME: event.time}
            for relation in event.relationships:
                if relation.object_id in objects:
                    links.add((event.id, relation.object_id))
    else:
        if obj.kind != ekg.EKG_KIND:
            raise ValidationError('Select an OCEL tables or Memgraph EKG dataset.')
        memgraph = tools.get('memgraph')
        with memgraph.session():
            ekg.ensure_loaded(obj, tools)
            rows = memgraph.run(EVENTS_QUERY)
        for row in rows:
            eid = str(row["event_id"])
            events[eid] = {EID: eid, ACT: row["activity"], TIME: _timestamp(row["timestamp"])}
            kind, value = row.get("object_type"), row.get("object_value")
            if kind is not None and str(kind) in chosen and value is not None:
                oid = json.dumps([str(kind), str(value)], ensure_ascii=False)
                objects[oid] = {OID: oid, TYPE: str(kind)}
                links.add((eid, oid))

    return events, objects, links


def read_ocel(obj: ObjectRef, tools, chosen: list[str]) -> OCEL:
    events, objects, links = read_rows(obj, tools, chosen)
    # Object-type projection: retain exactly events participating in the chosen
    # types. An E-O pair contributes once, even if OCEL has several qualifiers.
    linked = {eid for eid, _ in links}
    events = {eid: event for eid, event in events.items() if eid in linked}
    if not links:
        raise ValidationError("No event-to-object relationships exist for the selected types.")
    frame = pd.DataFrame(events.values(), columns=[EID, ACT, TIME])
    if frame[ACT].isna().any() or frame[ACT].astype(str).str.strip().eq("").any():
        raise ValidationError("The log contains events with missing activities.")
    try:
        frame[TIME] = pd.to_datetime(frame[TIME], utc=True, format="mixed", errors="raise")
    except (ValueError, TypeError, OverflowError) as error:
        raise ValidationError("The log contains invalid timestamps. Use valid ISO 8601 timestamps.") from error
    if frame[TIME].isna().any():
        raise ValidationError("The log contains events with missing timestamps.")
    # Stable order: original OCEL event order breaks ties, EKG uses ID(e).
    frame = frame.sort_values(TIME, kind="stable").reset_index(drop=True)
    rank = {eid: i for i, eid in enumerate(frame[EID])}
    rows = [{**events[eid], **objects[oid]} for eid, oid in sorted(links, key=lambda p: (rank[p[0]], p[1]))]
    relations = pd.DataFrame(rows, columns=[EID, ACT, TIME, OID, TYPE])
    relations[TIME] = pd.to_datetime(relations[TIME], utc=True, format="mixed")
    return OCEL(events=frame, objects=pd.DataFrame(objects.values(), columns=[OID, TYPE]), relations=relations)
