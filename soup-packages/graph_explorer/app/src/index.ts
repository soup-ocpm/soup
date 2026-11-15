import {
  defineSoupElement,
  errorMessage,
  h,
  type VisualizerContext,
} from "@soup/sdk";
import type { SoupGraphView } from "../../../soup_base/app/src/graph/soup-graph-view";
import { toGraphModel } from "../../../soup_base/app/src/graph/model";
import { ExplorerCanvas } from "./canvas";
import { Layout } from "./layout";
import { queryPanel, queryParams, type Schema } from "./query";
import {
  aggregate,
  analytics,
  assignDefaults,
  copy,
  csv,
  labelsOf,
  merge,
  newScene,
  range,
  upgrade,
  visible,
  type Scene,
} from "./scene";
import { stylePanel } from "./styling";
import {
  button,
  chips,
  field,
  group,
  hint,
  select,
  toggled,
} from "./ui";

interface Data {
  backend: string;
  graph: unknown;
  schema?: Schema;
}
interface Saved {
  id: string;
  dataset: string;
  version: number;
  scene: Scene;
}
type Tab = "search" | "style" | "filter" | "insights" | "scenes";
const TABS: [Tab, string][] = [
  ["search", "Explore"],
  ["style", "Appearance"],
  ["filter", "Filters"],
  ["insights", "Analyze"],
  ["scenes", "Scenes"],
];
const CSS = `
:host{display:block;position:relative;padding:8px;border-radius:8px;font:14px system-ui;color:var(--soup-text,#243447);--ge-panel:var(--soup-surface,#fff);--ge-border:var(--soup-border,#c5ced8);--ge-accent:#d88712}
:host([data-theme=dark]){background:#151c27;color:#e7edf5;--ge-panel:#202a38;--ge-border:#536071;color-scheme:dark}
*{box-sizing:border-box}[hidden]{display:none!important}
button,input,select{font:inherit;color:inherit;border:1px solid var(--ge-border);border-radius:5px;padding:5px 8px;background:var(--ge-panel)}
button{cursor:pointer}button:hover{border-color:var(--ge-accent)}button:disabled{opacity:.5}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--ge-accent);outline-offset:1px}
button.primary{background:var(--ge-accent);border-color:var(--ge-accent);color:#fff}
input[type=color]{padding:1px;height:30px;width:42px;cursor:pointer}input[type=checkbox]{width:auto}
label{display:flex;flex-direction:column;gap:3px;margin:6px 0}input,select{min-width:0;width:100%}
.bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}.bar .sep{width:1px;align-self:stretch;background:var(--ge-border)}.bar .grow{flex:1}
.seg{display:inline-flex}.seg button{border-radius:0;margin-left:-1px}.seg button:first-child{border-radius:5px 0 0 5px;margin-left:0}.seg button:last-child{border-radius:0 5px 5px 0}
[aria-pressed=true]{background:color-mix(in srgb,var(--ge-accent) 22%,var(--ge-panel));border-color:var(--ge-accent)}
.export{position:relative}.export summary{cursor:pointer;padding:5px 8px;border:1px solid var(--ge-border);border-radius:5px;list-style:none}.export .pop{position:absolute;right:0;z-index:6;display:flex;flex-direction:column;gap:4px;padding:8px;background:var(--ge-panel);border:1px solid var(--ge-border);border-radius:6px;box-shadow:0 3px 20px #0005}
.statusbar{display:flex;gap:8px;align-items:center;min-height:30px}.status{white-space:pre-wrap;flex:1}.counts{font-size:12px;opacity:.8}
.layout{display:grid;grid-template-columns:330px minmax(0,1fr);gap:10px}
.panel{display:flex;flex-direction:column;border:1px solid var(--ge-border);border-radius:8px;background:var(--ge-panel);max-height:calc(100dvh - 170px);min-height:500px;min-width:0}
.tabs{display:flex;border-bottom:1px solid var(--ge-border)}.tabs button{flex:1;border:0;border-bottom:2px solid transparent;border-radius:0;padding:8px 4px;background:none}.tabs [aria-selected=true]{border-bottom-color:var(--ge-accent);font-weight:600}
.body{overflow:auto;padding:10px}.group{margin:0 0 14px}.group h3{margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;opacity:.75}
.hint,small{font-size:12px;opacity:.8;line-height:1.5;margin:4px 0}.summary{font-size:13px;opacity:1}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.chips{display:flex;flex-wrap:wrap;gap:5px}.chip{border-left:6px solid var(--ge-border);border-radius:14px;padding:2px 9px;font-size:12px}
.condition,.rule-card{border:1px solid var(--ge-border);border-radius:6px;padding:6px 8px;margin:6px 0}.rule-head,.rule-effect{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.rule-head input{width:auto}.rule-head strong{flex:1}.rule-effect label{flex:1}
.badge{font-size:11px;opacity:.8}.preview{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:26px;border-radius:13px;color:#fff;font-size:12px;text-shadow:0 0 2px #0008}
.swatches{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}.swatch{width:18px;height:18px;border-radius:50%;padding:0}
.category{display:flex;align-items:center;gap:6px;margin:5px 0}.category label{margin:0}.category .label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.category .name{flex:1;overflow-wrap:anywhere;font-size:13px}.category input[type=number]{width:60px}.category select{width:100px}
details{padding:4px 0}summary{font-weight:600;cursor:pointer}
.work{position:relative;min-width:0}soup-graph-view{--soup-graph-height:clamp(500px,calc(100dvh - 190px),1400px);color-scheme:inherit}
.selbar{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:3;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100% - 190px);padding:6px 8px;background:var(--ge-panel);border:1px solid var(--ge-border);border-radius:8px;box-shadow:0 3px 16px #0004}
.selbar .count{font-weight:600}.selbar .options{flex-basis:100%}
.inspector{position:absolute;top:8px;right:8px;z-index:3;width:270px;max-height:60%;overflow:auto;padding:8px;background:var(--ge-panel);border:1px solid var(--ge-border);border-radius:8px;box-shadow:0 3px 16px #0004;overflow-wrap:anywhere}
.inspector header{display:flex;align-items:center;justify-content:space-between}
.menu{position:absolute;z-index:5;display:flex;flex-direction:column;gap:4px;background:var(--ge-panel);padding:8px;box-shadow:0 3px 20px #0005;border:1px solid var(--ge-border);border-radius:6px}
table{width:100%;font-size:12px}td,th{text-align:left;padding:3px}
/* Compact Bloom-inspired exploration controls: the graph remains the focal point. */
:host{--ge-accent:var(--soup-primary,#397fbd)}
.layout{grid-template-columns:minmax(280px,310px) minmax(0,1fr);gap:12px}
.panel{border-radius:12px;box-shadow:0 2px 12px #0000000c;min-height:540px}
.tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px;padding:4px;border-bottom:1px solid var(--ge-border)}
.tabs button{font-size:12px;padding:10px 2px;white-space:nowrap;border-radius:6px 6px 0 0}
.body{padding:14px;scrollbar-width:thin}
.group{margin-bottom:20px}.group h3{font-size:12px;letter-spacing:.06em;margin-bottom:9px}
.ge-presets{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.ge-presets button{white-space:normal;min-height:40px;text-align:center}
.ge-presets button:first-child{grid-column:1/-1}
.chips{gap:6px}.chip{font-size:12px;line-height:1.4;padding:5px 10px;border-radius:18px}
.condition,.rule-card{padding:12px;border-radius:9px;background:color-mix(in srgb,var(--ge-panel) 94%,var(--ge-border))}
.ge-disclosure{border:1px solid var(--ge-border);border-radius:9px;padding:10px 12px;margin:12px 0}
.ge-disclosure>summary{font-size:13px;list-style-position:inside;outline-offset:4px}
.ge-disclosure[open]>summary{padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid var(--ge-border)}
.ge-category{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:8px;align-items:center;margin:0;padding:8px 2px;border-bottom:1px solid var(--ge-border)}
.ge-category>.name{font-size:13px;font-weight:600}.ge-category>.ge-count{font-size:11px;opacity:.7}
.ge-category>label{margin:0}.ge-category input[type=color]{width:36px;height:32px;border-radius:8px;padding:2px}
.ge-category-more{grid-column:1/-1}.ge-category-more>summary{font-weight:400;font-size:11px;opacity:.75;text-align:right}
.ge-category-more[open]{padding:5px 0 8px}.ge-category-more label{margin-top:9px}
.bar{gap:7px;padding:5px 0}.bar button{min-height:32px}
.work{border:1px solid var(--ge-border);border-radius:12px;overflow:hidden;background:var(--ge-panel)}
@media(max-width:850px){.layout{grid-template-columns:1fr}.panel{max-height:none;min-height:0}soup-graph-view{--soup-graph-height:65dvh}.selbar{max-width:calc(100% - 20px)}}
`;

