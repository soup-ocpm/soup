# Minimal package template

Run `npm run create:package` from `soup-packages/` to generate a focused
package from this template. Follow the verified
[getting-started tutorial](../docs/getting-started.md) for scaffolding,
building, ZIP installation and a manual check.

The directory starts with `_`, so discovery ignores it. Its manifest name is
`template`; `npm run pack -- _template` therefore creates
`dist/template-1.0.0.zip`, not an archive named `_template`.

| Contribution                             | Implementation                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.txt` importer `text` → `template.text` | `TextImporter` in [server/text.py](server/text.py): UTF-8 with replacement, 10 preview lines, configurable retained prefix (default 200), data in catalog metadata |
| `text` visualizer                        | `TextVisualizer`: initial text data and `stats` action                                                                                                             |
| `<soup-template-text>`                   | [app/src/index.ts](app/src/index.ts): text rendering, statistics request, numerical SVG thumbnail                                                                  |
| `stats_report` operation                 | `StatsReport`: counts, longest lines and text as a child `report`                                                                                                  |

Registration is in [server/plugin.py](server/plugin.py). There are no external
files to remove and no graph queries. The manifest has no required packages or
tools and no third-party Python requirements. `soup_base` is an optional
renderer for the operation's output report; the operation can create the report
without it. The host still needs its normal catalog provider.

The manifest defaults to **Memgraph-only** because it omits `databases`. A
copied, tested database-independent package can explicitly declare both
backends.

From `soup-packages/`:

```sh
npm run build:packages -- _template
npm run pack -- _template
```

Install dependencies with `npm ci` first. When copying, rename the manifest and
npm workspace, object kind and custom-element tag together. Contribution IDs are
scoped to the package, so the importer and visualizer may each retain `text`.

Declare optional Python libraries in the root `requirements.txt` and leave
`python_dependencies` empty. The template file initially contains comments only.
See [dependency approval](../docs/lifecycle.md#python-dependencies).
