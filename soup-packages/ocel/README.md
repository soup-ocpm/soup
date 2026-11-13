# ocel

Backend compatibility: **memgraph**. Required packages: `soup_base`, `ekg`,
`ekg_views`, `tool_storage`. Manifest-level tools: `memgraph`, `storage`. See
the [manifest](soup-package.json) for Python requirements.

`requires: ["soup_base", "ekg", "ekg_views", "tool_storage"]`,
`requires_tools: ["memgraph", "storage"]`, `api_version: "4.1"`. Reads OCEL 2.0
JSON (`eventTypes`, `objectTypes`, `objects`, `events`) using only Python's
standard library. Invalid input returns `400`, naming the invalid location and
reason (e.g. an invalid `events[2].time` timestamp). Rejects malformed JSON,
duplicate IDs, non-ISO timestamps, references to absent objects, undeclared
types where types are declared, and non-scalar values. Without
`eventTypes`/`objectTypes`, types are inferred. Both importers have the same
`inspect`: a key/value block (event and object counts and type counts) and a
table of the first 20 events.

| Contribution                                                  | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OCEL 2.0 as tables** (`ocel.tables`, → `ocel_tables`)       | Stores tables under `ocel/<object id>/` in storage, one JSON file per table to preserve types: `events` (`event_id`, `event_type`, `time`, one column per attribute), `objects` (`object_id`, `object_type`, first value of each attribute), `event_objects` (including `qualifier`), `object_objects` (`source_id`, `source_type`, `target_id`, `target_type`, `qualifier`), `object_attributes` (each time-stamped attribute value), and `types.json`. Explicit `null` values remain `null`; blank table cells represent absent attributes, while explicit nulls are listed in the events JSON `nulls` field. No Memgraph queries. `dispose` deletes the directory.                                                                         |
| **OCEL 2.0 as EKG on Memgraph** (`ocel.ekg`, → `ekg`)         | Uses separate-form `EventLogData` with fixed mapping: event ID, UTC time without offset, and event type map to event ID, timestamp, and activity; object types become entity types; event attributes become properties (reserved names or names colliding with object types receive `_attribute`). OCEL's build step (`ocel_relationships`, order 420; see [ocel/README.md](../ocel/README.md)) writes event-object qualifiers as `qualifier` properties on `:CORR` and object-object relations as `(:Entity)-[:REL {qualifier}]->(:Entity)`. Step inputs `ocel_qualifiers.csv` and `ocel_o2o.csv` remain in the dataset. `meta.ocel.in_graph` counts qualified `:CORR` and `:REL`. All existing `ekg` visualizers/operations work unchanged. |
| **OCEL tables** (`<soup-pkg-ocel-tables>`)                    | Tabs for Events, Objects, Event-object relationships, and Object-object relationships, each using `<soup-table>` with server-side `page` `{table, offset, limit, sort, search, type}` → `{rows, total}`. `type` filters event types in Events and object types in Objects/Event-object; Object-object requires either endpoint to match.                                                                                                                                                                                                                                                                                                                                                                                                      |
| **OCEL summary** (`<soup-pkg-ocel-summary>`)                  | Counts via `<soup-keyvalue>` and events-per-type bar chart via `<soup-chart>`, sourced from metadata; the workspace thumbnail shows the same bars.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Decompose into EKG** (`ocel.to_ekg`, `ocel_tables` → `ekg`) | Same decomposition as the EKG importer, reading already imported tables. The child EKG object (`<name> (EKG)`) stages a new EKG dataset through the same build helper; it does not reuse the stored-table directory.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OCEL 2.0 JSON** exporter                                    | Reconstructs the log from tables; `file_type` preserves the imported `.json` or `.jsonocel` extension and uses `application/json`. Imported explicit nulls remain null; reimporting the export yields the same file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

All timestamps pass through `parse_time` in `server/model.py`, including `Z` for
UTC. The implementation normalizes a trailing `Z` before calling
`datetime.fromisoformat`. The server Docker image uses Python 3.12.

OCEL tables are parsed once per object. OCEL Tables, the exporter, and Decompose
into EKG share a plugin-instance `ParsedCache` from `soup_base`
(`soup_pkg_soup_base.api`), as in `csv_table`. Limits `SOUP_OCEL_CACHE_OBJECTS`
and `SOUP_OCEL_CACHE_MB` default to 8 objects and 200 MB; non-positive or
non-integer values prevent package loading. A new import and `dispose`
invalidate the cache. API helpers `read_table`, `read_log`, and `load_tables`
always read storage directly.

For a runtime-installation check (the repository also contains
`soup-app/e2e/ocel.spec.ts`), run
`npm run build:packages -- ocel && npm run pack -- ocel`. With the app running
and `soup_base`, `tool_storage`, `tool_memgraph`, `ekg`, and `ekg_views` active,
upload `dist/ocel-1.0.0.zip` through **/packages**. Its `.json` importers appear
immediately on **/import**, along with visualizers, operation, and exporter,
without an application restart or host rebuild.

Although the table importer itself issues no graph queries, the **package** is
Memgraph-only because its manifest also requires the Memgraph EKG packages. Do
not interpret a database-independent contribution as independent package
compatibility.

See the [package developer documentation](../README.md) for authoring, packaging
and lifecycle rules.

## Qualifier edge cases and older datasets

Each event/object pair has one CORR relationship. When several nonempty
qualifiers refer to that pair, staging keeps the first qualifier. Identical
object-object relationships with the same qualifier are deduplicated before
loading. An object that no event references has no Entity node in this EKG
representation, so its object-object relationships cannot be included.
Qualifiers are property values, never interpolated relationship types.

The order-420 step needs entities (200) and CORR (400), and runs before causal
DF (450) and standard DF (500). Index setup now runs at order 50. CSV-built EKGs
and older OCEL datasets without the extra CSV files skip this step. Rebuilding
an old dataset cannot reconstruct files that were never saved: reimport the OCEL
file or convert its stored tables again. `OcelRelationshipsNotice` exposes this
limitation in Statistics. The object view colors REL relationships by qualifier;
the query and JSON sections expose qualifier counts and relationship properties.

Existing OCEL Python tests reference old shared helpers absent from this
checkout; the old live Memgraph smoke script is also absent. Do not run a
historical smoke command against an external graph: those scripts were described
as clearing it.
