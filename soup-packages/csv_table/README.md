# csv_table

Backend compatibility: **memgraph, neo4j**. Required packages: `soup_base`,
`tool_storage`. Manifest-level tools: `storage`. See the
[manifest](soup-package.json) for Python requirements.

**CSV as table** importer (`.csv`, `.tsv`, kind `table`, module `csv`);
separator (`comma`, `semicolon`, `tab`) and header inferred via `csv.Sniffer`;
canonical CSV stored under `csv_table`. **CSV table** visualizer
(`<soup-pkg-csv-table-viewer>`) with server-side page action
`{offset, limit, sort: {column, direction}, filter: [{column, value}], search}`,
indexed columns, sorting, and per-column filtering; **Column profile**
(`<soup-pkg-csv-profile>`) with distinct values, blank cells, examples, and
`distribution` `{column, top}` chart. **Column distribution** operation (`table`
→ `report`). **CSV** exporter with selectable separator/header and `file_type`
(`api_version: "4.1"`): tab produces `.tsv`/`text/tab-separated-values`,
otherwise `.csv`/`text/csv`; without an explicit separator, the imported
separator is used.

## Parsing cache

This package owns a plugin-instance `ParsedCache` shared by its contributions,
keyed by object ID. `on_shutdown` clears it; imports/writes and disposal
invalidate entries. `SOUP_CSV_TABLE_CACHE_OBJECTS` and `SOUP_CSV_TABLE_CACHE_MB`
default to 8 objects and 200 MiB. Invalid non-positive/non-integer settings
prevent loading. See the
[shared cache API](../soup_base/README.md#parsed-content-cache) for thread
safety, LRU eviction and oversized-file behavior. The public package
`server/api.py` exposes the contributions and cache helpers.

Whitespace-only select values are treated as empty by core validation. Separator
choices therefore use `comma`, `semicolon` and `tab`, not a literal tab
character.

See the [package developer documentation](../README.md) for authoring, packaging
and lifecycle rules.
