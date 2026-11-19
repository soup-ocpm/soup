# SOUP packages

Every SOUP feature is delivered through a **package**: a directory containing both backend functionality (importers, operations, visualizers, exporters, and tools) and frontend functionality (visualizer bundles). The packages in this directory are **bundled** with SOUP; additional packages can be installed at runtime from ZIP archives.

> **Security.** A package runs code with the privileges of the server (its `server/` component, running in the Flask process) and the browser (its `app/` component, loaded into the page). Install only packages you trust. For this reason, ZIP installation is disabled by default and must be enabled with `SOUP_ALLOW_PACKAGE_INSTALL=true` (the development `docker-compose.yaml` enables it).

## Writing a package

This guide builds a complete package called `records`. It imports `.jsonl` files (one JSON record per line), filters them with an operation, displays them with a visualizer, exports them as CSV, and adds a filter to EKG analyses. Each example uses only the core contracts (`soup.core.contracts`), tools declared in the manifest, and, for the filter, the public `api.py` of packages listed in `requires`.

### 1. Start from `_template`

```sh
cd soup-packages
cp -r _template records                 # the directory name is the package name
```

`records/soup-package.json`:

```json
{
  "name": "records",
  "version": "1.0.0",
  "api_version": "4.0",
  "label": "JSON Lines Records",
  "description": "Imports .jsonl files, filters, shows and exports their records.",
  "author": "Me",
  "requires": ["tool_storage", "ekg", "ekg_analysis"],
  "requires_tools": ["storage"],
  "provides_tools": [],
  "extension_points": [],
  "python_dependencies": [],
  "server": {"module": "server", "plugin": "plugin:Plugin"},
  "app": {"entry": "dist/index.js"}
}
```

In `records/app/package.json`, change `name` to `soup-pkg-records-app`. Then run `npm install` from the root of `soup-packages` to link the new workspace. Delete `server/text.py` and create the files below. The `ekg` and `ekg_analysis` dependencies are only needed for the filter in step 6; remove them from `requires` if you omit that filter.

### 2. Importer (`server/records.py`)

An importer creates an object. `inspect` proposes a preview and configurable fields; `preview` recalculates the preview with the selected options; `import_` returns the object's `meta` (the object already has an ID at this point); and `dispose` removes stored data when the object is deleted. The file remains in the `records` storage namespace. Errors are represented by domain exceptions (`ValidationError` → HTTP `400`).

```python
from __future__ import annotations

import csv
import io
import json
import uuid
from typing import Any, Mapping

from soup.core.contracts import (
    Exporter,
    Field,
    Importer,
    Inspection,
    NotFoundError,
    ObjectDraft,
    ObjectRef,
    Operation,
    OperationInput,
    Upload,
    ValidationError,
    Visualizer,
    report,
)

KIND = "records.jsonl"
STORAGE = "storage"
NAMESPACE = "records"


def parse(data: bytes) -> list[dict[str, Any]]:
    rows = []
    for number, line in enumerate(data.decode("utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValidationError(f"Line {number}: {error.msg}") from error
        if not isinstance(value, dict):
            raise ValidationError(f"Line {number}: a record must be a JSON object")
        rows.append(value)
    return rows


def columns_of(rows: list[dict[str, Any]]) -> list[str]:
    return sorted({key for row in rows for key in row})


def space(tools):
    return tools.get(STORAGE).space(NAMESPACE)


def load(obj: ObjectRef, tools) -> list[dict[str, Any]]:
    name = obj.meta.get("file")
    if not name:
        raise NotFoundError(f"Object '{obj.id}' has no stored file")
    return parse(space(tools).read(str(name)))


def dispose_file(obj: ObjectRef, tools) -> None:
    if obj.meta.get("file"):
        space(tools).delete(str(obj.meta["file"]))


class JsonLinesImporter(Importer):
    id = "jsonl"
    label = "JSON Lines Records"
    description = "One JSON record per line."
    extensions = (".jsonl",)
    produces = KIND
    requires_tools = (STORAGE,)

    def inspect(self, upload: Upload, tools) -> Inspection:
        rows = parse(upload.read())
        columns = columns_of(rows)
        first = report.table(columns, [[row.get(column) for column in columns] for row in rows[:10]], title="First records")
        key = Field("key", "Key", type="select", choices=tuple(columns), default=columns[0] if columns else None)
        return Inspection(preview=(first,), fields=(key,) if columns else ())

    def preview(self, upload: Upload, options: Mapping[str, Any], tools) -> list[dict[str, Any]]:
        return [report.keyvalue({"record": len(parse(upload.read())), "key": options.get("key")})]

    def import_(self, upload: Upload, obj: ObjectRef, options: Mapping[str, Any], tools) -> dict[str, Any]:
        data = upload.read()
        rows = parse(data)
        name = f"{obj.id}.jsonl"
        space(tools).write(name, data)
        return {"file": name, "count": len(rows), "columns": columns_of(rows), "key": options.get("key")}

    def dispose(self, obj: ObjectRef, tools) -> None:
        dispose_file(obj, tools)
```

### 3. Operation

An operation declares the objects it consumes (`inputs`, by kind) and the kinds it produces. `fields` builds the input form (here, options come from the source object), and `run` returns one or more `ObjectDraft` instances. The core creates objects with `created_by` set to the operation and `parents` set to the input objects, and calls `dispose` when one of the resulting objects is deleted.

```python
class FilterRecords(Operation):
    id = "filter"
    label = "Filter Records"
    description = "Keeps records whose field has the selected value."
    group = "Record"
    inputs = (OperationInput("records", (KIND,)),)
    produces = (KIND,)
    requires_tools = (STORAGE,)

    def fields(self, inputs: Mapping[str, ObjectRef], tools) -> list[Field]:
        source = inputs["records"]
        return [
            Field("name", "Name", required=True, default=f"{source.name} filtered"),
            Field("column", "Field", type="select", required=True, choices=tuple(source.meta.get("columns") or ())),
            Field("value", "Value", required=True),
        ]

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools) -> list[ObjectDraft]:
        source = inputs["records"]
        kept = [row for row in load(source, tools) if str(row.get(params["column"])) == params["value"]]
        # The draft has no ID yet: assign the file a new name.
        name = f"{uuid.uuid4().hex}.jsonl"
        space(tools).write(name, "\n".join(json.dumps(row) for row in kept).encode("utf-8"))
        meta = {"file": name, "count": len(kept), "columns": columns_of(kept), "key": source.meta.get("key")}
        return [ObjectDraft(params["name"], KIND, meta)]

    def dispose(self, obj: ObjectRef, tools) -> None:
        dispose_file(obj, tools)
```

### 4. Visualizer: server and Web Component

On the server, the visualizer provides the element tag, the initial `data`, and actions the element invokes using `context.action(name, params)`:

```python
PAGE = 50


class RecordsVisualizer(Visualizer):
    id = "table"
    label = "Record"
    accepts = (KIND,)
    element = "soup-pkg-records-table"
    requires_tools = (STORAGE,)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools) -> Any:
        rows = load(obj, tools)
        return {"columns": obj.meta.get("columns") or [], "rows": rows[:PAGE], "total": len(rows)}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools) -> Any:
        if name != "page":
            raise NotFoundError(f"Visualizer '{self.id}' has no action '{name}'")
        offset = params.get("offset", 0)
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
            raise ValidationError("'offset' must be a non-negative integer")
        return {"rows": load(obj, tools)[offset:offset + PAGE]}
```

In the browser, `app/src/index.ts` implements a custom element that imports only `@soup/sdk`, never host code. The host assigns `data` and `context` before inserting the element into the page, and the element communicates with the host only through `context` (or equivalent DOM events, such as `soup-notify` and `soup-thumbnail`). Always insert data text using `textContent`, never as markup.

