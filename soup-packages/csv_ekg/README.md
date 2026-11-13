# csv_ekg

Backend compatibility: **memgraph**. Required packages: `ekg`, `soup_base`,
`csv_table`. Manifest-level tools: `memgraph`, `storage`. See the
[manifest](soup-package.json) for Python requirements.

**CSV as event log (EKG on Memgraph)** importer (`.csv`, kind `ekg`), providing
previews, event/time/activity/entity/value mappings, trigger/target and timing
fields, and a multiplicity graph (1:1, 1:N, N:1, N:N) when there are at least
two entity columns. **Convert to EKG** operation (`csv_table` `table` → child
`ekg`).

See the [package developer documentation](../README.md) for authoring, packaging
and lifecycle rules.
