# ekg_views

Backend compatibility: **memgraph, neo4j**. Required packages: `soup_base`.
Manifest-level tools: `storage`. See the [manifest](soup-package.json) for
Python requirements.

The manifest requires `soup_base` and the `storage` tool. Memgraph views obtain
the active EKG runtime through its optional public API; Neo4j views bind the
object's registered database through `ctx.database.for_dataset(obj.id)`.
Incomplete or mixed OCED imports are refused. The adapter keeps native Neo4j
identity values intact, normalizes temporal values, and maps the view's legacy
activity/timestamp property references to the import configuration. This does
not change original OCEAN import queries.

Query structure is fixed. Labels and relationship types are escaped and chosen
from closed lists; values, offsets and limits use parameters. Invalid view
selections return `400`.

| Contribution                       | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Graph** (`ekg_views.graph`)      | Toolbar with the graph view (including views from other packages contributed to `ekg.graph_views`), initial limit 200 up to `SOUP_EKG_VIEWS_MAX_LIMIT` (default 2000; a non-positive/non-integer value prevents the package from loading), relationship types, and node shapes. Drawing uses `<soup-graph-view>` from `soup_base`. Provided views: **Standard graph** (`standard`) and **Object graph** (`object`, showing `:REL` edges between entities, qualifiers, and `:CORR` qualifiers; empty without `:REL`). Actions: `graph` `{view, limit, relations}` → `{view, limit, relations, max_data, graph}`, `search` `{view, text, kind: node\|edge, offset, relations, label?}` → `{items, total}` (50-item pages), `node` `{view, id}` → node properties. First rendering emits `soup-thumbnail`. **Export SVG** downloads `<name>.svg` via `context.download`. |
| **Statistics** (`ekg_views.stats`) | Counts, earliest/latest timestamps, unique activities, entity types with missing/`"nan"`/empty event values (warning `"N nodes have NaN values."`), CSV columns classified by imported role (event ID, timestamp, activity, entity, value, unused), composition charts for Event/Entity/CORR/DF and construction-phase timings in seconds (when `meta.process_info` exists). Shows `meta.notice` and messages contributed to `ekg.stats_notices`.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Queries** (`ekg_views.queries`)  | All `GraphQuery` contributions to `ekg.queries`, grouped by `group`, each with its field form. Action `query` `{key, params}` → `{key, label, blocks}`, displayed with `<soup-report-view>`. The 21 bundled queries cover event/entity nodes; entity by type; events by activity; CORR, DF, type-specific DF; REL/CORR counts by qualifier; counts of event/entity/CORR/DF/all nodes; activities and frequencies; entity keys and types; null values; earliest/latest timestamps; and maximum display count.                                                                                                                                                                                                                                                                                                                                                          |
| **Graph JSON** (`ekg_views.json`)  | `parts` multiselect from `ekg.json_parts`; output object maps each part label to its data: `Event nodes`, `Entity nodes`, `CORR relationships` with `{corr_data: [{event, relation_type, related_event, relation_id}], corr_count}`, `DF relationships` with `{df_data, df_count}`, and `REL relationships` with `{rel_data: [{source, relation_type, qualifier, target, relation_id}], rel_count}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Extension points are exported from `soup_pkg_ekg_views.api` (require
`ekg_views`) and accept `ctx.contribute(POINT, item, key=item.key)`:

| Point                                         | Contract                                                                                                                                                                                                                                                                                    | Provided bases                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GRAPH_VIEWS_POINT` (`"ekg.graph_views"`)     | `GraphView`: `key`, `label`, `relationship_types`, `default_relations`, `node_labels`, `edges_query(limit, relations) -> Query`, `to_graph(records) -> {nodes, edges, directed}`; optional `search_query`, `search_count_query`, `search_items`, `node_query`, `to_node`, `max_data_query`. | `EdgeListGraphView` (Template Method): `relationships` maps `{type: (source label, target label)}`; its fixed list defines `relationship_types` and `node_labels`. Hooks: `node_label`, `node_group`, `edge_type`, `edge_label`. It builds its own queries. `StandardGraphView` (`standard`) uses Event/Entity, CORR/DF (DF by default), grouping by Event or entity type. `ObjectGraphView` (`object`) uses REL between entities and CORR (REL by default). |
| `QUERIES_POINT` (`"ekg.queries"`)             | `GraphQuery`: `key`, `label`, `group`, `fields`, `build(params) -> Query`, `transform(records, params) -> [block]`. `values(raw)` validates fields and caps `limit` at `max_limit` (1000).                                                                                                  | `CountQuery` (key/value block reading `count`), `NodeListQuery` (paged table with `total`), `RelationshipListQuery`; `where` and `filter_params` for restrictions.                                                                                                                                                                                                                                                                                           |
| `JSON_PARTS_POINT` (`"ekg.json_parts"`)       | `JsonPart`: `key`, `label` (JSON key), `query() -> Query`, `transform(records)`.                                                                                                                                                                                                            | `NodesPart`, `RelationshipsPart`, `RelPart`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `STATS_NOTICES_POINT` (`"ekg.stats_notices"`) | `StatsNotice`: `key`, `notice(obj, tools) -> str \| None` for an object's Statistics notice, if any.                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Each contribution declares applicable object kinds with `kinds` (default
`("ekg",)`). `ekg_views` contributions use
`STANDARD_KINDS = ("ekg", "ekg_class", "oced_importer.log")` because an
`ekg_class` graph also contains its parent's EKG. **Graph** and **Statistics**
accept `ekg` on Memgraph and `oced_importer.log` on Neo4j. Graph only offers
views applicable to the object kind. **Queries** and **Graph JSON** accept
`ekg`, compatible OCED contributions, plus any kind that has at least one
**dedicated** contribution (`kinds` not containing `ekg`); when
`ekg_class_graph` is active they also accept `ekg_class`, otherwise not. For any
object, they show only contributions whose `kinds` includes that object kind.
Graph, Statistics, and Queries include the object's `meta.notice` in `data()`
and display it as a notice. `GraphVisualizer` is exported for visualizers
serving other kinds with their own frontend element (such as Aggregated graph).

Contributions are re-read on each request: enabling or disabling a package at
runtime immediately adds or removes its views, queries, and JSON parts.

See the [package developer documentation](../README.md) for authoring, packaging
and lifecycle rules.

## Query UI and compatibility

Selecting a query runs it immediately when all required fields have defaults (or
there are no fields). Required fields without defaults wait for **Run**. A query
without fields has no redundant form/run button; an error stays in its result
area with **Retry**. Queries with fields keep **Run** for an explicit rerun, not
a request on every keystroke. While loading, results are marked `aria-busy`;
stale responses are ignored. Results are cached for the current page by query
and parameter values.

The existing views use numeric IDs through the original `id()` query functions;
Neo4j servers that remove support for those functions are not supported by this
visualizer. Temporal serialization retains Neo4j timestamp precision/time zones.
The OCEAN loader does not create object-object `REL` relationships; an OCED
graph therefore has none unless another authorized workflow created them. Its
import phase timings, when recorded in `meta.process_info`, are available to
Statistics. Memgraph analysis and class-graph packages remain Memgraph-only.

For development, use the current source tests under `app/test`. Some existing UI
tests still expect Italian labels and need updating before the full suite can be
claimed passing. The old `tests/memgraph_smoke.py` and shared architecture
helpers are absent; earlier claims of particular live-server versions/check
counts are not reproducible from this checkout alone.