```ts
import { defineSoupElement, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

interface RecordsData {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}

export class SoupPkgRecordsTable extends HTMLElement implements SoupVisualizerElement<RecordsData> {
  public data!: RecordsData;
  public context!: VisualizerContext;

  private readonly root = this.attachShadow({ mode: 'open' });
  private rows: Record<string, unknown>[] = [];

  public connectedCallback(): void {
    this.rows = [...this.data.rows];
    this.render();
    // Workspace thumbnail: an SVG built using numbers only.
    this.context.setThumbnail(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><text x="10" y="35">${Number(this.data.total)}</text></svg>`
    );
  }

  private render(): void {
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const column of this.data.columns) head.insertCell().textContent = column;
    const body = table.createTBody();
    for (const row of this.rows) {
      const line = body.insertRow();
      for (const column of this.data.columns) line.insertCell().textContent = String(row[column] ?? '');
    }
    const more = document.createElement('button');
    more.type = 'button';
    more.textContent = `More records (${this.rows.length} of ${this.data.total})`;
    more.disabled = this.rows.length >= this.data.total;
    more.addEventListener('click', () => void this.next());
    this.root.replaceChildren(table, more);
  }

  private async next(): Promise<void> {
    try {
      const page = await this.context.action<{ rows: Record<string, unknown>[] }>('page', { offset: this.rows.length });
      this.rows.push(...page.rows);
      this.render();
    } catch (error) {
      this.context.notify(error instanceof Error ? error.message : String(error), 'error');
    }
  }
}

defineSoupElement('soup-pkg-records-table', SoupPkgRecordsTable);
```

### 5. Exporter

```python
class RecordsCsv(Exporter):
    id = "csv"
    label = "Records as CSV"
    accepts = (KIND,)
    extension = ".csv"
    mime = "text/csv"
    requires_tools = (STORAGE,)

    def fields(self, obj: ObjectRef, tools) -> list[Field]:
        return [Field("header", "Header", type="bool", default=True)]

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools) -> bytes:
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=list(obj.meta.get("columns") or []), extrasaction="ignore")
        if params.get("header", True):
            writer.writeheader()
        writer.writerows(load(obj, tools))
        return out.getvalue().encode("utf-8")
```

`extension` and `mime` describe the default file type. If the extension or MIME type depends on the object (for example, when downloading an imported file unchanged), the exporter overrides the optional method `file_type(obj, params) -> (extension, mime)` (available since contract version `4.1`; the default returns `(self.extension, self.mime)`). `params` contains options already validated by `fields()`. The core names the file `<object name><extension>` and validates the result: the extension must start with `.` and contain 2–16 characters consisting of letters, digits, `.`, `-`, or `_`; the MIME type must follow `type/subtype` (without parameters such as `; charset=`). Invalid values never become filenames: the export returns HTTP `500`, naming the exporter and package, and logs the error.

The object exporter listing (`GET /api/v3/objects/<id>/exporters`, the **Export** menu) also displays the `extension` and `mime` returned by `file_type(obj, defaults)`, where `defaults` comes from the exporter's `fields`. If `file_type` raises an exception or returns invalid values, the listing displays the exporter's fixed values and logs a warning (without returning `500`). For example, the following JSON Lines exporter downloads the file using its originally imported extension, which the importer would have saved in `meta["extension"]`:

```python
class OriginalJsonLines(Exporter):
    id = "original"
    label = "Original File"
    accepts = (KIND,)
    extension = ".jsonl"
    mime = "application/jsonl"
    requires_tools = (STORAGE,)

    def file_type(self, obj: ObjectRef, params: Mapping[str, Any]) -> tuple[str, str]:
        return obj.meta.get("extension", self.extension), self.mime

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools) -> bytes:
        return space(tools).read(str(obj.meta["file"]))
```

A package overriding `file_type` declares `"api_version": "4.1"`; other packages can remain at `"4.0"`.

### 6. Analysis filter (`server/min_events.py`)

A filter contributed to `ekg.analysis_filters` (the `ekg_analysis` extension point) becomes an option in **New Analysis** and a key in configuration files. The Cypher query uses a fixed template: labels and relationship types go through `ident()`, and values are passed as parameters (`$entity`, `$minimum`), never interpolated from user input using an f-string.

```python
from __future__ import annotations

from typing import Any, Mapping

from soup.core.contracts import Field, ObjectRef, ValidationError
from soup_pkg_ekg.api import Query, ident
from soup_pkg_ekg_analysis.api import AnalysisFilter, FilterContext


class MinEventsFilter(AnalysisFilter):
    key = "minEvents"
    label = "Entities with Few Events"
    description = "Removes entities of the selected type connected to fewer than the minimum number of events."
    order = 700                       # after the six ekg_analysis filters (100-600)

    def fields(self, obj: ObjectRef, tools) -> list[Field]:
        return [
            Field("entity", "Entity Type", required=True),
            Field("minimum", "Minimum Events", type="number", required=True, default=2),
        ]

    def validate(self, spec: Any) -> dict[str, Any]:
        if not isinstance(spec, Mapping) or not str(spec.get("entity") or "").strip():
            raise ValidationError("minEvents: 'entity' is required")
        minimum = spec.get("minimum")
        if isinstance(minimum, bool) or not isinstance(minimum, int) or minimum < 1:
            raise ValidationError("minEvents: 'minimum' must be a positive integer")
        return {"entity": str(spec["entity"]).strip(), "minimum": minimum}

    def to_queries(self, spec: Mapping[str, Any], ctx: FilterContext) -> list[Query]:
        text = f"""
            MATCH (n:{ident("Entity")} {{Type: $entity}})
            OPTIONAL MATCH (e:{ident("Event")})-[:{ident("CORR")}]->(n)
            WITH n, count(e) AS events
            WHERE events < $minimum
            DETACH DELETE n"""
        return [Query(text, {"entity": spec["entity"], "minimum": spec["minimum"]})]
```

### 7. Registration (`server/plugin.py`)

The manifest provides the name, version, and dependencies; the plugin only registers its contributions:

```python
from __future__ import annotations

from soup.core.contracts import PluginContext, SoupPlugin
from soup_pkg_ekg_analysis.api import ANALYSIS_FILTERS_POINT

from .min_events import MinEventsFilter
from .records import FilterRecords, JsonLinesImporter, RecordsCsv, RecordsVisualizer


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.add_importer(JsonLinesImporter())
        ctx.add_operation(FilterRecords())
        ctx.add_visualizer(RecordsVisualizer())
        ctx.add_exporter(RecordsCsv())
        item = MinEventsFilter()
        ctx.contribute(ANALYSIS_FILTERS_POINT, item, key=item.key, order=item.order)
```

The core registers these contributions as `records.jsonl`, `records.filter`, `records.table`, and `records.csv`. A contribution whose `requires_tools` requests a tool missing from the manifest, or which calls `tools.get(...)` for an undeclared tool, fails with `ToolNotDeclaredError`. Boundary tests (`soup-server/tests/test_architecture_boundaries.py`) also statically check the tools, `requires`, and `python_dependencies` of each bundled package.

### 8. Tests, build, ZIP, and installation

```sh
# Python tests in records/tests/ (collected by soup-server/pytest.ini), using
# tests.fakes (FakeDatabase, in-memory storage): no Docker or Memgraph
cd soup-server && python -m pytest ../soup-packages/records/tests

cd ../soup-packages
npm run lint && npm test                 # eslint and vitest (jsdom) in */app/test/
npm run build:packages -- records        # type check + esbuild -> records/app/dist/index.js
npm run pack -- records                  # dist/records-1.0.0.zip: manifest, server/, app/dist/
```

Install the ZIP from the interface's **/packages** page (ZIP upload), or run `curl -F file=@dist/records-1.0.0.zip http://localhost:8080/api/v3/packages`. The server must have `SOUP_ALLOW_PACKAGE_INSTALL=true`. The package loads immediately: the importer appears at **/import** for `.jsonl` files; the operation appears in the Actions panel for `records.jsonl` objects; the visualizer and exporter appear on the object page `/o/:id`; and the filter appears among the New Analysis options.

## Structure

