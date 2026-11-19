# SOUP package development

SOUP features are delivered as packages: Python contributions on the server and,
optionally, a frontend bundle of Web Components mounted by the Angular host.
Packages can provide importers, operations, visualizers, exporters, tools and
extension points. Bundled packages live here; trusted ZIP packages can also be
installed while the application runs.

## Quick start

Use Node **24.22.0 or later** and npm **11 or later**, matching this workspace's
`engines`. Use the repository's Python environment for backend checks; the
server Docker image uses Python 3.12.

From the repository root:

```sh
cd soup-packages
npm ci
npm run build:packages -- _template
npm run pack -- _template
```

This creates `dist/template-1.0.0.zip`. With ZIP installation enabled on your
SOUP server (`SOUP_ALLOW_PACKAGE_INSTALL=true`), install it from **Packages**.
Import a `.txt` file, select **Text file (template)**, and open the resulting
**Text** view. The `_template` directory is excluded from automatic discovery;
packaging it is an explicit way to try it. To create your own package, run
`npm run create:package` from this directory. The interactive scaffolder asks
for contribution type, database compatibility and frontend support; see
[getting started](docs/getting-started.md#2-create-a-separate-package) for the
generated examples and build steps.

Install only trusted code. A package runs with server-process and browser-page
privileges; manifest/tool declarations are dependency checks, not a sandbox.

## Documentation

| Start here when you want to…                                               | Guide                                                |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Copy and run the smallest example                                          | [Getting started](docs/getting-started.md)           |
| Build a complete importer → operation → visualizer → exporter workflow     | [Package development](docs/package-development.md)   |
| Look up manifests, contracts, tools, databases, SDK and errors             | [Package API](docs/package-api.md)                   |
| Extend another package through public APIs, extension points or events     | [Extensions and EKG integration](docs/extensions.md) |
| Understand discovery, runtime management, packaging, upgrades and security | [Package lifecycle](docs/lifecycle.md)               |

Memgraph is the default backend. Neo4j is optional and external. A package
declares `memgraph`, `neo4j`, or both in its manifest; omitting the field means
Memgraph-only. Database-independent packages may support both. Graph packages
must resolve graph access from the dataset, not a global backend or database
setting.

## Bundled package references

Implementation details belong to the package that owns them:

| Package                                        | Role                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| [`_template`](_template/README.md)             | Minimal text importer, visualizer and report operation; not automatically discovered    |
| [`soup_base`](soup_base/README.md)             | Shared report/graph/table/chart elements, report contributions and parsed-content cache |
| [`tool_storage`](tool_storage/README.md)       | Files, catalog and preferences                                                          |
| [`tool_memgraph`](tool_memgraph/README.md)     | Native Memgraph lifecycle tool and `Query` adapter                                      |
| [`text`](text/README.md)                       | Text/Markdown import, viewing and export                                                |
| [`csv_table`](csv_table/README.md)             | Tabular import, paging, profiling and export                                            |
| [`ekg`](ekg/README.md)                         | Memgraph EKG construction and dataset state restoration                                 |
| [`csv_ekg`](csv_ekg/README.md)                 | CSV/table-to-Memgraph EKG workflows                                                     |
| [`causal_df`](causal_df/README.md)             | Causal DF build step                                                                    |
| [`ekg_views`](ekg_views/README.md)             | EKG visualizers, queries, JSON export and extension points                              |
| [`ekg_analysis`](ekg_analysis/README.md)       | Memgraph derived analyses and filter extension point                                    |
| [`ekg_class_graph`](ekg_class_graph/README.md) | Memgraph aggregated graphs and derived state                                            |
| [`ocel`](ocel/README.md)                       | OCEL 2.0 tables and Memgraph EKG integration                                            |
| [`oced_importer`](oced_importer/README.md)     | Neo4j OCED imports and per-dataset databases                                            |
| [`ocean_aggregation`](ocean_aggregation/README.md) | Neo4j-only OCEAN aggregation and Class graph visualization for imported OCED datasets |
| [`graph_explorer`](graph_explorer/README.md)   | Optional read-only graph exploration and stored scenes                                  |

Package Python libraries belong in each package’s `requirements.txt`; see
[dependency approval and deployment](docs/lifecycle.md#python-dependencies).
