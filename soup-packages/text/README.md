# text

Backend compatibility: **memgraph, neo4j**. Required packages: `soup_base`,
`tool_storage`. Manifest-level tools: `storage`. See the
[manifest](soup-package.json) for Python requirements.

**Text** importer for `.txt`, `.md`, and `.log` (kind `text`); original file
stored under `text`, with size, line count, and encoding (UTF-8, otherwise
Latin-1) in metadata. **Text** visualizer (`<soup-pkg-text-viewer>`), displaying
`<soup-text>` or `<soup-markdown>`, with `lines` `{from, count}` and `search`
`{query}` actions. Original extension in `meta.extension`; **Original file**
exporter restores `.txt`, `.md`, or `.log` using `file_type`
(`api_version: "4.1"`), falling back to `meta.filename`, `format: "markdown"`,
or `.txt` for older objects. MIME is `text/markdown` for Markdown, otherwise
`text/plain`.

## Parsing cache

This package owns a plugin-instance `ParsedCache` shared by its contributions,
keyed by object ID. `on_shutdown` clears it; imports/writes and disposal
invalidate entries. `SOUP_TEXT_CACHE_OBJECTS` and `SOUP_TEXT_CACHE_MB` default
to 8 objects and 200 MiB. Invalid non-positive/non-integer settings prevent
loading. See the [shared cache API](../soup_base/README.md#parsed-content-cache)
for thread safety, LRU eviction and oversized-file behavior. The public package
`server/api.py` exposes the contributions and cache helpers.

See the [package developer documentation](../README.md) for authoring, packaging
and lifecycle rules.
