# OCEL 2.0 → OCED EKG

The existing bridge now supports Memgraph and Neo4j through `oced_importer`.
No core routing, drivers or original OCEAN queries are replaced.

## Import choices

For OCEL JSON (`.json` or `.jsonocel`), the standard import page offers:

- **OCEL 2.0 as tables**: retain the native log as `ocel_tables`, including
  qualifiers and attribute histories, for PM4Py OC-DFG and OCEL JSON export.
- **OCEL 2.0 as OCED EKG**: select an available graph backend, review the
  conversion preview and acknowledge any reported semantic loss. The bridge
  converts to OCED event/object CSVs and delegates validation, loading and
  workspace ownership to the existing OCED importer.

While this bridge is active, OCEL's native EKG upload option yields to it through
`oced.ocel_importers`, avoiding duplicate EKG upload choices. Disabling the
bridge restores the native importer. The native **Convert to EKG** operation on
OCEL tables remains available if its qualifier/object-link representation is needed.
Existing datasets and their owning importers are unchanged.

## Backends and metadata

Neo4j uses SOUP's configured connection and its existing system-database
provisioning API: a separate managed database is registered for every dataset.
Neo4j Enterprise multi-database privileges and a Neo4j-reachable
`SOUP_NEO4J_CSV_BASE_URL` are required. The bridge borrows OCED's HTTP server;
it never binds a second server to port 8081 or closes OCED's server itself.

Memgraph uses the existing EKG connection, locking, stored datasets and rebuild
pipeline with UUID-isolated dataset folders. Enable `ekg`, `ekg_views`, `tool_memgraph` and `tool_storage`. OCED adds
one property-loading step (owned by `oced.memgraph_steps`), after native node loading and before the existing CORR
and DF steps. CSVs are staged through the same dataset repository as other
Memgraph EKGs; the usual SOUP/Memgraph storage mount is sufficient. No new mount
or runtime dependency is introduced. Workspace switching rebuilds the selected
dataset, including its object attributes, without normalizing away spaces in IDs
or activity names. Disabled OCED property loading fails clearly rather than
silently rebuilding a reduced graph.

Both backends produce `oced_importer.log`. Memgraph additionally has the standard
`Event_Id`, `ActivityName`, `Timestamp` and `Value` properties expected by shared
EKG views. `Log` ownership, graph keys, dataset/database mappings, construction
times, OCED configuration, conversion mappings and original filename are retained.
Graph/Statistics/Queries and packages accepting OCED logs can use the result.
Legacy operations declaring only `ekg` inputs still require their native EKG path;
this change does not widen unrelated operation contracts.

## Conversion semantics

- Multiple objects of each type may be referenced by an event. CORR duplicates
  are deduplicated, with a loss count; all events and all listed objects remain.
- Object IDs remain strings and globally unique; reference-list delimiters mean
  commas, outer whitespace and reserved null tokens in **object IDs** are rejected.
  Event IDs may contain commas. Safe column names and type aliases are mapped
  back to original names in conversion metadata.
- Boolean, integer and float values retain scalar types where compatible. Declared
  time attributes use datetime conversion. Compatible numeric kinds may be promoted to Float; incompatible scalar kinds fall back to strings;
  the preview records the resulting column types. Nonfinite numbers and integers
  outside signed 64-bit range are rejected instead of becoming silent NULLs.
- Missing/NULL attributes become absent graph properties. Empty attribute strings
  also become NULL and are reported. Graph properties cannot distinguish missing
  from explicit NULL.
- Event timestamps keep their source precision for Neo4j. Memgraph uses UTC
  local datetimes with at most six fractional digits, rejects higher precision
  before replacing the active graph, preserves Neo4j’s offset tie-break through
  event creation order at equal instants, and retains original event timestamp text
  in `_oced_timestamp_iso`. Supply explicit timezone offsets for unambiguous input;
  naive Memgraph timestamps are treated as UTC.
- Qualifiers and object-object links are not represented by this flat OCED model.
  Object attributes use the earliest value in chronological order (offsets and
  sub-microsecond ordering are considered). Later values and attribute-history
  timestamps are not represented. Counts, mappings and an explicit acknowledgement
  prevent these losses from being silent; native OCEL tables retain the full log.

The bridge uses the active OCEL parser when available. The existing standalone
parser remains as a fallback for Neo4j-only deployments, which do not activate the
Memgraph-dependent native OCEL package.

## Installation and checks

Update `oced_importer` to 1.2.0 and this bridge to 1.1.0 together. The revised OCEL
registration is 1.1.0. Deploy the accompanying small EKG lifecycle/view changes
for Memgraph OCED-kind support; there are no core or deployment-file changes.

```bash
PYTHONPATH=soup-server python soup-packages/ocel2_oced_bridge/tests/test_converter.py -v
```

Validation used disposable Memgraph 3.13.2 and Neo4j 5.26 Community instances, not
existing datasets: conversion types/IDs, HTTP loading, schema/CORR/DF, visualizers,
Memgraph switching/rebuild, failure recovery, native import restoration and
OCEL tables → PM4Py passed. Neo4j Community correctly refuses per-dataset database
creation; the loader was tested with an explicit test-catalog mapping. Enterprise
database provisioning remains the existing implementation and was not retested
against an external Enterprise instance.