```
soup-packages/<name>/
  soup-package.json      manifest (required)
  server/                package Python module
    __init__.py          required
    plugin.py            the SoupPlugin class named in the manifest
    api.py               public API for other packages
  app/                   frontend (optional)
    package.json         npm workspace with dependencies (at least @soup/sdk)
    tsconfig.json
    src/index.ts         defines visualizer Web Components
    dist/index.js        bundle generated by `npm run build:packages`
```

The directory must have the same name as the package.

## Manifest: `soup-package.json`

```json
{
  "name": "csv_ekg",
  "version": "1.0.0",
  "api_version": "4.0",
  "label": "CSV as Event Log (EKG)",
  "description": "Imports CSV files as event logs and builds their EKG on Memgraph.",
  "author": "SOUP",
  "requires": ["ekg", "soup_base", "csv_table"],
  "requires_tools": ["memgraph", "storage"],
  "provides_tools": [],
  "extension_points": [],
  "python_dependencies": ["pandas>=2.2", "numpy>=2"],
  "server": {"module": "server", "plugin": "plugin:Plugin"},
  "app": {"entry": "dist/index.js"}
}
```

| Field | Meaning |
|---|---|
| `name` | Lowercase letters, digits, and `_`; must begin with a letter (not `""`, `..`, separators, or an initial `_`). Also becomes the Python module name `soup_pkg_<name>`. |
| `version` | PEP 440 version (`1.0.0`). Used for upgrades. |
| `api_version` | Version of the core contracts targeted by the package, `"MAJOR.MINOR"`. Compatible if the major version matches the host's `CONTRACTS_API_VERSION` and the minor version is less than or equal to the host's. The current host, `"4.1"`, accepts `"4.0"` and `"4.1"` and rejects `"4.2"`, `"3.x"`, and `"5.0"` (see **Contract versions** below). |
| `label`, `description`, `author` | User-facing text; `label` defaults to `name` if absent. |
| `requires` | Packages that must be active before this package. |
| `requires_tools` | Tools used (catalog, Memgraph, storage, preferences, etc.). A package cannot use an undeclared tool. |
| `provides_tools` | Tools the package adds through `ctx.add_tool`. Registering an undeclared tool is an error. |
| `extension_points` | Extension points opened through `ctx.add_extension_point` (e.g. `"ekg.build_steps"`). Opening an undeclared point is an error. |
| `python_dependencies` | PEP 508 requirements (`"pandas>=2"`). These are **checked, never installed**: if a library is missing or has an incompatible version, the package is excluded with an explanatory message. Libraries must be added to the server image (`soup-server/requirements.txt`). |
| `server.module` | Python module directory relative to the package (usually `server`). |
| `server.plugin` | `"module:Attribute"` inside `server.module`: a `SoupPlugin` subclass (or instance). |
| `app.entry` | Optional frontend bundle path relative to `app/`, inside `app/dist/` (e.g. `dist/index.js`). Only `app/dist` is served to the browser. |

### Contract versions

