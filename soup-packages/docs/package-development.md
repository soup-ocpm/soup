# Build a complete package

[Documentation index](../README.md) · Prerequisite:
[getting started](getting-started.md)

This tutorial builds a database-independent `records` package with a JSON Lines
importer, a filtering operation, a paged visualizer and a CSV exporter. Storage
is provided through the existing tool API; the browser reuses `<soup-table>`. It
does not build or query a graph. The optional Memgraph analysis-filter example
is a **separate package** in
[Extensions](extensions.md#optional-memgraph-analysis-filter).

## 1. Declare only the required capabilities

From `soup-packages/`, copy `_template` to an unused `records` directory, rename
its npm workspace to `soup-pkg-records-app`, and remove the copied
`server/text.py` from **that new directory only**. Replace the plugin/frontend
with the files below. Keep `server/__init__.py` and `app/tsconfig.json` from the
template.

Use this complete `records/soup-package.json`:

```json
{
  "name": "records",
  "version": "1.0.0",
  "api_version": "4.0",
  "label": "JSON Lines records",
  "description": "Import, filter, view and export JSON records.",
  "author": "SOUP",
  "databases": ["memgraph", "neo4j"],
  "requires": ["soup_base", "tool_storage"],
  "requires_tools": ["storage"],
  "provides_tools": [],
  "extension_points": [],
  "python_dependencies": [],
  "server": { "module": "server", "plugin": "plugin:Plugin" },
  "app": { "entry": "dist/index.js" }
}
```

`soup_base` supplies the table custom element. `tool_storage` is required
because Python imports its public `StorageTool` type; `storage` authorizes
accessing the tool. Each contribution below declares that tool separately. Only
standard-library Python modules and `soup.core.contracts` are otherwise
imported. The frontend's only npm dependency is `@soup/sdk`; it uses the shared
element by tag.

## 2. Implement the importer and shared storage helpers

Create `records/server/records.py` with this first block. The later Python
blocks in this guide **append to the same file**.

```python
from __future__ import annotations

import csv
import io
import json
import logging
import uuid
from collections.abc import Mapping
from typing import Any

from soup_pkg_tool_storage.api import StorageSpace, StorageTool

from soup.core.contracts import (
    Choice, Exporter, Field, Importer, Inspection, NotFoundError, ObjectDraft,
    ObjectRef, Operation, OperationInput, ToolAccess, Upload,
    ValidationError, Visualizer, report,
)

KIND = "records.jsonl"
STORAGE = "storage"
PAGE = 50


def parse(data: bytes) -> list[dict[str, Any]]:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValidationError("The file must be UTF-8 encoded") from exc
    rows = []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
            # Exclude nonstandard NaN/Infinity accepted by Python's decoder.
            json.dumps(value, allow_nan=False)
        except ValueError as exc:
            raise ValidationError("Invalid JSON record", details={"line": number}) from exc
        if not isinstance(value, dict):
            raise ValidationError("Each record must be a JSON object", details={"line": number})
        rows.append(value)
    return rows


def columns_of(rows: list[dict[str, Any]]) -> list[str]:
    return sorted({key for row in rows for key in row})


def space(tools: ToolAccess) -> StorageSpace:
    return tools.typed(STORAGE, StorageTool).space("records")


def load(obj: ObjectRef, tools: ToolAccess) -> list[dict[str, Any]]:
    filename = obj.meta.get("file")
    if not isinstance(filename, str) or not filename:
        raise NotFoundError(f"Object '{obj.id}' has no stored file")
    return parse(space(tools).read(filename))


def dispose_file(obj: ObjectRef, tools: ToolAccess) -> None:
    # Imports use the known object ID even if import_ failed before returning meta.
    filename = obj.meta.get("file", f"{obj.id}.jsonl")
    if isinstance(filename, str) and space(tools).exists(filename):
        space(tools).delete(filename)


def key_option(rows: list[dict[str, Any]], options: Mapping[str, Any]) -> str | None:
    value = options.get("key")
    if value is None or value == "":
        return None
    if not isinstance(value, str) or value not in columns_of(rows):
        raise ValidationError("Choose an existing key column", details={"field": "key"})
    return value


class JsonLinesImporter(Importer):
    id = "jsonl"
    label = "JSON Lines records"
    description = "One JSON object per nonblank line."
    extensions = (".jsonl",)
    produces = KIND
    requires_tools = (STORAGE,)

    def inspect(self, upload: Upload, tools: ToolAccess) -> Inspection:
        rows = parse(upload.read())
        columns = columns_of(rows)
        preview = report.table(columns, [[row.get(c) for c in columns] for row in rows[:10]],
                               total=len(rows), title="First records")
        fields = (Field("key", "Key column", type="select", choices=tuple(Choice(column) for column in columns),
                        default=columns[0]),) if columns else ()
        return Inspection(preview=(preview,), fields=fields)

    def preview(self, upload: Upload, options: Mapping[str, Any], tools: ToolAccess) -> list[dict[str, Any]]:
        rows = parse(upload.read())
        return [report.keyvalue({"records": len(rows), "key column": key_option(rows, options)})]

    def import_(self, upload: Upload, obj: ObjectRef, options: Mapping[str, Any], tools: ToolAccess) -> dict[str, Any]:
        data = upload.read()
        rows = parse(data)
        key = key_option(rows, options)  # Validate before storing anything.
        filename = f"{obj.id}.jsonl"
        space(tools).write(filename, data)
        return {"file": filename, "count": len(rows), "columns": columns_of(rows), "key": key,
                "extension": ".jsonl"}

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        dispose_file(obj, tools)
```

Important boundaries:

- `inspect()` provides preview blocks and form fields. A `select` field must
  have at least one choice; an empty file therefore has no key field.
- Import options arrive as a mapping. Unlike operation/export parameters, the
  current importer router does **not** validate them against inspection fields.
  Validate them in `preview()` and `import_()` yourself.
- The core has assigned `obj.id`, name, kind and creator before `import_()`
  runs. Its final return value becomes `meta`; it does not receive an
  `ObjectDraft`.
- Import failure triggers best-effort `dispose()` and re-raises the error.
  Cleanup must tolerate empty metadata and partial writes. Storing by `obj.id`
  makes that possible here; never rely only on metadata not yet returned.
- The optional key column is metadata for downstream consumers; it does not
  enforce uniqueness. The graph backend is not recorded on these neutral
  objects.

## 3. Add an operation

Append to `server/records.py`:

```python
class FilterRecords(Operation):
    id = "filter"
    label = "Filter records"
    description = "Keep records whose selected field has the given text value."
    group = "Records"
    inputs = (OperationInput("records", (KIND,)),)
    produces = (KIND,)
    requires_tools = (STORAGE,)

    def fields(self, inputs: Mapping[str, ObjectRef], tools: ToolAccess) -> list[Field]:
        source = inputs["records"]
        columns = tuple(source.meta.get("columns") or ())
        if not columns:
            raise ValidationError("This object has no columns to filter")
        return [Field("name", "Name", required=True, default=f"{source.name} filtered"),
                Field("column", "Column", type="select", required=True, choices=tuple(Choice(column) for column in columns)),
                Field("value", "Value", required=True)]

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:
        source = inputs["records"]
        kept = [row for row in load(source, tools) if str(row.get(params["column"])) == params["value"]]
        filename = f"{uuid.uuid4().hex}.jsonl"  # Draft IDs are assigned later.
        payload = "\n".join(json.dumps(row, allow_nan=False) for row in kept).encode("utf-8")
        try:
            space(tools).write(filename, payload)
        except Exception:
            # No draft exists yet for the core's cleanup to dispose of.
            try:
                if space(tools).exists(filename):
                    space(tools).delete(filename)
            except Exception:
                logging.getLogger("records").exception("Could not remove a partial operation output")
            raise
        return [ObjectDraft(params["name"], KIND,
                {"file": filename, "count": len(kept), "columns": list(source.meta.get("columns") or ()),
                 "key": source.meta.get("key"), "extension": ".jsonl"})]

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        dispose_file(obj, tools)
```

The core matches selected objects to input slots by kind and package/backend
compatibility. `inputs` maps slot names to `ObjectRef` values. The operation and
export routers validate `fields()` values before executing. The core assigns
output IDs, `parents` and `created_by`, checks drafts, and registers the
outputs. Cleanup on registration failure can call `dispose()` on outputs;
failures _inside_ `run()` before drafts are returned remain the operation's
responsibility.

This small example parses all records on each call. For production-sized files,
consider the existing `ParsedCache` in [soup_base](../soup_base/README.md), with
per-plugin ownership, bounds and invalidation on writes/disposal as demonstrated
by [text](../text/README.md) and [csv_table](../csv_table/README.md).

## 4. Add the visualizer backend

Append to `server/records.py`:

```python
class RecordsVisualizer(Visualizer):
    id = "table"
    label = "Records"
    accepts = (KIND,)
    element = "soup-pkg-records-table"
    requires_tools = (STORAGE,)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        rows = load(obj, tools)
        return {"columns": obj.meta["columns"], "rows": rows[:PAGE], "total": len(rows)}

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name != "page":
            raise NotFoundError(f"Unknown records action '{name}'")
        offset = params.get("offset", 0)
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
            raise ValidationError("Offset must be a non-negative integer")
        return {"rows": load(obj, tools)[offset:offset + PAGE]}
```

Actions are part of this visualizer's closed API, not arbitrary Python/Cypher
execution. Validate action parameters in the contribution; the router passes the
mapping through. Keep page sizes bounded server-side.

## 5. Add the frontend

Replace `records/app/src/index.ts` with:

```ts
import {
  defineSoupElement,
  errorMessage,
  h,
  type SoupVisualizerElement,
  type VisualizerContext,
} from "@soup/sdk";

interface RecordsData {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
}
interface TableElement extends HTMLElement {
  data: { columns: string[]; rows: unknown[][]; total?: number };
}

class RecordsTable
  extends HTMLElement
  implements SoupVisualizerElement<RecordsData>
{
  public data!: RecordsData;
  public context!: VisualizerContext;
  private readonly root = this.attachShadow({ mode: "open" });
  private rows: Record<string, unknown>[] = [];
  private loading = false;
  private generation = 0;

  public connectedCallback(): void {
    this.rows = [...this.data.rows];
    this.draw();
    this.context.setThumbnail(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><text x="10" y="35">${Number(this.data.total)}</text></svg>`,
    );
  }

  public disconnectedCallback(): void {
    this.generation++;
    this.loading = false;
  }

  private draw(): void {
    const table = document.createElement("soup-table") as TableElement;
    table.data = {
      columns: this.data.columns,
      rows: this.rows.map((row) =>
        this.data.columns.map((column) => row[column]),
      ),
      total: this.data.total,
    };
    const more = h("button", {
      text: `Load more (${this.rows.length} of ${this.data.total})`,
      attrs: { type: "button" },
      on: { click: () => void this.next() },
    });
    more.disabled = this.loading || this.rows.length >= this.data.total;
    this.root.replaceChildren(table, more);
  }

  private async next(): Promise<void> {
    if (this.loading) return;
    const generation = this.generation;
    this.loading = true;
    this.draw();
    try {
      const page = await this.context.action<{
        rows: Record<string, unknown>[];
      }>("page", { offset: this.rows.length });
      if (generation !== this.generation || !this.isConnected) return;
      this.rows.push(...page.rows);
    } catch (error) {
      if (generation === this.generation && this.isConnected)
        this.context.notify(errorMessage(error), "error");
    } finally {
      if (generation === this.generation && this.isConnected) {
        this.loading = false;
        this.draw();
      }
    }
  }
}

