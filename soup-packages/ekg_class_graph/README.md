# ekg_class_graph

Backend compatibility: **memgraph**. Required packages: `ekg`, `ekg_views`,
`soup_base`. Manifest-level tools: `memgraph`. See the
[manifest](soup-package.json) for Python requirements.

`requires: ["ekg", "ekg_views", "soup_base"]`, `requires_tools: ["memgraph"]`.

**Build aggregated graph** (`ekg_class_graph.build`, `ekg` → `ekg_class`)
accepts `name` and optional `entity_types` (a multiselect of graph entity types,
formerly `filtered_columns`). `ActivityName` is always the first aggregation
dimension; each selected entity type adds an AND grouping dimension. An empty
selection produces activity-only aggregation. A type with null-valued events generates a warning via
`NullEntities` in `ekg_views`. Via `ekg.derive_state`, the loaded graph receives
`:Class` nodes (one for each distinct activity and selected type combination, with
`Count`), `:OBSERVED` relationships from events, and `:DF_C` relationships
between classes. The resulting `ekg_class` is derived:
`meta.state = {provider: "ekg_class_graph.classes", spec: {entity_types}}`, its
`ekg` parent, `meta.graph_key`, `meta.counts` (`class_nodes`, `obs_rel`,
`dfc_rel`), and phase durations in `meta.process_info`. `ekg.ensure_loaded`
rebuilds the parent and applies the class StateProvider.

| Contribution                                                   | Behavior                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aggregated graph** (`<soup-pkg-ekg-class-graph>`)            | `GraphVisualizer` from `ekg_views` with `ekg_class` views: `class` first (`DF_C` by default, optionally `OBSERVED`), then `standard`. Actions: `graph`, `search`, `node`.                                                                                     |
| **Aggregated graph statistics** (`<soup-pkg-ekg-class-stats>`) | Counts, entity types, and two legacy charts: Class Nodes/OBS/DF_C and phase durations in seconds.                                                                                                                                                             |
| `ekg.graph_views`, `ekg.queries`, `ekg.json_parts`             | `class` view; Class node, OBSERVED, and DF_C queries and counts in group **Aggregated graph**; JSON parts `Class nodes`, `OBS relationships` (`obs_data`, `obs_count`), and `DF_C relationships` (`dfc_data`, `dfc_count`). All use `kinds = ("ekg_class",)`. |

An Observer subscribes to `ekg.before_reset` and, critically, to
`analysis.before_apply` (event name alone is enough; no dependency on
`ekg_analysis`) and removes its own `:Class` nodes, confirming none remain. No
other package calls its implementation directly. When disabled, analyses still
work, class queries/parts disappear, and existing `ekg_class` objects remain
without operations, visualizers, or exporters.

See the [package developer documentation](../README.md) for authoring, packaging
and lifecycle rules.
