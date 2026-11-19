# Package API reference

[Documentation index](../README.md) ·
[Complete tutorial](package-development.md)

The implementation is authoritative. Stable server contracts live under
[`soup.core.contracts`](../../soup-server/soup/core/contracts/__init__.py);
frontend contracts live in [`@soup/sdk`](../sdk/src/index.ts). Use relative
imports inside a package and declared public APIs when importing another
package.

## Manifest

A package has `soup-package.json`, a server Python module with `__init__.py`,
and optionally `app/`.
[Manifest validation](../../soup-server/soup/core/packages/manifest.py) checks
fields and the server module. Discovery also requires the directory name to
match manifest `name`; `_template` is intentionally ignored until copied or
explicitly packed/installed as `template`.

| Field                            | Current behavior                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                           | Required; `[a-z][a-z0-9_]*`, also subject to name validation. Becomes `soup_pkg_<name>`.                                                                                                                |
| `version`                        | Required PEP 440 version; upgrades compare parsed versions.                                                                                                                                             |
| `api_version`                    | Required `"MAJOR.MINOR"`; same major as host, minor no greater than host.                                                                                                                               |
| `label`, `description`, `author` | Optional strings; label defaults to the name. These are metadata, not executable entry points.                                                                                                          |
| `databases`                      | Nonempty list containing `memgraph`, `neo4j`, or both; omission defaults to `memgraph`.                                                                                                                 |
| `requires`                       | Package names that must be active first; no version constraints in this list. Direct public API imports must name the supplying package here.                                                           |
| `requires_tools`                 | Global tool names the package may request. Providers participate in dependency ordering even without a direct public API import.                                                                        |
| `provides_tools`                 | Names this package may register with `add_tool`.                                                                                                                                                        |
| `extension_points`               | Names this package may open with `add_extension_point`. This does not list points to which it contributes.                                                                                              |
| `python_dependencies`            | Legacy PEP 508 requirement list. Prefer package-level `requirements.txt`; do not declare the same distribution differently in both places. Missing dependencies require explicit installation approval; environment markers are respected. See [dependency management](lifecycle.md#python-dependencies). |
| `server.module`                  | Dotted module path inside the package, normally `server`; its `__init__.py` must exist.                                                                                                                 |
| `server.plugin`                  | `"module:Attribute"` within that module: a `SoupPlugin` subclass or instance.                                                                                                                           |
| `app.entry`                      | Optional forward-slash path within `app/dist`, such as `dist/index.js`. Only that directory is served.                                                                                                  |

The complete manifests in [getting started](getting-started.md) and
[package development](package-development.md) are working examples. Existing
manifests also include `contributors`; the current manifest reader does not
expose or validate it as a first-class `PackageManifest` field.

## API versions

The current host exports `CONTRACTS_API_VERSION = "4.1"`. It accepts `4.0` and
`4.1`, rejects `4.2`, and rejects different major versions. A package version
such as `1.0.0` is separate from its contract version.

Historical changes documented in
[version.py](../../soup-server/soup/core/contracts/version.py):

| Contract version | Change and current migration consequence                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `3.0`            | Removed `add_input_reader`, `add_input_handler`, `add_build_step`; EKG build steps moved to the package extension point. Old `2.x` APIs are unavailable.                                                                             |
| `3.1`            | Added optional `Exporter.applies(obj, tools)`, still available in `4.x`.                                                                                                                                                             |
| `4.0`            | Removed legacy `Query`, `ident`, `GraphDatabase` from the root contracts export. Use `tool_memgraph`/`ekg` public APIs for those legacy types. The current host separately exposes the dataset-bound `contracts.database` protocols. |
| `4.1`            | Added optional `Exporter.file_type(obj, params)`. Declare `4.1` when overriding it.                                                                                                                                                  |

The table records API changes, not a promise that old `3.x` packages load on a
`4.x` host. Old commit-number labels in the former README are not compatibility
identifiers.

## Registration and contribution identity

`SoupPlugin.register(ctx: PluginContext) -> None` is required;
`on_shutdown(ctx) -> None` is optional. The loader assigns name, version, API
version, database compatibility, package/tool requirements and extension-point
declarations from the manifest. The plugin registers instances using:

```text
ctx.add_importer(importer)
ctx.add_operation(operation)
ctx.add_visualizer(visualizer)
ctx.add_exporter(exporter)
ctx.add_tool(tool)
```

Contribution keys are `<package>.<id>`; IDs are unique within each contribution
registry for that package. Importers and visualizers may each use `text` because
they occupy separate registries. Tools and extension-point names are global.

A contribution's `requires_tools` must be a subset of its package's required or
provided tools. Runtime access is restricted again to that contribution's own
list. Requesting an undeclared tool raises `ToolNotDeclaredError`. Registration
validates contract instances, required IDs/kinds and tool declarations; registry
conflicts name both owners. These checks are not a code-security sandbox.

## Objects and contributions

`ObjectRef` contains `id`, `name`, `kind`, `created_by`, `parents`,
`created_at`, `description`, `meta`. `created_by` is
`CreatedBy(type, contributor_id, package)`; `type` is `importer` or `operation`,
and `contributor_id` is fully qualified.
`ObjectDraft(name, kind, meta={}, description="")` has no ID yet. The core
assigns IDs, provenance and timestamps when registering operation results.

The method signatures below omit repeated type annotations for readability;
`tools` always implements `ToolAccess`, and options/params are mappings.

| Contribution | Attributes                                                                                          | Methods                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Importer`   | `id`, `label`, `description`, `extensions`, `produces`, `requires_tools`, optional `config_element` | `accepts(filename) -> bool`; required `inspect(upload, tools) -> Inspection`, `import_(upload, obj, options, tools) -> dict`, `dispose(obj, tools) -> None`; optional `preview(upload, options, tools) -> list[dict]` |
| `Operation`  | `id`, `label`, `description`, `group`, `inputs`, `produces`, `requires_tools`                       | Optional `fields(inputs, tools) -> list[Field]`; required `run(inputs, params, tools) -> list[ObjectDraft]`; optional `dispose(obj, tools) -> None`                                                                   |
| `Visualizer` | `id`, `label`, `accepts`, `element`, `requires_tools`                                               | Required `data(obj, params, tools) -> Any`; optional `action(obj, name, params, tools) -> Any`, whose default raises `NotFoundError`                                                                                  |
| `Exporter`   | `id`, `label`, `accepts`, `extension`, `mime`, `requires_tools`                                     | Optional `applies`, `fields`, `file_type`; required `export(obj, params, tools) -> bytes`                                                                                                                             |

- Default `Importer.accepts` compares filename suffixes case-insensitively; it
  does not inspect content. `inspect()` is where content validation can begin.
- `Upload(filename, source, content_type="")` wraps a binary stream;
  `Upload.from_bytes(filename, data, content_type="")` is useful for checks.
  `read() -> bytes` caches content; `stream` returns a fresh `BytesIO` view.
- `Inspection(preview=(), fields=())` normalizes both collections to tuples.
- `OperationInput(name, kinds)` defines one required object slot; `inputs` maps
  its name to the chosen object. The core also accepts selected IDs and assigns
  slots.
- Kind matching is **not the only filter**: tool availability and the package's
  database compatibility with the object/backend also matter. Neutral objects
  without graph ancestry can be used by packages available in the current pool.
- Import/preview options and visualizer action/data mappings require validation
  in the package. Operation/export parameters pass through core
  `validate_values` against `fields()`. Do not assume a generic form prevents
  forged HTTP inputs.
- Import failure and failed output registration use best-effort cleanup, not a
  database-wide transaction. Own partial resources that never reached a returned
  draft remain the operation's responsibility.

### Exporter file types

`applies(obj, tools) -> bool` defaults to `True`. False or a failing predicate
omits the exporter; direct execution responds `404`. Exceptions are logged.
`fields(obj, tools) -> list[Field]` defaults to no options.

`file_type(obj, params) -> tuple[str, str]` defaults to
`(self.extension, self.mime)`. During export, params are already validated. The
core requires a `.` followed by 1–15 ASCII
letters/digits/dots/hyphens/underscores for the extension, and a restricted
`type/subtype` MIME value with no `; charset=` parameter. Invalid returned types
produce a package/exporter-attributed `500` before a filename is built. Export
content must be bytes (bytearray is also accepted by the router).

For the menu, `file_type` receives the fields' default values; failure/invalid
values fall back to fixed `extension`/`mime`, with a warning. The output
filename is `<object name><extension>`. See [text](../text/README.md),
[csv_table](../csv_table/README.md) and [ocel](../ocel/README.md) for
implementations preserving imported or selected file types. For example, `text`
saves `meta.extension` and implements its original-file exporter; this
capability needs `api_version: "4.1"` but no additional graph dependency.

## Fields and report blocks

`Field(name, label="", type="text", required=False, default=None, choices=(), help="", variants=())`
declares a form control. `Choice(value, label="")` and
`Variant(key, label="", description="", fields=())` support selectable values
and nested items.

| Field type              | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `text`, `textarea`      | Text                                                                                                 |
| `number`                | Integer/float; numeric strings accepted by core validation                                           |
| `bool`                  | Boolean; supported true/false/1/0 string forms also accepted                                         |
| `select`, `multiselect` | One choice / list of choices; nonempty choices must be declared                                      |
| `column`, `columns`     | Column string / list; choices restrict values when supplied, otherwise the UI offers preview columns |
| `pairs`                 | List of two-element pairs; optional choices restrict both entries                                    |
| `date`, `datetime`      | Date / ISO datetime values                                                                           |
| `file`                  | `Upload` or JSON `{filename, base64, content_type?}`                                                 |
| `items`                 | List of `{variant, values}`; values validated against that variant's fields                          |

There are 13 current field types. Empty/whitespace-only choice values are
treated as empty by validation; use separator names (`tab`, `comma`) rather than
literal whitespace for select values. `items` must declare variants. Select
fields cannot have empty choices; use a different field or explain why the
action is unavailable.

`from soup.core.contracts import report` gives block factories. Blocks have
`{type, title, data}` and nine types: `text`, `markdown`, `image`, `table`,
`graph`, `chart`, `keyvalue`, `file`, `error`. SVG is an `image` block, not a
tenth type. Current factory signatures:

```text
report.text(value, title="")
report.markdown(value, title="")
report.image(content: bytes, mime, title="")
report.svg(markup, title="")
report.table(columns, rows, total=None, title="")
report.graph(nodes, edges, directed=True, title="")
report.chart(chart_kind, labels, datasets, title="")
report.keyvalue(items, title="")
report.file(filename, content: bytes, mime="application/octet-stream", title="")
report.error(message, title="")
report.report(name, blocks, description="") -> ObjectDraft
```

The factories validate shape. A report object stores validated `meta.blocks`;
its visualizer/exporter comes from `soup_base`. Raw graph blocks use nodes
`{id, label?, group?, props?}` and edges
`{id?, source, target, label?, group?, props?}`. Shared rendering APIs belong in
[the soup_base reference](../soup_base/README.md), not in each consumer package.

## Tools and application storage

`Tool` requires a global `name` and `health() -> dict[str, Any]`. A health
method should report failure rather than raise. `ToolAccess` provides:

```text
tools.get(name) -> Tool
tools.typed(name, expected_type) -> expected_type
tools.has(name) -> bool
```

`ctx.tools` is the package-level toolbox; the `tools` argument is narrowed to
the contribution's declared list. `Catalog`, `Preferences` and `FileStorage` are
core ports. Concrete public types such as `StorageTool` require the provider
package in `requires` as well as each accessed tool in `requires_tools`.

| Provider        | Global tool                         | Reference                                                                                |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `tool_storage`  | `storage`, `catalog`, `preferences` | [Storage API, locations, settings](../tool_storage/README.md)                            |
| `tool_memgraph` | `memgraph`                          | [Native Query/lifecycle API and shared connection ownership](../tool_memgraph/README.md) |

No catalog/preferences provider means relevant core services return `503`; graph
features also need their respective configured connection/lifecycle provider.
Core tool warnings are included in the package report. A provider's absence is
not by itself a guarantee that all unrelated features fail to start.

### Dataset-bound database access

Use `ctx.database` to capture the existing
[`Database` protocol](../../soup-server/soup/core/contracts/database.py) during
registration. It is **not a tool name** and does not require `memgraph` in
`requires_tools` just to call the common API. A graph feature declares
compatible backends in its manifest and uses the object ID for every operation.

The following is a complete contribution and registration example for a
separate, server-only `graph_count` package (`server/plugin.py`, plus
`server/__init__.py`). Its complete manifest is:

```json
{
  "name": "graph_count",
  "version": "1.0.0",
  "api_version": "4.0",
  "label": "Count graph nodes",
  "description": "Read a dataset node count.",
  "author": "SOUP",
  "databases": ["memgraph", "neo4j"],
  "requires": [],
  "requires_tools": [],
  "provides_tools": [],
  "extension_points": [],
  "python_dependencies": [],
  "server": { "module": "server", "plugin": "plugin:Plugin" }
}
```

It produces a generic report; displaying it optionally needs `soup_base`. For
Memgraph, the existing `ekg` runtime must supply the dataset loader.

```python
from collections.abc import Mapping
from typing import Any

from soup.core.contracts import ObjectDraft, ObjectRef, Operation, OperationInput, PluginContext, SoupPlugin, ToolAccess, report
from soup.core.contracts.database import Database


class CountNodes(Operation):
    id = "count"
    label = "Count dataset nodes"
    inputs = (OperationInput("graph", ("ekg", "oced_importer.log")),)
    produces = (report.REPORT,)

    def __init__(self, database: Database):
        self.database = database

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:
        obj = inputs["graph"]
        db = self.database.for_dataset(obj.id)
        rows = db.execute("MATCH (n) RETURN count(n) AS count")
        return [report.report(f"{obj.name} node count", [report.keyvalue({"nodes": rows[0]["count"]})])]


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.add_operation(CountNodes(ctx.database))
```

The result remains bound to that backend/dataset even if the browser switches
workspaces. The shared resolver follows catalog ancestry, infers legacy Memgraph
`meta.dataset` / Neo4j `meta.neo4j_database` mappings, validates explicit
backend and ownership metadata, and rejects missing or ambiguous graph context
without mutating the catalog or falling back. Memgraph restoration is
serialized; Neo4j sessions explicitly select the dataset's registered database.

Other methods on the existing protocol:

```text
db.backend -> str; db.backends -> tuple[str, ...]
db.for_dataset(object_id) -> Database
db.execute(cypher, parameters=None) -> list[dict[str, Any]]
db.transaction() -> context manager yielding CypherExecutor
```

Use `with db.transaction() as tx:` and `tx.execute(...)` for a transaction. The
adapter consumes results, commits once after a successful body, rolls back body
failures when possible, and preserves commit failures. Do not manually commit
the yielded executor or nest transaction ownership. Do not close borrowed
connections after each request; the engine/provider owns pooled connection
shutdown.

Infrastructure/admin methods also exist: `for_backend(backend)`,
`for_database(name)`, `bind_context(backend, factory)`, `close()`,
`check_multi_database()`, `create_dataset(object_id, name)`,
`drop_dataset(object_id, *, confirmed=False)`. They are not substitutes for
`for_dataset` in graph features. Managed database dropping requires confirmation
and rejects protected/shared/unmanaged mappings. Creation and administrative
queries use an explicitly selected Neo4j/system connection.

Memgraph is the default. `NEO4J_URI` enables an additional external pool when
the startup default is Memgraph; an explicit `MEMGRAPH_HOST` can enable Memgraph
when the default is Neo4j. Configuration is established at startup; switching
**datasets** then switches connections without reconnecting to another instance.
`NEO4J_DATABASE` is a legacy/admin setting, never a dataset-selection fallback.
The [OCED importer](../oced_importer/README.md) owns per-dataset Neo4j
provisioning and server-side CSV import details. SOUP does not translate Cypher;
keep backend-specific queries separate, parameterize values, and
validate/allowlist identifiers and modes. A connection/transaction is not a
read-only policy; read-only packages must enforce a closed read-only query
surface themselves.

## Frontend SDK

Packages are Web Components within the Angular application. They do not have to
be Angular applications themselves. Import `@soup/sdk`; reuse `soup_base`
elements by tag with `soup_base` in `requires`. Other npm libraries are allowed
when declared in the package's `app/package.json` and bundled: the SDK is the
shared boundary, not a restriction that forbids all other libraries. Do not
import Angular host source or ship an independent host framework.

The host loads active bundles in dependency order and sets `data`/`context`
before connecting a visualizer element. It does not reactively push new `data`
through the same instance; use actions for interactive updates.
`defineSoupElement(tag, klass)` registers only if absent. Loaded custom-element
classes cannot be replaced in-place; upgrading an already-loaded package
requires a full browser reload.

`VisualizerContext` composes these capability interfaces:

| Interface           | Members                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `ObjectContext`     | readonly `object`, readonly `theme` (`light` / `dark`)                    |
| `ActionContext`     | `action<T = Json>(name, params?) -> Promise<T>`                           |
| `NavigationContext` | `openObject(id)`                                                          |
| `NotifyContext`     | `notify(message, level?)`; `info`, `success`, `warning`, `error`          |
| `ThumbnailContext`  | `setThumbnail(svg)`                                                       |
| `DownloadContext`   | `download(filename, mime, data)`; string, Blob, ArrayBuffer or Uint8Array |

`h(tag, {className?, text?, attrs?, on?}, ...children)` inserts text via
`textContent` and skips null/undefined children. `errorMessage(error)` preserves
safe API error details and location context. Never insert data-derived HTML/SVG
without sanitization; numerical-only thumbnail markup is an easy safe example.
`SoupVisualizerElement<D>` requires `data` and `context`; `SoupConfigElement`
requires the importer configuration context. Smaller helpers can accept a narrow
capability interface instead of the full context.

`ConfigContext` has readonly `importer`, `fields`, `columns`, `value`, plus
`preview(options) -> Promise<Block[]>`, `emit(options)` and optional
`tabular(configuration)`. The latter publishes tables/column controls to SOUP's
shared Angular tabular editor. `TabularConfiguration` contains `tables`,
optional `disabled`, and `onChange(change)`; tables describe columns, preview
rows, roles, types and editability. See the exact
[SDK types](../sdk/src/types.ts) and current
[CSV importer](../csv_table/README.md) and
[OCED importer](../oced_importer/README.md). Do not duplicate this interface for
another tabular importer. Non-tabular imports need not use it.

An importer's `config_element` replaces the generic field form. The frontend
configuration element has no backend `data` response of its own; it receives
`ConfigContext`. `preview()` requests server blocks and `emit()` publishes
options.

Standard DOM events (bubbling and composed across shadow roots):

| Event                | `detail`           |
| -------------------- | ------------------ |
| `soup-thumbnail`     | `{svg}`            |
| `soup-open-object`   | `{id}`             |
| `soup-notify`        | `{message, level}` |
| `soup-config-change` | `{value}`          |

Context helpers dispatch these events, or a component can use
`dispatchSoupEvent(target, SOUP_EVENTS.notify, {message, level})` directly.
Graph selection and table-page events belong to those components, not to this
host protocol. `context.action()` has no AbortSignal parameter; guard late
results and clean up timers/workers/listeners in `disconnectedCallback`.

## Error handling

Raise contract exceptions; the API layer converts them to its normal envelope:
`{http_status_code, message, response_data}`. For a domain error,
`response_data` carries `details` when supplied. `ValidationError` is `400`,
`ForbiddenError` `403`, `NotFoundError` `404`, `ConflictError` `409`,
`ServiceUnavailableError` `503`, and base `DomainError` `500`.

Use `ValidationError("Invalid timestamp", details={"column": "time", "row": 7})`
for actionable validation context; do not include whole input rows or
credentials. `import_phase(phase, **context)` enriches domain errors and wraps
unexpected failures, preserving causes and safe location/hint/type metadata.
JSON/CSV/Unicode parse errors are validation failures; arbitrary unexpected
failures remain `500`. Import routes add phase context and log failures with
traceback and redaction; other unexpected API failures are also logged.
`report.error` is a display block, not a substitute for raising a failed-import
exception.

On the frontend, catch action/preview failures and pass `errorMessage(error)` to
`context.notify(..., 'error')` or a visible error panel. Do not turn failures
into successful empty results. Registration/dependency errors appear in package
status; consult backend logs for the underlying failure.
