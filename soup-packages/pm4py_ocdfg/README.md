# OC-DFG (PM4Py)

Optional Memgraph package for OC-DFG discovery from `ocel_tables` or `ekg` objects.
Version 1.1.3 upgrades 1.1.2 through SOUP's normal package installer. Enable its
manifest dependencies: `soup_base`, `ocel`, `ekg`, `tool_storage`, `tool_memgraph`.
Neo4j is not supported: the EKG reader uses Memgraph's graph lifecycle and schema;
adding Neo4j requires a dataset-scoped reader and independent compatibility tests.

The host must provide the manifest's Python dependencies. SOUP checks these before
installation and does not install Python libraries from uploaded packages. The
server requirements pin the tested PM4Py 2.7.17 and Python Graphviz 0.21 alongside
pandas 2.2.3 and NumPy 2.2.6. SVG rendering additionally needs Graphviz's `dot`
executable on PATH; the server Dockerfile installs it. Rebuild the backend image
when updating these dependencies. Missing `dot` leaves discovery, the interactive
view and JSON/DOT exports usable, with an actionable warning for static SVG.

Select a source dataset, then **Process discovery → Discover OC-DFG (PM4Py)**.
Choose one or more object types. Discovery retains events linked to the selected
types, deduplicates event/object pairs across qualifiers, normalizes timestamps to
UTC and preserves stable timestamp tie ordering. EKG reads hold the existing
Memgraph session lock across dataset activation and graph reads. Discovery does
not change the source graph. The complete PM4Py model is stored as JSON in the
package's storage namespace; tuples and sets are encoded without pickle.

The visualizer provides interactive search, inspection and SVG download plus the
original PM4Py static view. Filters change only the visualization, not the stored
model. JSON, SVG and Graphviz DOT exporters use the existing SOUP export API.
Performance annotations support event-pair and total-object edge metrics; PM4Py
does not support performance annotations for unique-object edges.

From `soup-packages/`, use the standard workspace commands:

```bash
npm ci
npm run build:packages -- pm4py_ocdfg
npm run pack -- pm4py_ocdfg
```

The installable archive is `dist/pm4py_ocdfg-1.1.3.zip`. Frontend sources and local
structural types for the required `soup_base` element are included for maintenance;
the ZIP carries the compiled Web Component, not another graph renderer.
