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

Run from `soup-packages/`. Choose an unused package name; the following example
uses `my_package`.

```sh
cp -R _template my_package
python - <<'PY'
import json
from pathlib import Path

folder = Path("my_package")
manifest_path = folder / "soup-package.json"
manifest = json.loads(manifest_path.read_text())
manifest.update(name="my_package", label="My package")
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

app_path = folder / "app/package.json"
app = json.loads(app_path.read_text())
app["name"] = "soup-pkg-my-package-app"
app_path.write_text(json.dumps(app, indent=2) + "\n")

for relative in ("server/text.py", "app/src/index.ts"):
    path = folder / relative
    text = path.read_text()
    text = text.replace("template.text", "my_package.text")
    text = text.replace("soup-template-text", "soup-my-package-text")
    path.write_text(text)
PY
npm install
npm run build:packages -- my_package
npm run pack -- my_package
```

`npm install` updates workspace links and the lockfile after adding the new
`app/package.json`. Keep that lockfile change for reproducible `npm ci` builds.
The Python command edits only the new copy. It leaves private class names alone;
those do not have to match the package name.

The important names now agree:

| Item                                                   | Value                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Directory and manifest `name`                          | `my_package`                                                                                               |
| npm workspace `name`                                   | `soup-pkg-my-package-app`                                                                                  |
| Produced/accepted object kind                          | `my_package.text`                                                                                          |
| Python `Visualizer.element` and registered browser tag | `soup-my-package-text`                                                                                     |
| Qualified contribution IDs                             | `my_package.text` (importer and visualizer, in separate registries), `my_package.stats_report` (operation) |

The template's `requires`, `requires_tools`, `provides_tools`,
`extension_points` and `python_dependencies` remain empty. If you later use
`<soup-table>` directly, add `soup_base` to `requires`; if you store files,
declare the storage tool and any public API imports as shown in the next
tutorial.

## 3. Understand the source files

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

Create a small text file, inspect/import it, open **Text**, request
**Statistics**, then run **Text statistics (report)**. Check that the report has
its parent and, when `soup_base` is active, renders its count/table/text blocks.
Delete the objects through SOUP and confirm there are no external files to clean
up.

For optional focused checks, see
[validation commands](lifecycle.md#validation-commands). The checkout does not
contain the old `tests.fakes` or `tests.packages` helpers; do not depend on them
when adding tests. The tutorial introduces no test framework or runtime
dependency.