| Version | Commit | Change |
|---|---|---|
| `"3.0"` | 8 | Removed `add_input_reader`, `add_input_handler`, and `add_build_step` from `PluginContext`: the event log and EKG now belong to the `ekg` package, and build steps are contributed to `ekg.build_steps`. Packages using `"2.x"` must be updated. |
| `"3.1"` | 10 | Added optional `Exporter.applies(obj, tools) -> bool` (defaults to `True`): an exporter is offered only for applicable objects of accepted kinds. An inapplicable exporter is omitted from the listing and requests to it return `404`, as for an unknown exporter. If `applies` raises an exception, the exporter is excluded and the error is logged with the package name. Packages targeting `"3.0"` load unchanged; `"3.1"` is only needed when using `applies` (e.g. `ekg_analysis`). |
| `"4.0"` | 11 | Removed `Query`, `ident`, and `GraphDatabase` from `soup.core.contracts`: the core does not know Cypher. These now live in `soup_pkg_tool_memgraph.api` (re-exported by `soup_pkg_ekg.api`) and require the corresponding package in `requires`. Packages targeting `"3.x"` must update the import and `api_version`. |
| `"4.1"` | 12 | Added optional `Exporter.file_type(obj, params) -> (extension, mime)` (defaulting to the exporter's fixed `extension` and `mime`): exported file types may depend on the object; `ExportRouter` validates the result (an invalid result produces a package-attributed `500`). Packages targeting `"4.0"` still load unchanged; only users of `file_type` declare `"4.1"` (`text`, `csv_table`, `ocel`). |

Visualizers and operations are still filtered only by object kind.

The manifest is the **source of truth**: the name, version, `api_version`, `requires`, `requires_tools`, `provides_tools`, and `extension_points` are set on the plugin instance and therefore do not need to be repeated in the plugin class:

```python
from soup.core.contracts import PluginContext, SoupPlugin

from .contributions import CsvEkgImporter, TableToEkg


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.add_importer(CsvEkgImporter())
        ctx.add_operation(TableToEkg())
```

## Contribution names

- Importers, operations, visualizers, and exporters have IDs that need to be unique **only within their package**. The core registers each contribution under `"<package>.<id>"` (e.g. `csv_ekg.csv`), and this full key is used by routers, APIs, and object `created_by.contributor_id`. Two packages can therefore both expose a `csv` importer: both are offered for a `.csv` file and the user chooses which one to use.
- Tools and extension points, by contrast, have **global names**, because they serve multiple packages (`memgraph`, `storage`, `ekg.build_steps`). They must be declared in the manifest, and two active packages cannot declare the same name. Conflicts are detected before importing any code, and both packages are named in the error; whichever was loaded first (or was already active) retains the name.

## Bundled packages

| Package | Contents |
|---|---|
| `tool_memgraph`, `tool_storage` | The tools (see below). |
| `soup_base` | **Report** visualizer (kind `report`), **Report as JSON** exporter, server-side `ParsedCache` (`soup_pkg_soup_base.api`: an LRU cache of already-parsed content, used by `text`, `csv_table`, and `ocel`), and reusable elements `soup-text`, `soup-markdown`, `soup-image`, `soup-table`, `soup-chart`, `soup-keyvalue`, `soup-file-link`, `soup-error`, `soup-report-view`, and `soup-graph-view`. It also renders import previews. Packages using these elements declare `requires: ["soup_base"]`. API: [soup_base/README.md](soup_base/README.md). |
| `text` | **Text** importer (`.txt`, `.md`, `.log`, kind `text`): the file is stored unchanged in the `text` storage namespace; `meta` contains its size, line count, and encoding (UTF-8, otherwise Latin-1). **Text** visualizer (`<soup-pkg-text-viewer>`): uses `<soup-text>` or `<soup-markdown>` for `.md`; supports fetching line blocks with the `lines` action `{from, count}` and searching the entire file with `search` `{query}`. `meta` also stores the original extension (`extension`: `.txt`, `.md`, `.log`). **Original File** exporter: `Exporter.file_type` downloads `<name>.md`, `<name>.log`, or `<name>.txt` with the file's MIME type (`text/markdown` for `.md`, `text/plain` otherwise). For previously imported objects lacking `meta.extension`, the extension comes from `meta.filename` (or `format: "markdown"`), falling back to `.txt`. `api_version: "4.1"`. |
| `csv_table` | **CSV as Table** importer (`.csv`, `.tsv`, kind `table`, `csv` module): delimiter (`comma`, `semicolon`, `tab`) and header detection proposed by `csv.Sniffer`; the table is stored as canonical CSV in the `csv_table` namespace. **CSV Table** visualizer (`<soup-pkg-csv-table-viewer>`, server-side pagination via `page` `{offset, limit, sort: {column, direction}, filter: [{column, value}], search}`, column indices, sorting, and per-column filtering) and **Column Profile** (`<soup-pkg-csv-profile>`, distinct values, empty cells, examples, and a `distribution` chart `{column, top}`). **Column Distribution** operation (`table` → `report` containing a bar chart and table). **CSV** exporter with selectable delimiter and header: using tabs produces `<name>.tsv` (`text/tab-separated-values`), otherwise `<name>.csv` (`text/csv`); when no delimiter is selected, the import delimiter is reused (`file_type`, `api_version: "4.1"`). |
| `ekg` | Server only. Event-log handling (`Table` and pandas conversions, flat or separated `EventLogData`, `ColumnMapping`, `EventLog` with normalization, milliseconds, entities, and canonical CSV files); datasets on the volume (`/soup/<name>/<name>.csv`, `_entity.csv`, `_config.json`, `Analyses/`); and Memgraph-backed EKGs: build steps 100–500, the `ekg.build_steps` extension point, graph state for `ekg` objects (`ensure_loaded`, `ekg.state_providers`), events `ekg.before_reset` and `ekg.built`, and the **Load into Memgraph** operation. At startup, it adds existing datasets found on the volume to the catalog. See below. |
| `csv_ekg` | **CSV as Event Log (EKG on Memgraph)** importer (`.csv`, kind `ekg`): preview; fields `event_id`, `timestamp`, `activity`, `entities`, `values`, `trigger_target`, `save_process_times`; and, when at least two entity columns are present, a multiplicity graph (1-to-1, 1-to-N, N-to-1, N-to-N). **Convert to EKG** operation (a `csv_table` `table` → child `ekg`). |
| `causal_df` | Causal `:DF` build step for trigger/target pairs, contributed to `ekg.build_steps` with order 450. |
| `ekg_views` | **Graph** (`<soup-pkg-ekg-graph>`), **Statistics** (`<soup-pkg-ekg-stats>`), and **Queries** (`<soup-pkg-ekg-queries>`) visualizers and **Graph JSON** exporter for kind `ekg` (Queries and JSON also support `ekg_class` while `ekg_class_graph` contributes to them). Extension points `ekg.graph_views`, `ekg.queries`, `ekg.json_parts`, and `ekg.stats_notices`. See below. |
| `ekg_analysis` | Analyses as operations on `ekg` objects: **New Analysis**, **Import Analysis Configuration**, **Example Configuration**, `ekg.analysis_filters` with the six filters from the previous codebase, compensating rollback, event `analysis.before_apply`, **Process Insights** visualizer (`<soup-pkg-ekg-insights>`), and **Analysis Configuration** exporter. At startup, existing analyses on the volume are added to the catalog. See below. |
| `ocel` | **OCEL 2.0** JSON files (`.json`, `.jsonocel`) with two user-selectable importers: **OCEL 2.0 as Tables** (kind `ocel_tables`, standard library and `storage` tool only) and **OCEL 2.0 as EKG on Memgraph** (kind `ekg`, through `ekg.build_ekg`). **OCEL Tables** and **OCEL Summary** visualizers, **Decompose into EKG** operation, **OCEL 2.0 JSON** exporter. In the EKG, qualifiers on `:CORR` and object-to-object relationships as `:REL`, provided by a build step contributed to `ekg.build_steps` (order 420). See below. |
| `ekg_class_graph` | Aggregated graph: **Build Aggregated Graph** operation (`ekg` → `ekg_class`), **Aggregated Graph** (`<soup-pkg-ekg-class-graph>`) and **Aggregated Graph Statistics** (`<soup-pkg-ekg-class-stats>`) visualizers, the `class` view, class queries and JSON parts. Removes its own nodes before a graph reset or analysis (Observer). See below. |

`text` and `csv_table` use only Python's standard library and the `storage` tool (`requires: ["soup_base", "tool_storage"]`, `requires_tools: ["storage"]`, no pandas or Memgraph). They demonstrate packages that keep their own data in a storage namespace, reread that data when visualizer actions are invoked, and remove it in `dispose`.

To avoid rereading the file for every page, sort, filter, or line block (with `DockerVolumeStorage`, each read copies the file out of the container), both packages maintain an in-memory cache of parsed content (decoded lines in `text`, columns and rows in `csv_table`). They use `ParsedCache` from `soup_base` (`soup_base/server/cache.py`, exported through `soup_pkg_soup_base.api`). The cache is keyed by object ID, is LRU-bounded by object count and estimated size, is thread-safe, is created by `Plugin.register()`, and is shared by the package's contributions. There is no module-level global state; disabling and re-enabling the package starts with an empty cache (`on_shutdown` clears it). `dispose` and file writes invalidate the object. Files estimated to exceed the size limit are never cached and are read again on every request.

Configuration variables are `SOUP_TEXT_CACHE_OBJECTS`, `SOUP_TEXT_CACHE_MB`, `SOUP_CSV_TABLE_CACHE_OBJECTS`, and `SOUP_CSV_TABLE_CACHE_MB` (defaults: 8 objects and 200 MB per package). A value that is not a positive integer causes package loading to fail with an explanatory message. Each package's `api.py` exposes its contributions and cache. **Note for `select` fields:** the core treats whitespace-only values (such as `"\t"`) as empty, so `csv_table` names its delimiters `comma`, `semicolon`, and `tab`.

## Bundled tools

Memgraph, files, the object catalog, and preferences are not part of the core: they are supplied by two tool-only packages (no `app/` component), activated by default like every discovered package. Packages declare the tools they use in `requires_tools` and retrieve them through `ctx.tools` (or the `tools` argument passed to importers, operations, visualizers, and exporters). Requesting an undeclared tool raises `ToolNotDeclaredError`. To import types such as `MemgraphTool`, `Query`, or `StorageTool`, a package imports the providing package's `api.py`, and must therefore also list that package under `requires`. The server can still start without one of these tool packages: the package report identifies the missing tool and services requiring it return `503`.

| Package | Tool | Capabilities | Environment variables |
|---|---|---|---|
| `tool_memgraph` | `memgraph` | `run(query) -> list[dict]`, `health()`; active graph: `ensure_loaded(state_key, loader, force=False)`, `advance(from_state, to_state, mutate)`, `current_state()`, `clear()`, `invalidate()`. A single driver per process, created on first use and closed when the package stops. | `MEMGRAPH_HOST` (`memgraph`), `MEMGRAPH_PORT` (`7687`) |
| `tool_storage` | `storage` | `space(namespace)` → relative `read`, `write`, `exists`, `delete`, `list` within `<root>/<namespace>/`, and `subspace(name)` for a directory within it; `path_for(namespace, name)`; `delete_space(namespace)`; `namespaces()` lists root entries with valid names. | `SOUP_STORAGE_KIND` (`docker` or `local`; `local` in the development `docker-compose.yaml`, on a volume also mounted by Memgraph), `SOUP_CONTAINER_NAME` (`soup-database`), `SOUP_LOCAL_STORAGE_ROOT` (`/soup`) |
| `tool_storage` | `catalog` | Workspace objects at `<root>/_catalog/objects/<id>.json`, SVG thumbnails at `<root>/_catalog/thumbnails/<id>.svg`, and `children(id)` for provenance. | Same as above |
| `tool_storage` | `preferences` | JSON key/value pairs in `<root>/_catalog/preferences.json`. | Same as above |

- **Active graph.** Memgraph contains only one dataset at a time. Code querying an object calls `ensure_loaded(state_key, loader)`. If the loaded state differs from `state_key` (an opaque caller-selected string, e.g. the object ID), or `force=True`, the tool clears the database and invokes `loader(run)`; otherwise it does nothing. If the loader fails, no state remains active and the next request reloads.
- **In-place changes.** `advance(from_state, to_state, mutate)` modifies the loaded graph without rebuilding it (for example, analyzing the already-loaded parent graph). Under the same lock used for loading, it raises `ConflictError` without executing anything if the current state is not `from_state`; otherwise it runs `mutate(run)` and updates the state to `to_state`. If `mutate` fails, the state becomes unknown (`None`) and the next request reloads.
- **Namespaces.** Each package uses its own namespace (`storage.space("<name>")`). Namespace and filename validation follows object naming rules (no `""`, `..`, separators, or initial `_`), making `_catalog` inaccessible. `path_for` returns the absolute path to pass to Memgraph: `LOAD CSV` reads the shared `/soup` volume. An EKG dataset directory remains `/soup/<name>/`.
- **Cypher.** `Query`, `ident`, and the `GraphDatabase` port live in `soup_pkg_tool_memgraph.api` (re-exported through `soup_pkg_ekg.api`). Always pass values as parameters, identifiers through `ident()`, operators from closed allowlists, and `LIMIT` via `$limit`.

## EKG: the `ekg` package

An object of kind `ekg` represents a graph on Memgraph. A **root** object's `meta` (from an import or conversion) contains `dataset` (the volume directory), `graph_key` (the `memgraph` tool state when that graph is loaded, a UUID generated by `build_ekg` or adoption), `columns`, `mapping` (`event_id`, `timestamp`, `activity`, `entities`, `values`), `trigger_target`, `counts`, `process_info` (the same structure as the previous configuration format), `date_created`, and `source_format`.

A **derived** object (e.g. an analysis) has kind `ekg`, includes the source `ekg` object among its `parents`, and records `meta.state = {provider, spec}`. Here `provider` is the key of a `StateProvider` contributed to `ekg.state_providers`, which can apply `spec` to the parent's graph. A derived object may have a different kind (the aggregated graph uses `ekg_class`); only `meta.state` matters. Its parent is the first entry in `parents` that is an `ekg` or is itself derived, and the chain always ends at an EKG root with its own dataset. Derived objects created through an operation using `derive_state` also have `meta.graph_key`.

The API (`soup_pkg_ekg.api`, available to packages listing `ekg` in `requires`; callers pass their own `tools`: `build_ekg` requires `memgraph` and `storage`, while `ensure_loaded`, `derive_state`, and `dispose` only require `memgraph`, as dataset files are read through the `ekg` package's storage):

| Name | Description |
|---|---|
| `build_ekg(obj, data, mapping, tools, *, dataset, description, all_columns, trigger_target, source_format, save_process_times, extra_files)` | Normalizes `data` (`EventLogData`), stores the dataset (in `dataset`, or a unique name based on the object name with `_2`, `_3`, etc.), builds the EKG, and returns `meta`. `extra_files` (`{name: content}`) are caller-supplied files stored within the dataset (`<dataset>_<name>`) and listed under `extra_files` in its config for use by build steps; without these, the dataset remains as before. The `memgraph` state becomes a new key returned in `meta.graph_key`, even when building from an `ObjectDraft` (which does not yet have an ID): opening the object for the first time does not rebuild. If construction fails, files are removed. |
| `ensure_loaded(obj, tools, force=False)` | The object's state is `meta.graph_key`, or its ID if no key exists (old or adopted objects; see `graph_key_of(obj)`). If this is not the active state (or if `force` is set), emits `ekg.before_reset`, rebuilds the root dataset by following `parents`, reapplies derived states up to `obj` in order, saves counts and timings to the configuration, and reinstates the same key. Returns `True` if it rebuilt. |
| `derive_state(parent, mutate, tools)` | Compensating action (C26) for a new derived object: calls `ensure_loaded(parent)`, creates a new key, then calls `memgraph.advance(parent_key, new_key, mutate)`; returns the key for the draft's `meta.graph_key` (so its first opening does not rebuild). If `mutate` fails, the parent's graph is rebuilt (restoring the parent's key) and the exception is propagated; an `advance` `ConflictError` (another graph was loaded concurrently) propagates without rebuilding. |
| `dispose(obj, tools)` | If `obj` is active, emits `ekg.before_reset` and clears the graph; for a root, removes its dataset directory. |
| `root_of(obj)`, `new_graph_key()`, `DatasetRepository`, `StorageSpaceTool` | Retrieve an object's root `ekg`; generate a new key; manage dataset files including `Analyses/<name>.json` (`analyses`, `save_analysis`, `load_analysis`, `delete_analysis`) and additional files (`has_extra_file`, `extra_file_load_path`) through `storage` (`StorageSpaceTool` is the `Protocol` used by these interfaces). |
| `BUILD_STEPS_POINT` (`"ekg.build_steps"`) | Contributed `EkgBuildStep` objects (`key`, `order`, `phase`, `applies(ctx)`, `execute(ctx, db)`), registered using `ctx.contribute(BUILD_STEPS_POINT, step, key=step.key, order=step.order)`. Built-in steps: 100 events, 200 entities, 300 indexes, 400 `:CORR`, 500 `:DF` (skipping types in `ctx.df_handled_types`). Other contributions: 420 `ocel`, 450 `causal_df`. Every order must differ (see `soup-server/tests/test_build_step_orders.py`). `phase` (`event`, `entity`, `corr`, `df`) determines which `process_info` timing receives the step. `ctx.extra_files` exposes named additional dataset files and their paths for `LOAD CSV` via `load_csv_clause(path)`, both on initial build and rebuild. `normalize_text` normalizes graph names and values. |
| `STATE_PROVIDERS_POINT` (`"ekg.state_providers"`) | `StateProvider` with `key` and `apply(spec, db)`. |
| `EKG_BEFORE_RESET`, `EKG_BUILT` | `"ekg.before_reset"` payload `{object, active, reason: build\|load\|dispose}` before clearing or rebuilding; `"ekg.built"` payload `{object, dataset, counts}` after a build. |
| `EKG_KIND`, `EventLogData`, `Table`, `ColumnMapping`, `EventLog`, `from_dataframe`, `to_dataframe`, `GraphDatabase`, `Query`, `ident` | Other public API symbols. |

At startup, the package adds to the catalog any `/soup/<name>/` directory containing `<name>_config.json` not already represented by a catalog object with the same `meta.dataset`. These are imported as `ekg` objects created by `csv_ekg.csv`, with metadata read from the configuration. Errors (e.g. inaccessible storage) are logged and do not stop the package.

## EKG views: the `ekg_views` package

`requires: ["ekg", "soup_base"]`, `requires_tools: ["memgraph", "storage"]`. Each visualizer and exporter first calls `ensure_loaded(obj, tools)` from `ekg`, then reads the graph using `Query` objects only. Node labels and relationship types are part of query patterns (`MATCH (n:`Event`)`, `[r:`DF`|`CORR`]`), quoted with `ident()` and drawn exclusively from closed sets of views, queries, and parts. User selections are checked against those sets (otherwise `400`). Text, IDs, offsets, and `LIMIT` remain parameterized (`$limit`, never embedded in the query text). Details and manual Memgraph verification: [ekg_views/README.md](ekg_views/README.md).

| Contribution | Description |
|---|---|
| **Graph** (`ekg_views.graph`) | Toolbar for selecting a view (from `ekg.graph_views` contributed by any package), result limit (initially 200, at most `SOUP_EKG_VIEWS_MAX_LIMIT`, default 2000; an invalid non-positive-integer setting prevents package loading), the view's relationship types, and node shapes. Rendered by `<soup-graph-view>` from `soup_base`. Built-in views: **Standard Graph** (`standard`) and **Object Graph** (`object`: `:REL` between entities, qualifier color and checkbox, and `:CORR` with qualifiers; empty if the graph has no `:REL`). Actions: `graph` `{view, limit, relations}` → `{view, limit, relations, max_data, graph}`; `search` `{view, text, kind: node\|edge, offset, relations, label?}` → `{items, total}` (50-item pages, incremental search within `<soup-graph-view>`); `node` `{view, id}` → node properties. The first rendering emits `soup-thumbnail` (workspace preview); **Export SVG** saves `<name>.svg` through `context.download`. |
| **Statistics** (`ekg_views.stats`) | Counts, earliest and latest timestamps, distinct activities, entity types with counts of events containing null, `"nan"`, or empty values (warning `"N nodes have NaN values."`), CSV columns and their roles from import (event ID, timestamp, activity, entity, value, or unused), pie charts for graph composition (Event, Entity, CORR, DF) and build-phase timings (seconds from `meta.process_info`; hidden if timings were not saved during import). Displays `meta.notice` and notices contributed to `ekg.stats_notices` above the data. |
| **Queries** (`ekg_views.queries`) | `GraphQuery` contributions from `ekg.queries` provided by any package, grouped by `group`, with an input form for each query. Action `query` `{key, params}` → `{key, label, blocks}`, rendered with `<soup-report-view>`. The 21 built-in queries cover all read operations of the previous interface: event and entity nodes; an entity by type; entities of a given type; events of an activity; CORR, DF, and type-specific DF relationships; counts of `:REL` and `:CORR` per qualifier; counts of events, entities, CORR, DF, all nodes; distinct activities and their frequencies; entity keys and entities by type; null values; first and last timestamps; and the maximum number of displayable elements. |
| **Graph JSON** (`ekg_views.json`) | `parts` multiselect from `ekg.json_parts`. Produces `{<part label>: data}` in the previous JSON export format: `Event nodes` and `Entity nodes` (node properties), `CORR relationships` `{corr_data: [{event, relation_type, related_event, relation_id}], corr_count}`, `DF relationships` `{df_data, df_count}`, `REL relationships` `{rel_data: [{source, relation_type, qualifier, target, relation_id}], rel_count}`. |

Extension points (`soup_pkg_ekg_views.api`, available when `ekg_views` is listed in `requires`; contributions use `ctx.contribute(POINT, item, key=item.key)`):

| Point | Contract | Base implementations |
|---|---|---|
| `GRAPH_VIEWS_POINT` (`"ekg.graph_views"`) | `GraphView`: `key`, `label`, `relationship_types`, `default_relations`, `node_labels`, `edges_query(limit, relations) -> Query`, `to_graph(records) -> {nodes, edges, directed}`; optional `search_query`, `search_count_query`, `search_items`, `node_query`, `to_node`, `max_data_query`. | `EdgeListGraphView` (Template Method): `relationships` mapping `{type: (source label, target label)}`, a closed set determining `relationship_types` and `node_labels`; hooks `node_label`, `node_group`, `edge_type`, `edge_label`; automatically generates queries. `StandardGraphView` (`standard`): Event and Entity, CORR and DF (DF only by default), groups = `Event` or entity type. `ObjectGraphView` (`object`): REL between Entity nodes and CORR (REL only by default). |
| `QUERIES_POINT` (`"ekg.queries"`) | `GraphQuery`: `key`, `label`, `group`, `fields`, `build(params) -> Query`, `transform(records, params) -> [block]`. `values(raw)` validates params against `fields` and caps `limit` at `max_limit` (1000). | `CountQuery` (key-value block, always reads `count`), `NodeListQuery` (paginated table with `total`), `RelationshipListQuery`; `where` and `filter_params` narrow the results. |
| `JSON_PARTS_POINT` (`"ekg.json_parts"`) | `JsonPart`: `key`, `label` (the JSON key), `query() -> Query`, `transform(records)`. | `NodesPart`, `RelationshipsPart`, `RelPart`. |
| `STATS_NOTICES_POINT` (`"ekg.stats_notices"`) | `StatsNotice`: `key`, `notice(obj, tools) -> str \| None`, a **Statistics** notice for `obj` (or none). | — |

Each contribution declares which object kinds it applies to through `kinds` (default `("ekg",)`). The `ekg_views` contributions declare `STANDARD_KINDS = ("ekg", "ekg_class")`, because the graph for an `ekg_class` also includes its parent's EKG. **Graph** and **Statistics** accept only `ekg`, and Graph displays views whose `kinds` includes `ekg`. **Queries** and **Graph JSON** accept `ekg` plus any other kind that has at least one *dedicated* contribution (`kinds` excluding `ekg`): with `ekg_class_graph` active, this includes `ekg_class`; otherwise it does not. For each object, they display only contributions whose `kinds` contains the object's kind. The `data()` methods of Graph, Statistics, and Queries provide `notice`, the object's `meta.notice` (e.g. "The analysis did not modify the graph"), rendered in a notice panel. `GraphVisualizer` is exported through the API for visualizers of other kinds with their own custom elements (e.g. **Aggregated Graph**).

Contributions are refreshed on every request: enabling or disabling a package at runtime immediately adds or removes its views, queries, and parts.

## Analyses: the `ekg_analysis` package

`requires: ["ekg", "ekg_views", "soup_base"]`, `requires_tools: ["memgraph", "storage", "catalog"]` (the catalog is required to adopt analyses already stored on the volume), `api_version: "4.0"` (uses `Exporter.applies`, available since `"3.1"`).

An analysis is a **derived** `ekg` object: `parents` contains the starting `ekg` object; `meta.state` is `{provider: "analysis", spec: {name, description, filters: {filter key: [condition, ...]}}}` (the generic C29 model); `meta.graph_key` identifies its graph state; `meta.analysis` is `{dataset, name}` (the file); `meta.counts` is `{before, after}` (nodes and relationships); and `meta.result` is `"changed"` or `"unchanged"`.

Its configuration is also stored at `/soup/<dataset>/Analyses/<name>.json` in the previous format (always including `timestamp`, `performance`, `includeActivities`, `excludeActivities`, `frequence`, and `variant`, plus `dataset_name`, `analysis_name`, and `analysis_description`). Therefore, analyses saved by the previous interface and those created by the new interface use the same file structure.

| Contribution | Description |
|---|---|
| **New Analysis** (`ekg_analysis.new`, `ekg` → `ekg`) | `name`, `description`, and `filters` fields (`items` type, with an option for every `AnalysisFilter` contributed to `ekg.analysis_filters` by any package). Fields and choices are derived from the object's graph: entity types, activities, and earliest/latest timestamps. Filters are applied in filter `order`, not in the order of the submitted list; this matters because the order can affect the result. |
| **Import Analysis Configuration** (`ekg_analysis.import`) | Fields `name` and `file` (JSON in the previous format). Validates each filter individually (e.g. `performance[1]: seconds ...`); an unknown key produces `400`. Then proceeds as New Analysis. |
| **Example Configuration** (`ekg_analysis.example`, `ekg` → `report`) | Markdown explaining each configuration key and a generated `analysis_example.json` file block based on the object (replacing `getExampleJSON` and `help/file_configuration_example.json`); the example can be imported unchanged. |
| **Process Insights** (`<soup-pkg-ekg-insights>`, kind `ekg`) | Entity types and activity frequencies; for each entity type, mean trace duration, activity occurrences, and variants with their mean durations. Actions: `entity` `{entity}` (must be a graph entity type, otherwise `400`) and `frequency` `{min}`. |
| **Analysis Configuration** exporter (`.json`) | Available only for analysis objects (`applies`); exports the previous-format configuration file. |

`AnalysisService` (Compensating Action, C26) checks for a duplicate name (`409`), saves the file, then calls `ekg.derive_state` on the loaded parent's graph. It counts nodes and relationships, emits `analysis.before_apply` (`{object, analysis, spec}`, declared in `soup_pkg_ekg_analysis.api`; subscribers register as critical), applies filters, and counts again. If any step fails, no object is created, the file is deleted, and the parent's graph is rebuilt. If the graph does not change, an object is still created with `meta.result: "unchanged"` and `meta.notice`; the file is retained (as in the previous "Nothing changed" behavior). After another graph has been opened, the `analysis` `StateProvider` reapplies the filters to the reconstructed parent using the same `meta.graph_key`. Deleting an analysis also deletes its configuration file.

Filters (Command, C25) implement `AnalysisFilter`: `key`, `label`, `description`, `order`, `fields(obj, tools)`, `validate(spec)`, and `to_queries(spec, ctx) -> list[Query]` (`ctx` is a `FilterContext` providing `run` and `activities()`). `EntityConditionFilter` is the base class for an entity-type/operator/value condition. Six filters are contributed in the same order as the former `process_analysis`: `timestamp` (100), `performance` (200), `includeActivities` (300), `excludeActivities` (400), `frequence` (500), and `variant` (600). Cypher query text is fixed; labels and relationship types use `ident()`, operators come from the closed `OPERATORS` list (`<`, `<=`, `=`, `!=` translated to `<>`, `>`, `>=`), and all values are parameters. Another package can add a filter with `ctx.contribute(ANALYSIS_FILTERS_POINT, item, key=item.key, order=item.order)`, making it available as a New Analysis option and a configuration-file key.

At startup, every `Analyses/<name>.json` found in a cataloged dataset and not already represented by an object becomes a derived `ekg` object beneath its root (created by `ekg_analysis.new`, without a graph key; its first opening reconstructs the graph). An unreadable file or invalid name is logged.

An analysis performed on another analysis becomes its child; its file also includes `"based_on": "<parent>"`. Adoption respects this dependency order (parents first). If a parent is missing or a cycle exists, the analysis is adopted under the root with `meta.warning` and a log warning. Details, a Memgraph smoke test (`tests/memgraph_smoke.py`), and manual verification are documented in [ekg_analysis/README.md](ekg_analysis/README.md).

## Aggregated graph: the `ekg_class_graph` package

`requires: ["ekg", "ekg_views", "soup_base"]`, `requires_tools: ["memgraph"]`.

**Build Aggregated Graph** (`ekg_class_graph.build`, `ekg` → `ekg_class`) provides `name` and `entity_types` fields (a multiselect of graph entity types, formerly `filtered_columns`; types with null-valued events trigger a `"N nodes have NaN values."` warning from `NullEntities` in `ekg_views`). Using `ekg.derive_state`, it builds `:Class` nodes (one per distinct combination of the selected type values, weighted by `Count`), `:OBSERVED` relationships from events, and `:DF_C` relationships between classes.

The `ekg_class` object is derived: `meta.state` is `{provider: "ekg_class_graph.classes", spec: {entity_types}}`, `parents` includes its `ekg` source, `meta.graph_key` stores its graph key, `meta.counts` stores `class_nodes`, `obs_rel`, and `dfc_rel`, and `meta.process_info` stores phase timings. `ekg.ensure_loaded` rebuilds the parent and reapplies the class construction through the package's `StateProvider`.

| Contribution | Description |
|---|---|
| **Aggregated Graph** (`<soup-pkg-ekg-class-graph>`) | Uses the `GraphVisualizer` from `ekg_views` on views applicable to `ekg_class`: the `class` view first (`DF_C` by default, optionally `OBSERVED`), then the standard view. Actions: `graph`, `search`, `node`. |
| **Aggregated Graph Statistics** (`<soup-pkg-ekg-class-stats>`) | Counts, entity types, and the previous interface's two pie charts (Class Nodes/OBS/DF_C and phase durations in seconds). |
| `ekg.graph_views`, `ekg.queries`, `ekg.json_parts` | Contributes the `class` view; queries for Class nodes, OBSERVED and DF_C relationships, and their counts (group "Aggregated Graph"); and JSON parts `Class nodes`, `OBS relationships` (`obs_data`, `obs_count`), and `DF_C relationships` (`dfc_data`, `dfc_count`). All declare `kinds ("ekg_class",)`. |

Observer (C6): subscribes to `ekg.before_reset` and, as a critical subscriber, `analysis.before_apply` (only the event name is required; there is no dependency on `ekg_analysis`). It deletes its own `:Class` nodes and verifies that none remain. No other package calls its implementation. With `ekg_class_graph` disabled, analyses continue to work, class queries and JSON parts disappear, and existing `ekg_class` objects remain without operations, visualizers, or exporters.

## OCEL 2.0: the `ocel` package

`requires: ["soup_base", "ekg", "ekg_views", "tool_storage"]`, `requires_tools: ["memgraph", "storage"]`, `api_version: "4.1"`. Parses the OCEL 2.0 JSON format (`eventTypes`, `objectTypes`, `objects`, `events`) using Python's standard library. Nonconforming files produce `400` with the exact location and reason (`Not a valid OCEL 2.0 JSON file: events[2].time: 'yesterday' is not an ISO 8601 date and time`). Invalid JSON, duplicate IDs, non-ISO 8601 timestamps, relationships to missing objects, undeclared types (when the file declares types), and nonscalar attribute values are rejected. If `eventTypes` and `objectTypes` are absent, types are inferred from events and objects. Both importers have the same `inspect`: a key-value block (events, objects, event types, object types) and a table of the first 20 events.

| Contribution | Description |
|---|---|
| **OCEL 2.0 as Tables** (`ocel.tables`, → `ocel_tables`) | Stores tables under `ocel/<object ID>/` in storage, one JSON file per table (preserving value types): `events` (`event_id`, `event_type`, `time`, one column per attribute), `objects` (`object_id`, `object_type`, first value of each attribute), `event_objects` (with `qualifier`), `object_objects` (`source_id`, `source_type`, `target_id`, `target_type`, `qualifier`), `object_attributes` (each time-stamped object attribute value), and `types.json`. Explicit attribute `null` values remain `null` (blank table cells represent absent attributes; explicit `null` attributes are listed in the events JSON's `nulls`). No Memgraph queries. `dispose` deletes the directory. |
| **OCEL 2.0 as EKG on Memgraph** (`ocel.ekg`, → `ekg`) | Uses separated `EventLogData` with a fixed mapping: event ID, timestamp (`time` converted to UTC without an offset), and event `type` become the event ID, timestamp, and activity; object types become entity types; event attributes become properties (reserved names, or names colliding with object types, receive an `_attribute` suffix). Qualifiers and object-to-object relationships **are included in the graph** through the `ocel` build step (`ocel_relationships`, order 420; see [ocel/README.md](ocel/README.md)). Event-object qualifiers become the `qualifier` property on `:CORR`; object-object relationships become `(:Entity)-[:REL {qualifier}]->(:Entity)`. The two input files for this step (`ocel_qualifiers.csv`, `ocel_o2o.csv`) are stored with the dataset; `meta.ocel.in_graph` records counts of qualified `:CORR` and `:REL` relationships. All existing `ekg` visualizers and operations work unchanged. |
| **OCEL Tables** (`<soup-pkg-ocel-tables>`) | Events, Objects, Event–Object Relationships, and Object–Object Relationships tabs. Each uses `<soup-table>` with remote pagination. Action `page` `{table, offset, limit, sort, search, type}` → `{rows, total}`. `type` filters by event type for Events, or object type for Objects and Event–Object Relationships; for Object–Object Relationships either endpoint may match. |
| **OCEL Summary** (`<soup-pkg-ocel-summary>`) | Counts (`<soup-keyvalue>`) and a bar chart of events per type (`<soup-chart>`), from `meta`. The workspace preview shows the same bars. |
| **Decompose into EKG** (`ocel.to_ekg`, `ocel_tables` → `ekg`) | Performs the same decomposition as the EKG importer by rereading the imported tables. The resulting EKG (`<name> (EKG)`) is a child of the tables and its dataset is equivalent to one produced by the EKG importer. |
| **OCEL 2.0 JSON** exporter | Reconstructs the log from its tables; `file_type` uses the original imported extension (`.json` or `.jsonocel`) and MIME type `application/json`. Explicit `null` attribute values are preserved. Reimporting yields the same file. |

All timestamps are processed through `parse_time` (`model.py`), including the UTC `Z` suffix; `datetime.fromisoformat` accepts that suffix directly only in Python 3.11 and later.

Tables are read from storage once per object: OCEL Tables, the exporter, and Decompose into EKG use a plugin-instance `ParsedCache` (from `soup_base`, `soup_pkg_soup_base.api`), like `csv_table`. Limits are controlled by `SOUP_OCEL_CACHE_OBJECTS` and `SOUP_OCEL_CACHE_MB` (defaults: 8 objects and 200 MB; values that are not positive integers prevent package loading). A new import and `dispose` invalidate the object; the API methods `read_table`, `read_log`, and `load_tables` always read directly from storage.

To test runtime installation (also covered by `soup-app/e2e/ocel.spec.ts`), run `npm run build:packages -- ocel && npm run pack -- ocel`; then, with the app running and `soup_base`, `tool_storage`, `tool_memgraph`, `ekg`, and `ekg_views` active, upload `dist/ocel-1.0.0.zip` at **/packages**. The importers immediately appear under **/import** for `.json` files, along with the visualizers, operation, and exporter, without restarting or rebuilding the host.

## Package code rules

- Import only `soup.core.contracts` from the host. Import files within the package using relative imports (`from .reader import ...`).
- The `server/` module is imported under an isolated name, `soup_pkg_<name>`, so two packages may contain files with the same names.
- Use another package only through its public API, `soup_pkg_<other>.api`, and only if `<other>` is listed under `requires` (ensuring it loads first). Otherwise, communicate through tools, extension points (`add_extension_point` / `contribute`), and events (`EventBus`).
- The `app/` component must not import host code: each visualizer is a custom element that receives `data` and `context` and communicates with the host via `context` and DOM events.

## Where packages are discovered

- `SOUP_PACKAGES_PATH`: directories separated by `os.pathsep` (`:` on Linux and in Docker, `;` on Windows). Defaults to this directory and the installed-packages directory.
- `SOUP_INSTALLED_PACKAGES_DIR`: where `install` extracts ZIP archives and stores package state (`_state.json`). Always added to the search path. Defaults to `soup-server/instance/packages`, or `/data/soup-packages` in Docker (volume `soup-installed-packages`).
- If the same package name is present in two directories, the higher version takes precedence.
- `SOUP_PACKAGES`: an explicit list of packages to enable at startup (empty means none). If unset, all discovered packages are active except those disabled by the user. The previous name, `SOUP_PLUGINS`, is no longer used.

## Lifecycle

At startup, before importing any package code, `PackageManager` validates manifests, `api_version`, `python_dependencies`, and `requires` (using topological ordering and cycle detection). Failed packages appear in the report with a reason and do not prevent other packages from loading, unless `SOUP_STRICT=true`.

Installation, enabling, disabling, and uninstallation can happen while the server is handling other requests. Core registries use copy-on-write, ensuring that readers always observe a consistent state.

Runtime endpoints under `/api/v3/packages`:

| Operation | HTTP | Notes |
|---|---|---|
| List | `GET /api/v3/packages` | Reports `active`, `disabled`, or `failed` status, with the error, dependents, and registered `contributions`. |
| Install | `POST /api/v3/packages` (multipart `file`) | Accepts a ZIP containing a manifest at its root or inside a single top-level directory. Rejects archives exceeding 50 MB (200 MB extracted), paths escaping the package directory, symlinks, invalid manifests, missing Python libraries, or inactive `requires`. Overriding a bundled package of the same name requires a higher version and `allow_override=true`; upgrading an installed package also requires a higher version. The package loads immediately, reverting to the previous version if loading fails. |
| Disable | `POST /api/v3/packages/<name>/disable` | Removes contributions without restarting. Returns `409` with `dependents` if other active packages need it; `cascade=true` disables those dependents as well. |
| Enable | `POST /api/v3/packages/<name>/enable` | Returns `409` if a required package is inactive. |
| Frontend files | `GET /api/v3/packages/<name>/app/<path>` | Serves only files under `app/dist` from active packages. Paths escaping `app/dist` (including through symlinks) return `404`. ETag is based on package version. |
| Frontend manifest | `GET /api/v3/frontend/manifest` | Returns `[{name, version, module_url, requires}]` for active packages with an `app` component, ordered so that dependencies precede dependents. The host imports them in this order. |
| Uninstall | `DELETE /api/v3/packages/<name>` | Only installed packages can be uninstalled (bundled ones can be disabled). Objects created by that package remain in the workspace with `package_status: "missing"`. |

Normally, an object cannot be deleted if its creating package is inactive (disabled or uninstalled), because no contribution is available to clean up the underlying data. Deletion returns `409` with the involved package names. The package may be reactivated, or deletion can use `force=true`, which removes the object only from the catalog and records it in `<installed-packages directory>/orphaned-data.json` (including object `meta`, package, contributor, and date), so remaining data can be cleaned up later.

Installation and uninstallation return `403` unless `SOUP_ALLOW_PACKAGE_INSTALL=true`. Enabled/disabled state persists across restarts.

## Frontend: `@soup/sdk`

The Angular host contains no visualizers. Every visualizer is a **Web Component** (custom element) defined by its package's `app/dist/index.js` bundle. The host loads it at runtime using `import()` from `/api/v3/packages/<name>/app/...`, in frontend-manifest order (dependencies first). Failure to load one bundle does not block the others; the error is displayed on the `/packages` page. The `app/` component depends only on `@soup/sdk` (`sdk/`, pure TypeScript with no framework dependency), never on host code.

- **Shared types:** `ObjectRef`, `Field` (13 field types), `Block` (9 block types from `report.py`), `FileValue`, `ItemValue`.
- **DOM helpers:** `h(tag, {className, text, attrs, on}, ...children)` creates an element (always inserting text via `textContent`; ignoring `null` and `undefined` children), and `errorMessage(error)` returns an error message. Previously, each package contained its own copy in `app/src/dom.ts`.
- **Visualizers:** The host creates the element with the tag specified in `Visualizer.element`, assigns `data` (the return value of `data()`) and `context`, and inserts it into the page. `VisualizerContext` provides `object`, `theme`, `action(name, params)` (invokes that visualizer's `Visualizer.action`), `openObject(id)`, `notify(message, level)`, `setThumbnail(svg)` (workspace image preview), and `download(filename, mime, data)`. It is a union of smaller capability-specific interfaces (`ObjectContext`, `ActionContext`, `NavigationContext`, `NotifyContext`, `ThumbnailContext`, `DownloadContext`). An element or helper using only some of them can declare the narrower interface (`<soup-graph-view>` receives `NotifyContext`); `VisualizerContext` is compatible with each.
- **Importer configuration:** An importer with `config_element` replaces the generic form with its own element, which receives a `ConfigContext` containing `fields`, `columns` (preview columns), `value`, `preview(options)`, and `emit(options)` for import options.
- **DOM events to the host** (bubbling, `composed`): `soup-thumbnail` `{svg}`, `soup-open-object` `{id}`, `soup-notify` `{message, level}`, and `soup-config-change` `{value}`. Context methods emit these events, so an element may use either approach.
- **`defineSoupElement(tag, klass)`** registers an element only if the tag is not already defined, preventing failures when reloading a bundle after disable/enable. Custom elements cannot be redefined, so after updating an already-loaded package, the new version is used only after reloading the page (as indicated on `/packages`).
- Data-derived text must be inserted using `textContent`, never as markup.

```ts
import { defineSoupElement, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

class MyViewer extends HTMLElement implements SoupVisualizerElement<MyData> {
  data!: MyData;
  context!: VisualizerContext;
  connectedCallback() { /* render this.data */ }
}

defineSoupElement('my-package-viewer', MyViewer);
```

## Build and ZIP packaging

From the `soup-packages` root (an npm workspace containing `sdk` and each package's `app/`):

```sh
npm install                          # once, and whenever a package with app/ is added
npm run lint                         # eslint (including complexity and max-lines-per-function), knip, SDK tsc
npm test                             # vitest unit tests (jsdom) in */app/test/ and sdk/test/
npm run build:packages               # SDK, then type checking + esbuild for each app/ -> app/dist/index.js (single minified ES module with sourcemap)
npm run build:packages -- my_package # selected packages only
npm run pack -- my_package           # dist/my_package-<version>.zip: manifest, server/, app/dist/
curl -F file=@dist/my_package-1.0.0.zip http://localhost:8080/api/v3/packages
```

The server Docker image runs `npm ci && npm run build:packages`, so bundled package bundles are always up to date. To start from an example, follow **Writing a package** at the beginning of this guide, or copy [`_template`](_template/README.md) (a `.txt` file importer and its visualizer).