defineSoupElement("soup-pkg-records-table", RecordsTable);
```

The shared table pages/sorts/searches the **currently loaded** rows. **Load
more** fetches the next bounded batch; it does not claim server-wide
search/sort. The thumbnail interpolates a numeric count only. All data-derived
table text goes through the shared component's text rendering. Responses
arriving after the element disconnects are ignored; this does not abort a server
request.

The bundle imports only `@soup/sdk`; `soup_base` registers `<soup-table>` first
because it is a manifest dependency. Do not import the Angular application's
source or copy its components into a package.

## 6. Add the CSV exporter

Append to `server/records.py`:

```python
class RecordsCsv(Exporter):
    id = "csv"
    label = "Records as CSV"
    accepts = (KIND,)
    extension = ".csv"
    mime = "text/csv"
    requires_tools = (STORAGE,)

    def fields(self, obj: ObjectRef, tools: ToolAccess) -> list[Field]:
        return [Field("header", "Include header", type="bool", default=True)]

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> bytes:
        out = io.StringIO(newline="")
        writer = csv.DictWriter(out, fieldnames=list(obj.meta["columns"]), extrasaction="ignore")
        if params["header"]:
            writer.writeheader()
        for row in load(obj, tools):
            writer.writerow({key: json.dumps(value) if isinstance(value, (dict, list)) else value
                             for key, value in row.items()})
        return out.getvalue().encode("utf-8")
