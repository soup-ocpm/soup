# ekg_analysis

Backend compatibility: **memgraph**. Required packages: `ekg`, `ekg_views`,
`soup_base`. Manifest-level tools: `memgraph`, `storage`, `catalog`. See the
[manifest](soup-package.json) for Python requirements.

`requires: ["ekg", "ekg_views", "soup_base"]`,
`requires_tools: ["memgraph", "storage", "catalog"]` (the catalog is needed to
adopt analyses already on disk), `api_version: "4.0"` (uses `Exporter.applies`,
introduced in `"3.1"`).

An analysis is a **derived** `ekg` object: `parents` contains its source `ekg`;
`meta.state = {provider: "analysis", spec: {name, description, filters: {filter key: [condition, ...]}}}`
(the EKG state-provider model), `meta.graph_key`,
`meta.analysis = {dataset, name}` (the file), `meta.counts = {before, after}`
(nodes and relationships), and `meta.result` is `"changed"` or `"unchanged"`.
The configuration is also saved as `/soup/<dataset>/Analyses/<name>.json` in the
legacy format: keys `timestamp`, `performance`, `includeActivities`,
`excludeActivities`, `frequence`, and `variant` are always present, along with
`dataset_name`, `analysis_name`, and `analysis_description`.

| Contribution                                                         | Behavior                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New analysis** (`ekg_analysis.new`, `ekg` → `ekg`)                 | Fields `name`, `description`, and `filters` (`items` type; each `AnalysisFilter` from any package at `ekg.analysis_filters` becomes a variant). Options come from the object's graph (entity types, activities, earliest/latest timestamps). Filters are applied by their `order`, not by UI list order; order affects results. |
| **Import analysis configuration** (`ekg_analysis.import`)            | `name` and `file` fields (legacy JSON), validated per filter (e.g. `performance[1]: seconds ...`); unknown keys yield `400`. Execution then follows New analysis.                                                                                                                                                               |
| **Example configuration** (`ekg_analysis.example`, `ekg` → `report`) | Markdown explaining each key and an `analysis_example.json` file block built for the object (replaces legacy `getExampleJSON` and `help/file_configuration_example.json`); importable unchanged.                                                                                                                                |
| **Process indicators** (`<soup-pkg-ekg-insights>`, kind `ekg`)       | Entity types, activity frequencies, and, for each entity type, average trace duration, activity occurrences, and variants with their average duration. Actions `entity` `{entity}` (must be a graph entity type; otherwise `400`) and `frequency` `{min}`.                                                                      |
| **Analysis configuration** exporter (`.json`)                        | Applies only to analysis objects (`applies`); exports legacy-format JSON.                                                                                                                                                                                                                                                       |

`AnalysisService` provides compensating actions: it checks uniqueness of the
name (`409`), saves the file, and uses `ekg.derive_state` on the loaded parent
graph to count nodes/edges, publish `analysis.before_apply` with
`{object, analysis, spec}` (declared by `soup_pkg_ekg_analysis.api`; subscribers
register as critical), apply filters, and count again. On failure, no object is
created, the file is deleted, and the parent graph is rebuilt. If nothing
changes, the object is still created with `meta.result: "unchanged"` and
`meta.notice`, and the file remains (equivalent to legacy **Nothing changed**).
After another graph is opened, the `analysis` StateProvider reapplies filters to
the rebuilt parent with the same `meta.graph_key`. Deleting an analysis also
removes its file.

Filters follow the Command pattern: `AnalysisFilter` has `key`, `label`,
`description`, `order`, `fields(obj, tools)`, `validate(spec)`, and
`to_queries(spec, ctx) -> list[Query]` (`FilterContext` provides `run` and
`activities()`). `EntityConditionFilter` is a base for entity
type/operator/value filters. Six bundled filters run in the legacy
`process_analysis` order: `timestamp` (100), `performance` (200),
`includeActivities` (300), `excludeActivities` (400), `frequence` (500),
`variant` (600). Cypher structure is fixed; labels/types pass through `ident()`,
operators are chosen from the fixed `OPERATORS` list (`<`, `<=`, `=`, `!=`
translated to `<>`, `>`, `>=`), and values are parameterized. Packages add
filters with
`ctx.contribute(ANALYSIS_FILTERS_POINT, item, key=item.key, order=item.order)`;
they appear as New analysis variants and configuration keys.

On startup, existing `Analyses/<name>.json` files in cataloged datasets without
corresponding objects are adopted as derived `ekg` objects from their roots
(created by `ekg_analysis.new`, without a graph key; the first opening
rebuilds). Invalid or unreadable files are logged. An analysis based on another
analysis is its child and includes `"based_on": "<parent>"` in its file.
Adoption orders parents first; when a parent is absent or a cycle exists,
adoption falls back to the root with `meta.warning` and a logged warning. The
implementation is in [server/service.py](server/service.py),
[server/provider.py](server/provider.py) and
[server/filters.py](server/filters.py). No `tests/memgraph_smoke.py` exists in
the current checkout.

See the [package developer documentation](../README.md) for authoring, packaging
and lifecycle rules.

## Manual validation

Use a disposable Memgraph dataset imported from your own small CSV. Verify each
analysis filter and its supported operators; a duplicate analysis name
returns 409. A condition that changes nothing still creates the derived object
and its notice. Open the root, reopen the analysis, and compare counts after the
rebuild. Create an analysis from an analysis and verify `based_on` and parent
provenance; normal parent deletion with children is refused, while explicit
cascade removes the children and their configuration files.

Download **Example configuration**, import it again, and verify the same
filters. Invalid operators should identify the filter/condition in a 400
response. Build an aggregated graph before a new analysis and verify its Class
nodes are removed by the observer before filtering. The analysis configuration
exporter is offered only on analysis objects and retains the six legacy keys
plus `based_on` when used.

The previous README cited `tests/memgraph_smoke.py`, a sample fixture under
`soup-server/tests`, historical 51/51 live checks and a compatibility test.
Those artifacts/results cannot be verified in the current checkout. The script
was described as destructive, so no replacement live-database command is implied
here. The frontend source test is `app/test/insights.test.ts`; old label
expectations should be distinguished from functional regressions.
