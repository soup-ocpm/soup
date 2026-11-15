# Getting started

[Documentation index](../README.md) · Next:
[complete package tutorial](package-development.md)

This tutorial follows the actual [`_template`](../_template/README.md), without
requiring a graph server. Its importer keeps text lines in catalog metadata; its
visualizer renders that metadata; its operation produces a report. The package
has no required packages, tools or third-party Python libraries. The application
still needs a catalog provider, normally `tool_storage`, to register objects.

## 1. Try the unmodified template

From the repository root:

```sh
cd soup-packages
npm ci
npm run build:packages -- _template
npm run pack -- _template
```

Install `dist/template-1.0.0.zip` through **Packages** on a running SOUP server
with `SOUP_ALLOW_PACKAGE_INSTALL=true`. This flag is a server setting; setting
it in an unrelated terminal does not reconfigure an already running server.

Import a `.txt` file using **Text file (template)**. **Lines to keep** defaults
to 200. Inspection previews the first 10 lines, while import retains the
configured prefix in `meta.lines` with the filename and total line count. UTF-8
decoding uses replacement characters for invalid bytes. No original file is
stored externally, so `dispose()` has no files to remove.

In **Text**, the **Statistics** button invokes the server visualizer's `stats`
action. **Text statistics (report)** creates a child object of kind `report`.
Rendering that child requires an active report visualizer, normally `soup_base`.
This is optional: the template can create the report without that renderer.

The template manifest omits `databases`, so it is Memgraph-only even though its
implementation does not issue graph queries. To try the ZIP on Neo4j, explicitly
add `"databases": ["memgraph", "neo4j"]` to a copy's manifest, then build/pack
it. This is a declared compatibility change, not an automatic inference.

## 2. Create a separate package

From `soup-packages/`, run the interactive SOUP Studio scaffolder:

```sh
npm run create:package
```

Enter an unused lowercase name such as `my_package`, a description, one
contribution type (**Tool**, **Operation**, **Importer**, **Visualizer** or
**Exporter**), database support (**Neo4j**, **Memgraph** or **both**), and whether
to include a frontend (**yes**/**no**). Names follow the manifest's Python module
rules: a lowercase letter followed by lowercase letters, digits or underscores,
at most 128 characters. Existing directories are never overwritten. Invalid
answers are rejected before any package files are written.

The generator uses `_template`'s manifest, server module, importer and frontend
configuration, keeping only the selected contribution and its required files.
It writes `server/contribution.py` and registers the contribution in
`server/plugin.py`. It does not change the original template.

| Selection | Generated behavior |
| --- | --- |
| Importer | Template text importer retaining lines in metadata, producing `<name>.text` |
| Tool | Tool named `<name>` with a working health check |
| Operation | Accepts a `report`, produces a summary `report` |
| Visualizer | Displays a `report` |
| Exporter | Exports a `report`'s metadata as JSON |

Choosing a frontend adds an SDK Web Component displaying object metadata. For
non-visualizer contributions, it also registers a companion visualizer: importer
packages display their own text objects; the other packages display reports.
This is a visualization frontend, not a custom operation/import configuration
form. Without a frontend, a visualizer reuses `soup-report-view` and declares
`soup_base` as a dependency. Other choices need no package or tool dependencies;
the optional report renderer is not required to produce/export reports.

For **Importer**, **both**, **yes**, then run:

```sh
npm install
npm run build:packages -- my_package
npm run pack -- my_package
```

The existing `*/app` workspace pattern automatically includes generated
frontends. `npm install` refreshes workspace links and the lockfile; commit that
lockfile update for reproducible `npm ci` builds. The scaffolder does not run
installation or network commands itself. Backend-only packages have no `app/`
directory or manifest frontend entry and need only the pack command.

The manifest name, directory, kind, registration and custom-element tag agree.
Selecting a database declares compatibility; it does not provision a graph
server or implement database access. Generated examples issue no graph queries.
Use dataset-scoped database access when extending them; see
[the package API](package-api.md).

## 3. Understand the original template source files

| File                 | Responsibility                                                      |
| -------------------- | ------------------------------------------------------------------- |
| `soup-package.json`  | Identity, API version, compatibility, dependencies and entry points |
| `server/__init__.py` | Makes the server module importable                                  |
| `server/plugin.py`   | Registers `TextImporter`, `TextVisualizer`, `StatsReport`           |
| `server/text.py`     | Contracts and text/statistics behavior                              |
| `app/package.json`   | npm workspace identity; depends on `@soup/sdk`                      |
| `app/tsconfig.json`  | Extends the package workspace TypeScript configuration              |
| `app/src/index.ts`   | Registers the custom element, handles `stats`, emits a thumbnail    |
| `app/dist/index.js`  | Generated browser bundle; do not edit manually                      |

The host sets `data` and `context` before connecting the element. It imports the
package module as `soup_pkg_my_package`, so use relative Python imports
internally. The plugin does not repeat manifest identity or dependency
attributes.

## 4. Load and check it

Choose one route:

- **Repository development:** the next server startup discovers `my_package`
  under `soup-packages/` unless excluded by settings. Rebuild the server image
  when using Docker so it receives the source and generated frontend bundle.
- **Runtime installation:** upload `dist/my_package-1.0.0.zip` through
  **Packages** on another server. Its required providers must already be active.
  A package already bundled/installed under that name follows the
  version/override rules; uploading the identical version is not a reinstall
  shortcut.

For the generated importer, inspect/import a small text file and open
**my_package view**. It shows the retained lines and filename as metadata.
For the unmodified template, use **Text**, **Statistics**, and
**Text statistics (report)** to try its additional examples.
Delete the objects through SOUP and confirm there are no external files to clean
up.

For optional focused checks, see
[validation commands](lifecycle.md#validation-commands). The checkout does not
contain the old `tests.fakes` or `tests.packages` helpers; do not depend on them
when adding tests. The tutorial introduces no test framework or runtime
dependency.