```

CSV is a tabular representation, not a lossless typed JSON round-trip. Nested
arrays/objects are JSON-encoded in cells. The core supplies validated defaults,
builds `<object name>.csv`, and requires bytes from `export()`.

Optional dynamic file types are covered in
[Package API](package-api.md#exporter-file-types); using `file_type()` requires
`api_version: "4.1"`. The exporter above does not need that feature, so the
complete package can remain on `4.0`.

## 7. Register and run the package

Replace `records/server/plugin.py`:

```python
from soup.core.contracts import PluginContext, SoupPlugin

from .records import FilterRecords, JsonLinesImporter, RecordsCsv, RecordsVisualizer


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.add_importer(JsonLinesImporter())
        ctx.add_operation(FilterRecords())
        ctx.add_visualizer(RecordsVisualizer())
        ctx.add_exporter(RecordsCsv())
```

The full IDs are `records.jsonl`, `records.filter`, `records.table`,
`records.csv`. The manifest supplies package identity/dependencies; do not
repeat them on `Plugin`.

From `soup-packages/`, after editing the copied npm workspace name:

```sh
npm install
npm run build:packages -- records
npm run pack -- records
```

Use **Packages** to install the ZIP on another server, or restart the local
repository server for discovery. See
[lifecycle and version rules](lifecycle.md). An existing bundled package of the
same version is not replaceable by uploading that same ZIP.

Use a file containing:

```jsonl
{"id": 1, "status": "open"}
{"id": 2, "status": "closed"}
```

Check inspection, invalid UTF-8/JSON diagnostics, import, table display, paging
on a longer file, filtering `status = open`, both header options on CSV export,
and cleanup when deleting parent/child objects through SOUP. Empty input must
not construct an invalid empty `select` field. Run the same neutral workflow
with both configured backends; no graph connection is required for these
contributions.