export class GraphExplorer extends HTMLElement {
  public data!: Data;
  public context!: VisualizerContext;
  public scene!: Scene;
  private readonly root = this.attachShadow({ mode: "open" });
  private readonly layout = new Layout();
  private canvas!: ExplorerCanvas;
  private view!: SoupGraphView;
  private tabs!: HTMLElement;
  private body!: HTMLElement;
  private status!: HTMLElement;
  private counts!: HTMLElement;
  private cancelButton!: HTMLButtonElement;
  private selbar!: HTMLElement;
  private selectionCount!: HTMLElement;
  private typeChips!: HTMLElement;
  private inspector!: HTMLElement;
  private inspected!: HTMLElement;
  private undo: Scene[] = [];
  private redo: Scene[] = [];
  private request = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private saved: { id: string; name: string }[] = [];
  private sceneId = "";
  private scenesGeneration = 0;
  private pending = false;
  private tab: Tab = "search";
  private schema: Schema = { labels: [], types: [] };
  private readonly search = { text: "", property: "" };
  private readonly expand = {
    direction: "both",
    types: [] as string[],
    depth: 1,
    limit: 200,
  };
  private table: HTMLElement | null = null;

  public connectedCallback(): void {
    if (this.view) return;
    this.schema = this.data.schema ?? this.schema;
    this.scene = newScene(toGraphModel(this.data.graph));
    this.setAttribute("data-theme", this.context.theme);
    this.canvas = new ExplorerCanvas(this.scene);
    this.canvas.onBefore = () => this.remember();
    this.canvas.onSelect = () => this.inspect();
    this.canvas.onMenu = (event) => this.menu(event);
    this.view = document.createElement("soup-graph-view") as SoupGraphView;
    this.view.toolbar = "none";
    this.view.thumbnail = false;
    this.view.context = this.context;
    this.view.renderer = this.canvas;
    this.root.replaceChildren(
      h("style", { text: CSS }),
      this.toolbar(),
      this.statusBar(),
      h(
        "div",
        { className: "layout" },
        this.sidebar(),
        h("div", { className: "work" }, this.view, this.selectionBar(), this.inspectorPanel()),
      ),
    );
    this.root.addEventListener("keydown", (event) =>
      this.keys(event as KeyboardEvent),
    );
    this.controls();
    this.show();
    void this.scenes();
    this.message(
      `${this.data.backend} · Choose a graph preset or configure a read-only query in Explore.`,
    );
  }
  public disconnectedCallback(): void {
    this.cancel();
    this.pause();
    this.layout.stop();
    this.canvas?.destroy();
  }
  private toolbar(): HTMLElement {
    const sep = (): HTMLElement => h("span", { className: "sep" });
    return h(
      "div",
      { className: "bar", attrs: { role: "toolbar", "aria-label": "Graph Explorer" } },
      button("Undo", () => this.history(false)),
      button("Redo", () => this.history(true)),
      sep(),
      button("Fit", () => {
        this.remember();
        this.canvas.fit();
      }),
      button("Reapply hierarchy", () => {
        this.remember();
        this.arrange();
      }),
      this.modes(),
      sep(),
      button("Show all", () =>
        this.change(() => {
          this.scene.hidden = [];
        }),
      ),
      h("span", { className: "grow" }),
      this.exportMenu(),
    );
  }
  private modes(): HTMLElement {
    const modes: [string, string][] = [
      ["select", "Select"],
      ["box", "Box"],
      ["lasso", "Lasso"],
    ];
    const buttons = modes.map(([mode, label]) =>
      h("button", {
        text: label,
        attrs: {
          type: "button",
          title: `${label} mode`,
          "aria-pressed": String(mode === this.canvas.mode),
        },
        on: {
          click: () => {
            this.canvas.mode = mode;
            buttons.forEach((b, i) =>
              b.setAttribute("aria-pressed", String(modes[i][0] === mode)),
            );
          },
        },
      }),
    );
    return h(
      "div",
      { className: "seg", attrs: { role: "group", "aria-label": "Selection mode" } },
      ...buttons,
    );
  }
  private exportMenu(): HTMLElement {
    return h(
      "details",
      { className: "export" },
      h("summary", { text: "Export" }),
      h(
        "div",
        { className: "pop" },
        button("PNG", () => void this.exportPng()),
        button("JSON", () =>
          this.context.download(
            this.filename("json"),
            "application/json",
            JSON.stringify(this.scene, null, 2),
          ),
        ),
        button("CSV", () => this.exportCsv()),
      ),
    );
  }
  private statusBar(): HTMLElement {
    this.status = h("div", {
      className: "status",
      attrs: { role: "status", "aria-live": "polite" },
    });
    this.counts = h("span", { className: "counts" });
    this.cancelButton = button("Cancel request", () => this.cancel());
    this.cancelButton.hidden = true;
    return h("div", { className: "statusbar" }, this.status, this.counts, this.cancelButton);
  }
  private sidebar(): HTMLElement {
    this.tabs = h("div", { className: "tabs", attrs: { role: "tablist", "aria-label": "Explorer panels" } });
    this.body = h("div", { className: "body", attrs: { role: "tabpanel" } });
    return h("aside", { className: "panel", attrs: { "aria-label": "Explorer panel" } }, this.tabs, this.body);
  }
  private controls(): void {
    this.tabs.replaceChildren(
      ...TABS.map(([id, label]) =>
        h("button", {
          text: label,
          attrs: { type: "button", role: "tab", "aria-selected": String(id === this.tab) },
          on: {
            click: () => {
              this.tab = id;
              this.controls();
            },
          },
        }),
      ),
    );
    this.body.replaceChildren(this.panelFor(this.tab));
    this.renderTypeChips();
  }
  private panelFor(tab: Tab): HTMLElement {
    switch (tab) {
      case "search":
        return queryPanel({
          scene: this.scene,
          schema: this.schema,
          search: this.search,
          refresh: () => this.controls(),
          run: (replace) => void this.load(replace ? "query" : "query-add"),
          find: () => void this.load("find"),
        });
      case "style":
        return stylePanel({
          scene: this.scene,
          begin: () => this.remember(),
          preview: () => this.preview(),
          refresh: () => {
            this.preview();
            this.controls();
          },
        });
      case "filter":
        return this.filterPanel();
      case "insights":
        return this.insightsPanel();
      default:
        return this.sceneControls();
    }
  }
  private filterPanel(): HTMLElement {
    const f = this.scene.filter;
    const names = (labels: boolean): string[] =>
      [...new Set(labels ? this.scene.graph.nodes.flatMap(labelsOf) : this.scene.graph.edges.map((e) => e.type))].sort();
    const list = (value: string): string[] => value.split(",").map((x) => x.trim()).filter(Boolean);
    const toggle = (key: "labels" | "types") => (name: string): void =>
      this.change(() => {
        f[key] = toggled(list(f[key]), name).join(",");
      }, true);
    const text = (key: "property" | "text" | "min" | "max", label: string): HTMLElement =>
      field(label, f[key], (value) =>
        this.change(() => {
          f[key] = value;
        }),
      );
    return h(
      "div",
      { className: "tab" },
      group(
        "Show only",
        hint("Pick types to keep; none selected shows everything."),
        chips("Node type", names(true).map((name) => ({ name })), list(f.labels), toggle("labels")),
        chips("Relationship type", names(false).map((name) => ({ name })), list(f.types), toggle("types")),
      ),
      group(
        "Property condition",
        select("Applies to", [["nodes", "Nodes"], ["edges", "Relationships"]], f.scope, (value) =>
          this.change(() => {
            f.scope = value === "edges" ? "edges" : "nodes";
          }),
        ),
        text("property", "Property"),
        text("text", "Contains"),
        text("min", "Minimum (number or ISO datetime)"),
        text("max", "Maximum (number or ISO datetime)"),
        select("Filter mode", [["hide", "Hide the rest"], ["dim", "Dim the rest"]], f.mode, (value) =>
          this.change(() => {
            f.mode = value;
          }),
        ),
      ),
      group("Time slicer", ...this.slicerControls()),
    );
  }
  private insightsPanel(): HTMLElement {
    return h(
      "div",
      { className: "tab" },
      group(
        "Groups",
        hint("Select nodes and use Group selection in the bar over the canvas."),
        button("Group by label", () => this.groupLabels()),
        button("Ungroup all", () =>
          this.change(() => {
            this.scene.groups = {};
          }),
        ),
      ),
      group(
        "Scene analytics",
        hint("Degree, undirected PageRank and label-propagation communities on visible loaded nodes; not database-wide GDS."),
        button("Calculate", () => this.analyze()),
        (this.table = h("div")),
      ),
    );
  }
  private slicerControls(): HTMLElement[] {
    const s = this.scene.slicer;
    const slider = h("input", {
      attrs: { type: "range", min: "0", max: "100", step: "0.1", "aria-label": "Slicer cursor" },
      on: {
        input: (event) => {
          s.cursor = Number((event.target as HTMLInputElement).value);
          this.show();
          this.slicerStatus();
        },
      },
    });
    slider.value = String(s.cursor);
    return [
      field("Slicer property", s.property, (v) =>
        this.change(() => {
          s.property = v;
          this.slicerStatus();
        }),
      ),
      select("Slicer value type", ["numeric", "datetime"], s.temporal ? "datetime" : "numeric", (v) =>
        this.change(() => {
          s.temporal = v === "datetime";
          this.slicerStatus();
        }),
      ),
      select("Slicer", ["off", "on"], s.enabled ? "on" : "off", (v) =>
        this.change(() => {
          s.enabled = v === "on";
        }),
      ),
      field("Window width (%)", s.width, (v) =>
        this.change(() => {
          s.width = Math.max(0.1, Math.min(100, Number(v) || 10));
        }), "number"),
      h("label", { text: "Scrub" }, slider),
      h("div", { attrs: { id: "slicer-range" }, className: "hint" }),
      this.playback(slider),
    ];
  }
  private playback(slider: HTMLInputElement): HTMLElement {
    const s = this.scene.slicer;
    return button("Play / pause", () => {
      if (this.timer) this.pause();
      else {
        this.remember();
        s.enabled = true;
        this.timer = setInterval(() => {
          s.cursor = s.cursor >= 100 ? 0 : s.cursor + 1;
          slider.value = String(s.cursor);
          this.show();
          this.slicerStatus();
        }, 150);
      }
    });
  }
  private slicerStatus(): void {
    const label = this.root.querySelector("#slicer-range");
    if (!label) return;
    const [min, max] = range(this.scene),
      s = this.scene.slicer,
      start = min + ((max - min) * s.cursor) / 100,
      end = start + ((max - min) * s.width) / 100;
    const format = (n: number): string =>
      s.temporal ? new Date(n).toISOString() : n.toFixed(2);
    label.textContent = `${format(start)} – ${format(end)} · loaded scene only`;
  }
  private pause(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  private sceneControls(): HTMLElement {
    const choose = h(
      "select",
      {
        attrs: { "aria-label": "Saved scene" },
        on: {
          change: (e) => {
            this.sceneId = (e.target as HTMLSelectElement).value;
          },
        },
      },
      h("option", { text: "Choose a saved scene", attrs: { value: "" } }),
      ...this.saved.map((s) => h("option", { text: s.name, attrs: { value: s.id } })),
    );
    choose.value = this.sceneId;
    return h(
      "div",
      { className: "tab" },
      group(
        "Scenes",
        hint("A scene keeps the loaded graph, positions, styles, filters and camera in SOUP application storage."),
        field("Scene name", this.scene.name, (v) => {
          this.scene.name = v;
        }),
        choose,
        h(
          "div",
          { className: "actions" },
          button("Save", () => void this.save(false), "primary"),
          button("Duplicate", () => void this.save(true)),
          button("Load", () => void this.restore()),
          button("Delete saved scene", () => void this.removeScene()),
        ),
      ),
      h(
        "details",
        {},
        h("summary", { text: "Keyboard shortcuts" }),
        hint("Shift-click: multi-select. Drag nodes: move selection. Blank drag: pan. Wheel: zoom. Ctrl/Cmd+A: select nodes. Delete: hide. Escape: clear/cancel. Ctrl/Cmd+Z / Shift+Z: undo/redo. E: expand. F: fit."),
      ),
    );
  }
  private selectionBar(): HTMLElement {
    this.selectionCount = h("span", { className: "count" });
    this.selbar = h(
      "div",
      { className: "selbar", attrs: { role: "toolbar", "aria-label": "Selection actions" } },
      this.selectionCount,
      button("Expand", () => void this.load("expand"), "primary"),
      button("Reveal connections", () => void this.load("reveal")),
      button("Find path", () => void this.load("path")),
      button("Hide", () => this.hide()),
      button("Pin / unpin selection", () => this.pin()),
      button("Group selection", () => this.group()),
      button("Ungroup selection", () => this.ungroup()),
      this.expandOptions(),
    );
    return this.selbar;
  }
  private expandOptions(): HTMLElement {
    this.typeChips = h("div");
    return h(
      "details",
      { className: "options" },
      h("summary", { text: "Expansion options" }),
      select("Direction", ["both", "out", "in"], this.expand.direction, (value) => {
        this.expand.direction = value;
      }),
      this.typeChips,
      field("Depth (1–6)", this.expand.depth, (value) => {
        this.expand.depth = Math.max(1, Math.min(6, Number(value) || 1));
      }, "number"),
      field("Result limit (1–1,000)", this.expand.limit, (value) => {
        this.expand.limit = Math.max(1, Math.min(1000, Number(value) || 200));
      }, "number"),
    );
  }
  private renderTypeChips(): void {
    const names = [
      ...new Set([...this.schema.types.map((t) => t.name), ...this.scene.graph.edges.map((e) => e.type)]),
    ].sort();
    this.typeChips.replaceChildren(
      hint("Follow only these relationship types (none selected follows all)."),
      chips("Expand along", names.map((name) => ({ name })), this.expand.types, (name) => {
        this.expand.types = toggled(this.expand.types, name);
        this.renderTypeChips();
      }),
    );
  }
  private inspectorPanel(): HTMLElement {
    this.inspected = h("div");
    this.inspector = h(
      "aside",
      { className: "inspector", attrs: { "aria-label": "Inspector" } },
      h(
        "header",
        {},
        h("strong", { text: "Inspector" }),
        button("Close", () => {
          this.scene.selection = [];
          this.inspect();
          this.canvas.draw();
        }),
      ),
      this.inspected,
    );
    return this.inspector;
  }
  private remember(): void {
    this.layout.stop();
    this.undo.push(copy(this.scene));
    if (this.undo.length > 20) this.undo.shift();
    this.redo = [];
  }
  private change(run: () => void, refresh = false): void {
    this.remember();
    run();
    this.show();
    if (refresh) this.controls();
  }
  private history(forward: boolean): void {
    this.cancel();
    this.pause();
    const source = forward ? this.redo : this.undo,
      destination = forward ? this.undo : this.redo,
      next = source.pop();
    if (next) {
      destination.push(copy(this.scene));
      this.setScene(next);
    }
  }
  private setScene(next: Scene): void {
    this.layout.stop();
    this.scene = next;
    this.canvas.scene = next;
    this.controls();
    this.show();
  }
  private displayed(): ReturnType<typeof aggregate> {
    const graph = aggregate(this.scene, visible(this.scene));
    graph.edges = graph.edges.filter((e) => !this.scene.hidden.includes(e.id));
    return graph;
  }
  /** Styling changes only repaint: zoom, pan and selection are untouched. */
  private preview(): void {
    this.canvas.draw();
    this.summarize(this.displayed());
  }
  private summarize(graph: ReturnType<typeof aggregate>): void {
    const hidden = this.scene.hidden.length;
    this.counts.textContent =
      `${graph.nodes.length}/${this.scene.graph.nodes.length} nodes · ${graph.edges.length} relationships` +
      (hidden ? ` · ${hidden} hidden` : "");
  }
  private show(): void {
    const graph = this.displayed();
    this.view.data = {
      ...graph,
      edges: graph.edges.map((e) => ({ ...e, group: e.type })),
    };
    this.summarize(graph);
    this.inspect();
  }
  private arrange(fit = false): void {
    this.layout.run(this.scene, this.displayed(), (points) => {
      Object.assign(this.scene.positions, points);
      this.canvas.draw();
      if (fit) this.canvas.fit();
    });
  }
  private inspect(): void {
    if (!this.inspected) return;
    const selected = new Set(this.scene.selection),
      graph = this.displayed();
    const items = [...graph.nodes, ...graph.edges].filter((item) => selected.has(item.id));
    this.selbar.hidden = !selected.size;
    this.inspector.hidden = !selected.size;
    this.selectionCount.textContent = `${selected.size} selected`;
    const name = (id: string): string => graph.nodes.find((n) => n.id === id)?.label ?? id;
    this.inspected.replaceChildren(
      h("small", { text: "All properties are read-only." }),
      ...items.slice(0, 10).map((item) => {
        const view = document.createElement("soup-keyvalue") as HTMLElement & { data: unknown };
        view.style.color = "inherit";
        const values = {
          identity: item.id,
          ...("source" in item
            ? { from: name(item.source), to: name(item.target), type: item.type }
            : {
                labels: item.group,
                loaded_connections: graph.edges.filter(
                  (e) => e.source === item.id || e.target === item.id,
                ).length,
              }),
          ...item.props,
        };
        view.data = {
          items: Object.entries(values).map(([key, value]) => ({ key, value })),
        };
        return h("div", {}, h("strong", { text: item.label }), view);
      }),
    );
  }
  private selectedNodes(): string[] {
    const chosen = new Set(
      this.scene.selection.flatMap((id) =>
        id.startsWith("group:") ? (this.scene.groups[id.slice(6)] ?? []) : [id],
      ),
    );
    return this.scene.graph.nodes
      .filter((n) => chosen.has(n.id))
      .map((n) => n.id)
      .slice(0, 50);
  }
  private parameters(action: string, ids: string[]): Record<string, unknown> {
    if (action === "query" || action === "query-add")
      return queryParams(this.scene.query);
    if (action === "refresh")
      return this.scene.lastQuery
        ? queryParams(this.scene.lastQuery)
        : { limit: this.expand.limit };
    if (action === "find")
      return {
        text: this.search.text,
        property: this.search.property,
        labels: this.scene.query.labels,
        limit: this.scene.query.limit,
      };
    return {
      ids,
      direction: this.expand.direction,
      types: this.expand.types,
      limit: this.expand.limit,
      ...(action !== "reveal" ? { depth: this.expand.depth } : {}),
    };
  }
  private current(request: number): boolean {
    return request === this.request && this.isConnected;
  }
  private setPending(value: boolean): void {
    this.pending = value;
    this.cancelButton.hidden = !value;
  }
  private serverAction(action: string): string {
    if (action === "find") return "sample";
    if (action === "refresh") return this.scene.lastQuery ? "query" : "sample";
    return action === "query-add" ? "query" : action;
  }
  private async load(action: string): Promise<void> {
    if (this.pending) {
      this.message("A request is running. Cancel it before starting another.");
      return;
    }
    const ids = this.selectedNodes();
    if (["expand", "reveal", "path"].includes(action) && !ids.length) {
      this.message("Select at least one node.");
      return;
    }
    const request = ++this.request;
    this.setPending(true);
    this.message(`Loading ${action === "find" ? "matches" : action.replace("-add", "")}…`);
    try {
      const result = await this.context.action<Record<string, unknown>>(
        this.serverAction(action),
        this.parameters(action, ids),
      );
      if (!this.current(request)) return;
      this.remember();
      this.applyResult(action, result);
    } catch (error) {
      if (this.current(request)) this.message(errorMessage(error));
    } finally {
      if (request === this.request) this.setPending(false);
    }
  }
  private applyResult(action: string, result: Record<string, unknown>): void {
    const replace = action === "query" || action === "refresh";
    if (replace) {
      this.scene.graph = toGraphModel(result);
      this.scene.positions = {};
      this.scene.groups = {};
      this.scene.hidden = [];
      this.scene.selection = [];
      if (action === "query") this.scene.lastQuery = copy(this.scene.query);
    } else merge(this.scene, toGraphModel(result));
    assignDefaults(this.scene);
    this.show();
    this.controls();
    this.arrange(replace);
    const found = `${result["nodes"] instanceof Array ? result["nodes"].length : 0} nodes`;
    this.message(
      String(
        result["message"] ??
          (result["truncated"]
            ? `Result capped at ${found}. Add conditions or limit the types to narrow it.`
            : `Loaded ${found}. Visualization changes remain scene-only.`),
      ),
    );
  }
  private cancel(): void {
    this.request++;
    this.layout.stop();
    if (this.status) {
      this.setPending(false);
      this.message("Results discarded. A bounded server read already running may finish.");
    }
  }
  private message(text: string): void {
    this.status.textContent = text;
  }
  private hide(): void {
    this.change(() => {
      this.scene.hidden = [
        ...new Set([
          ...this.scene.hidden,
          ...this.scene.selection.flatMap((id) =>
            id.startsWith("group:") ? (this.scene.groups[id.slice(6)] ?? []) : [id],
          ),
        ]),
      ];
      this.scene.selection = [];
    });
  }
  private pin(): void {
    this.change(() => {
      for (const id of this.scene.selection)
        this.scene.pins = this.scene.pins.includes(id)
          ? this.scene.pins.filter((x) => x !== id)
          : [...this.scene.pins, id];
    });
  }
  private group(): void {
    const ids = this.selectedNodes();
    if (ids.length < 2) {
      this.message("Select at least two nodes to group.");
      return;
    }
    this.change(() => {
      const name = `Group ${Object.keys(this.scene.groups).length + 1}`;
      this.scene.groups[name] = ids;
      this.scene.selection = [`group:${name}`];
    });
  }
  private groupLabels(): void {
    this.change(() => {
      const groups = new Map<string, string[]>();
      this.scene.graph.nodes.forEach((n) => {
        const key = n.group || "Unlabeled";
        groups.set(key, [...(groups.get(key) ?? []), n.id]);
      });
      this.scene.groups = Object.fromEntries(groups);
    });
  }
  private ungroup(): void {
    this.change(() => {
      this.scene.selection.forEach((id) => {
        if (id.startsWith("group:")) delete this.scene.groups[id.slice(6)];
      });
      this.scene.selection = [];
    });
  }
  private analyze(): void {
    const graph = visible(this.scene),
      result = analytics(graph);
    this.table?.replaceChildren(
      h(
        "table",
        {},
        h(
          "thead",
          {},
          h("tr", {}, ...["Node", "Degree", "Rank", "Community"].map((text) => h("th", { text }))),
        ),
        h(
          "tbody",
          {},
          ...graph.nodes
            .slice()
            .sort((a, b) => result[b.id].rank - result[a.id].rank)
            .slice(0, 100)
            .map((n) =>
              h(
                "tr",
                {},
                ...[n.label, result[n.id].degree, result[n.id].rank.toFixed(4), result[n.id].community].map(
                  (value) => h("td", { text: String(value) }),
                ),
              ),
            ),
        ),
      ),
    );
  }
  private async scenes(): Promise<void> {
    const generation = ++this.scenesGeneration;
    try {
      const scenes = await this.context.action<{ id: string; name: string }[]>("scenes");
      if (this.isConnected && generation === this.scenesGeneration) {
        this.saved = scenes;
        if (this.tab === "scenes") this.controls();
      }
    } catch (error) {
      if (this.isConnected && generation === this.scenesGeneration)
        this.message(errorMessage(error));
    }
  }
  private async save(duplicate: boolean): Promise<void> {
    const scene = this.scene;
    try {
      const doc = await this.context.action<Saved>("save_scene", {
        ...(!duplicate && this.sceneId ? { id: this.sceneId } : {}),
        scene: copy(this.scene),
      });
      if (!this.isConnected || this.scene !== scene) return;
      this.sceneId = doc.id;
      await this.scenes();
      this.message("Scene saved in SOUP application storage.");
    } catch (error) {
      if (this.isConnected) this.message(errorMessage(error));
    }
  }
  private async restore(): Promise<void> {
    if (!this.sceneId) return;
    const request = ++this.request;
    this.pause();
    this.setPending(false);
    try {
      const doc = await this.context.action<Saved>("load_scene", { id: this.sceneId });
      if (!this.current(request)) return;
      if (doc.dataset !== this.context.object.id || doc.version !== 1)
        throw new Error("Scene belongs to another dataset or uses an unsupported version");
      this.remember();
      this.setScene(upgrade(copy(doc.scene)));
      this.message("Saved snapshot loaded. If graph identities changed, run the query again before exploring.");
    } catch (error) {
      if (request === this.request) this.message(errorMessage(error));
    }
  }
  private async removeScene(): Promise<void> {
    if (!this.sceneId) return;
    try {
      await this.context.action("delete_scene", { id: this.sceneId });
      this.sceneId = "";
      await this.scenes();
      this.message("Saved visualization deleted; graph data is unchanged.");
    } catch (error) {
      if (this.isConnected) this.message(errorMessage(error));
    }
  }
  private filename(extension: string): string {
    return `${this.scene.name || "graph-explorer"}.${extension}`;
  }
  private async exportPng(): Promise<void> {
    try {
      this.context.download(this.filename("png"), "image/png", await this.canvas.png());
    } catch (error) {
      this.message(errorMessage(error));
    }
  }
  private exportCsv(): void {
    const graph = visible(this.scene);
    this.context.download(
      this.filename("nodes.csv"),
      "text/csv",
      csv(graph.nodes.map((n) => ({ ...n.props, _identity: n.id, _labels: n.group }))),
    );
    this.context.download(
      this.filename("edges.csv"),
      "text/csv",
      csv(
        graph.edges.map((e) => ({
          ...e.props,
          _identity: e.id,
          _source: e.source,
          _target: e.target,
          _type: e.type,
        })),
      ),
    );
  }
  private menu(event: MouseEvent): void {
    this.root.querySelector(".menu")?.remove();
    const rect = this.getBoundingClientRect();
    const close = (run: () => void) => (): void => {
      menu.remove();
      run();
    };
    const menu = h(
      "div",
      { className: "menu", attrs: { role: "menu" } },
      button("Expand selection", close(() => void this.load("expand"))),
      button("Hide selection", close(() => this.hide())),
      button("Pin / unpin", close(() => this.pin())),
      button("Group", close(() => this.group())),
      button("Ungroup", close(() => this.ungroup())),
      button("Close menu", () => menu.remove()),
    );
    menu.style.left = `${Math.max(0, Math.min(this.clientWidth - 200, event.clientX - rect.left))}px`;
    menu.style.top = `${event.clientY - rect.top}px`;
    this.root.append(menu);
  }
  private keys = (event: KeyboardEvent): void => {
    if ((event.target as HTMLElement)?.matches("input,select,textarea")) return;
    const key = event.key.toLowerCase(),
      modifier = event.ctrlKey || event.metaKey;
    const commands: Record<string, () => void> = {
      delete: () => this.hide(),
      backspace: () => this.hide(),
      escape: () => {
        this.cancel();
        this.scene.selection = [];
        this.root.querySelector(".menu")?.remove();
        this.inspect();
        this.canvas.draw();
      },
      e: () => void this.load("expand"),
      f: () => this.canvas.fit(),
    };
    if (modifier && key === "z") {
      event.preventDefault();
      this.history(event.shiftKey);
      return;
    }
    if (modifier && key === "a") {
      event.preventDefault();
      this.scene.selection = visible(this.scene).nodes.map((n) => n.id);
      this.inspect();
      this.canvas.draw();
      return;
    }
    if (!modifier && commands[key]) {
      event.preventDefault();
      commands[key]();
    }
  };
}
defineSoupElement("soup-pkg-graph-explorer", GraphExplorer);
