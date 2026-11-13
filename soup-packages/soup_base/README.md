# soup_base

Database-independent shared components and report contributions. The manifest
supports Memgraph and Neo4j, requires no packages/tools and declares no
third-party Python dependencies. The frontend declares its rendering libraries
in [app/package.json](app/package.json).

- **Report** (`soup_base.report`): kind `report`, element `<soup-report-view>`.
- **Report as JSON** (`soup_base.json`): exports `name`, `description`,
  `created_at`, `blocks`.
- Reusable custom elements registered by `app/dist/index.js`.
- Optional server-side parsed-content cache, documented below.

## Consuming the shared elements

Add `soup_base` to your manifest's `requires`. The host then loads its bundle
before yours, and your frontend creates the shared elements by tag. No tool is
needed merely to render them. The complete
[records tutorial](../docs/package-development.md#5-add-the-frontend)
demonstrates this with a typed `<soup-table>` element; its manifest also
declares storage because that particular backend uses files.

Shared elements accept their block's `data` payload as a property; assigning it
again redraws. Data-derived text is inserted via text nodes. Images, including
SVG, use `<img>` URLs rather than inline untrusted markup. Markdown is parsed by
`marked` and sanitized with DOMPurify's HTML profile (no SVG/MathML/scripts).
The current package does not publish an npm typing bundle for these components;
use the documented structural interfaces or consult the source interfaces below.
Do not import Angular host source to use a shared component.

## Elements

| Tag                | Data                                                                   | Additional API                                                                             |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `soup-text`        | `{text}`                                                               | `text`, `line-numbers` attribute, `search(query)`, `matchCount`; highlights search matches |
| `soup-markdown`    | `{markdown}`                                                           | Sanitized Markdown rendering; implementation helper `renderMarkdown`                       |
| `soup-image`       | `{mime, base64}` or `{svg}`, optional `alt`                            | Accepts image MIME types; SVG stays in an image data URL                                   |
| `soup-table`       | `{columns, rows, total?}`                                              | Local/remote paging, sorting, search, visible columns                                      |
| `soup-chart`       | `{chart: 'pie' \| 'bar' \| 'line', labels, datasets: [{label, data}]}` | Chart.js instance is destroyed on disconnect                                               |
| `soup-keyvalue`    | `{items: [{key, value}]}`                                              | `variant="tiles"` displays a grid of large values with captions                            |
| `soup-file-link`   | `{filename, mime, base64}`                                             | Downloads the represented file                                                             |
| `soup-error`       | `{message}`                                                            | Displays an error block                                                                    |
| `soup-report-view` | `{blocks, name?, description?}`                                        | Renders block titles and elements; forwards context to elements that expose it             |
| `soup-graph-view`  | Graph block payload or legacy EKG rows                                 | See graph API below                                                                        |

The report view also renders import previews. Unknown block types fall back to a
warning/JSON display. `SoupReportView.registerBlock(type, tag)` and
`blockElement(type)` allow an optional package to register its own browser-side
renderer after defining its custom element. Built-in types cannot be replaced;
empty types or invalid tags fail. This browser registry does **not** extend the
core's closed nine-type report validator. A custom visualizer may provide its
own block payload, but `report.report()` and normal report object validation
still reject unknown core block types. See
[soup-report-view.ts](app/src/elements/soup-report-view.ts) for the exact
boundary.

### Table API

The table supports local numeric/text sorting with blank cells last, sticky
headers, alternate row shading, right-aligned numbers, search and column
visibility. Click or press Enter/Space on a header to cycle
ascending/descending/unsorted.

| Property          | Meaning                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `data`            | `{columns: string[], rows: unknown[][], total?: number}`; `total` beyond the loaded rows produces a truncation note |
| `columns`, `rows` | Alternative direct assignment; call `refresh()` afterwards                                                          |
| `pageSize`        | Default 25                                                                                                          |
| `loadPage`        | Optional `(query) => Promise<{rows, total}>`; query is `{offset, limit, sort: {column, direction} \| null, search}` |

Without `loadPage`, paging/sorting/search operate on loaded rows only. A remote
callback normally delegates to its visualizer's bounded
`context.action('page', query)`; the backend must implement the requested
sorting/filtering itself. Methods: `refresh()`, `goTo(page)`, `sortBy(column)`,
`setSearch(text)`, `setColumnVisible(column, visible)`. `soup-table-page`
carries `{page, total}` after each page. Source:
[soup-table.ts](app/src/elements/soup-table.ts).

## Graph API

`<soup-graph-view>` is used by the EKG visualizers and supports alternate
renderers. The default engine supplies SVG zoom/pan, node shapes, relationship
visibility, local/remote node and edge search, edge-hover endpoint highlighting,
selected-node properties and SVG export. Package-specific exploration/editing is
not built into this component; optional consumers can use the renderer
interface.

### Data conversion

Accepted data shapes:

- Graph payload
  `{nodes: [{id, label, group, props}], edges: [{id, source, target, label, group, props}], directed}`.
  Edge type comes from `group`, falling back to `label`; weight comes from
  `props.weight`, default 1.
- Legacy EKG rows `[{node_source, edge, node_target}]`. Node captions come from
  `ActivityName`; relationship type from `relation`, falling back to `Type`;
  weight from `edge_weight`. Legacy `Timestamp` display is formatted for the UI.

`toGraphModel(data)` converts these to `GraphModel` with typed node/edge models.
Nodes are deduplicated by ID (first wins), edges referencing unknown nodes are
ignored, and received data is not modified. See
[model.ts](app/src/graph/model.ts).

### Properties and attributes

| Property                     | Behavior                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `data`                       | Resets selection on new data; relationship colors/hidden types remain in the palette                                                                   |
| `context`                    | Optional notification capability; a full `VisualizerContext` is accepted                                                                               |
| `search`                     | Optional remote `(query, target: 'nodes' \| 'edges', offset, limit) => Promise<{items, total}>`; pages have 50 items, with more requested by scrolling |
| `nodeDetails`                | Optional `(id) => Promise<GraphNodeModel \| null>`; replaces displayed properties only if that node is still selected; null keeps local properties     |
| `renderer`                   | Custom `GraphRenderer` instance, overriding the `engine` attribute                                                                                     |
| `thumbnail`                  | Default true; emits the SVG after new data when below 512 KiB                                                                                          |
| `toolbar`                    | `full`, `none`, or chosen commands: `shape`, `relationships`, `search`, `export`, `counts`; displayed in standard grouped order                        |
| `searchVisible`              | Whether the search panel is open                                                                                                                       |
| `palette`                    | Relationship/node-group color and relationship visibility state                                                                                        |
| `model`, `selected`, `shape` | Current model, selection and node shape; use public selection/shape methods for updates                                                                |

The default `engine` is `dagre`. The `toolbar` attribute accepts `full`, `none`,
or space/comma-separated commands and ignores unknown commands; the property
wins. Use `toolbar='none'` when the surrounding visualizer supplies its own
toolbar.

CSS variable `--soup-graph-height` overrides the drawing area. Current desktop
fallback: `clamp(520px, calc(100dvh - 160px), 1400px)`. Below 768 px it becomes
`clamp(360px, 70dvh, 800px)` and the side panel stacks below the graph. The
default renderer auto-fits initial/new data and container resizes until user
zoom/pan takes ownership of the camera. Edge label backgrounds are part of
exported SVG too.

### Methods and events

| Method                                    | Behavior                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `setNodeShape('rect' \| 'circle')`        | Change shape                                                                   |
| `setRelationshipVisible(type, visible)`   | Toggle a relationship type                                                     |
| `highlight(ids, on)`                      | Toggle node highlights                                                         |
| `selectNode(id \| null)`                  | Select a local/search-result node; repeat the same ID or pass null to deselect |
| `openSearch(open?)`                       | Explicitly open/close; omission toggles                                        |
| `toolbarCommands()`                       | Current ordered toolbar commands                                               |
| `runSearch(query, target?)`, `loadMore()` | Search and request another page                                                |
| `exportSvg() -> string`                   | Standalone SVG document                                                        |
| `downloadSvg(filename='graph.svg')`       | Download the current SVG                                                       |

`soup-node-select` carries `{id, node}` (both null on deselection);
`soup-thumbnail` carries `{svg}`. Remote search and detail responses are guarded
against stale selections/requests. Without callbacks, search uses captions, IDs,
types and property values in the loaded model. Source:
[soup-graph-view.ts](app/src/graph/soup-graph-view.ts).

### Renderer boundary

`RelationshipPalette` survives redraws and keeps colors by relationship type and
node group, independently of the engine. A `GraphRenderer` implements:

```text
mount(container: HTMLElement): void
render(model: GraphModel, options: RenderOptions): void
setNodeShape(shape: 'rect' | 'circle'): void
setRelationshipVisible(type: string, visible: boolean): void
setHighlighted(ids: readonly string[], on: boolean): void
clear(): void
exportSvg(): string
onNodeClick: ((id: string) => void) | null
destroy(): void
```

`RenderOptions` has `palette`, `shape` and optional `direction: 'LR' | 'TB'`.
`SoupGraphView.registerRenderer(name, factory)` registers a factory for the
`engine` attribute; assigning an instance to `view.renderer` avoids global
engine registration. Interfaces are in [renderer.ts](app/src/graph/renderer.ts).

The default `DagreGraphRenderer` uses the package's pinned `@dagrejs/dagre`
3.1.1, D3 and one SVG/transform group (`g.node`, `g.edgePath`, `g.edgeLabel`).
Shapes, colors, arrows and SVG styling belong to the renderer, not to graph
server queries. Redraws remain in the same zoomed group. Initial fit uses the
zoom transform, relationship weights survive hide/show, one-weight graphs have a
valid width, and node deduplication uses a Map rather than pairwise serialized
comparisons. These implementation properties replace the former GraphComponent's
duplication, mutation and camera-reset problems. Historical claims of particular
crossing-count improvements are not reproducible from current source alone.

## Checks

From `soup-packages/`, focused existing tests include:

```sh
npm test -- soup_base/app/test/graph-model.test.ts soup_base/app/test/dagre-renderer.test.ts
```

The broader `npm test` suite also covers palette, tables, reports and graph
selection with test renderers. Some older UI assertions still expect Italian
labels and cannot be claimed passing against the English UI without correction.
A real-browser graph specification exists at
[soup-graph-view.spec.ts](../../soup-app/e2e/soup-graph-view.spec.ts); it
requires its configured application/backend environment and was not run for this
docs change.

## Parsed-content cache

The server-side public API `soup_pkg_soup_base.api` exports `ParsedCache`,
`limits_from_env`, `DEFAULT_MAX_OBJECTS` and `DEFAULT_MAX_BYTES`. A consumer
imports these only with `soup_base` in its manifest `requires`. No tool is
accessed just by using this in-memory cache.

`ParsedCache(size_of, max_objects=8, max_bytes=200*1024*1024)` takes a
size-estimate callable. `get(key, load)` loads a missing value outside the lock;
`invalidate(key)` and `clear()` prevent a concurrent stale load from being
cached. Entries use LRU eviction by object count and estimated bytes; an
oversized value is returned but not cached. `keys()`, `total_bytes`,
`len(cache)` and membership inspect the cache. Own it per plugin instance and
share it across that instance's contributions; clear it on shutdown and
invalidate on writes/disposal.

`limits_from_env(env, prefix) -> (max_objects, max_bytes)` reads
`<prefix>_CACHE_OBJECTS` and `<prefix>_CACHE_MB`, requiring positive integers.
[Text](../text/README.md), [CSV tables](../csv_table/README.md) and
[OCEL](../ocel/README.md) document their own settings. This avoids repeated
parsing and file transfers, particularly with Docker storage's per-read archive
copy.
