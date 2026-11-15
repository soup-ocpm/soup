import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VisualizerContext } from "@soup/sdk";
import "../../../soup_base/app/src/index";
import { GraphExplorer } from "../src/index";
import {
  aggregate,
  analytics,
  copy,
  csv,
  lookOf,
  newScene,
  range,
  upgrade,
  visible,
  type Graph,
  type Rule,
} from "../src/scene";
import { Layout } from "../src/layout";
import { describe as describeQuery, queryParams } from "../src/query";

const graph: Graph = {
  nodes: ["a", "b", "c"].map((id, i) => ({
    id,
    label: id,
    group: i === 2 ? "Entity" : "Event",
    props: {
      value: i * 10,
      timestamp: `2024-01-0${i + 1}T00:00:00Z`,
      x: i,
      y: i * 3,
    },
  })),
  edges: [
    {
      id: "r1",
      source: "a",
      target: "b",
      type: "DF",
      label: "DF",
      weight: 1,
      props: {},
    },
    {
      id: "r2",
      source: "b",
      target: "c",
      type: "CORR",
      label: "CORR",
      weight: 1,
      props: {},
    },
  ],
  directed: true,
};
const schema = {
  labels: [
    { name: "Event", count: 2, properties: ["value", "timestamp"] },
    { name: "Class", count: 12, properties: ["Count", "Name"] },
  ],
  types: [
    { name: "DF", count: 5, properties: [] },
    { name: "DF_C", count: 7, properties: ["Type"] },
  ],
};
// What a Class graph looks like: two Class nodes, parallel DF_C edges and a self loop.
const classes: Graph = {
  nodes: ["c1", "c2"].map((id) => ({
    id,
    label: id.toUpperCase(),
    group: "Class",
    props: { Count: id === "c1" ? 9 : 3 },
  })),
  edges: [
    ["d1", "c1", "c2", "Order"],
    ["d2", "c1", "c2", "Item"],
    ["d3", "c2", "c2", "Order"],
  ].map(([id, source, target, kind]) => ({
    id,
    source,
    target,
    type: "DF_C",
    label: kind,
    weight: 1,
    props: { Type: kind },
  })),
  directed: true,
};
function raw(model = graph): unknown {
  return { ...model, edges: model.edges.map((e) => ({ ...e, group: e.type })) };
}
const tick = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};
function button(element: GraphExplorer, text: string): HTMLButtonElement {
  const found = [...element.shadowRoot!.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
  if (!found) throw new Error("Missing button " + text);
  return found;
}
function labelled<T extends HTMLElement>(
  element: GraphExplorer,
  label: string,
  index = 0,
): T {
  const found = element.shadowRoot!.querySelectorAll(`[aria-label="${label}"]`)[index];
  if (!found) throw new Error("Missing control " + label);
  return found as T;
}
function field(element: GraphExplorer, label: string, value: string, index = 0): void {
  const input = labelled<HTMLInputElement>(element, label, index);
  input.value = value;
  // Live fields apply on input, the others on change.
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
const choose = field;
function tab(element: GraphExplorer, name: string): void {
  button(element, name).click();
}
function mount(
  action = vi.fn(
    async (name: string): Promise<unknown> => (name === "scenes" ? [] : raw()),
  ),
): GraphExplorer {
  const el = new GraphExplorer();
  el.data = { backend: "neo4j", graph: raw(), schema };
  el.context = {
    object: { id: "dataset-a", name: "A" },
    theme: "dark",
    action,
    notify: vi.fn(),
    download: vi.fn(),
    setThumbnail: vi.fn(),
    openObject: vi.fn(),
  } as unknown as VisualizerContext;
  document.body.append(el);
  return el;
}
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      new Proxy({}, { get: () => () => undefined }) as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new Blob(["PNG"], { type: "image/png" })),
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("Worker", undefined);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("scene-only tools", () => {
  it("filters, slices, groups and analyzes without changing input", () => {
    const before = copy(graph),
      scene = newScene(copy(graph));
    scene.filter.property = "value";
    scene.filter.min = "10";
    expect(visible(scene).nodes.map((n) => n.id)).toEqual(["b", "c"]);
    scene.filter.mode = "dim";
    expect(visible(scene).nodes).toHaveLength(3);
    scene.slicer = {
      enabled: true,
      property: "timestamp",
      temporal: true,
      cursor: 50,
      width: 50,
    };
    expect(range(scene)[0]).toBe(Date.parse("2024-01-01T00:00:00Z"));
    expect(visible(scene).nodes.map((n) => n.id)).toEqual(["b", "c"]);
    scene.slicer.enabled = false;
    scene.groups = { Events: ["a", "b"] };
    expect(aggregate(scene, graph).nodes).toHaveLength(2);
    expect(aggregate(scene, graph).edges[0].target).toBe("c");
    const stats = analytics(graph);
    expect(stats.b.degree).toBe(2);
    expect(stats.b.rank).toBeGreaterThan(stats.a.rank);
    expect(new Set(Object.values(stats).map((v) => v.community)).size).toBe(1);
    expect(graph).toEqual(before);
  });
  it("applies a node property condition to nodes only, so relationships stay visible", () => {
    const scene = newScene(copy(graph));
    scene.filter.property = "value";
    scene.filter.min = "10";
    expect(visible(scene).edges.map((e) => e.id)).toEqual(["r2"]);
    scene.filter.scope = "edges";
    expect(visible(scene).nodes).toHaveLength(3);
    expect(visible(scene).edges).toHaveLength(0);
  });
  it("lays out cycles, loops and parallel edges left to right and keeps pins", () => {
    const scene = newScene(copy(classes));
    const cyclic: Graph = {
      ...graph,
      edges: [
        ...graph.edges,
        { id: "r3", source: "c", target: "a", type: "DF_C", label: "x", weight: 1, props: {} },
        { id: "r4", source: "b", target: "b", type: "DF_C", label: "x", weight: 1, props: {} },
        { id: "r5", source: "a", target: "b", type: "DF_C", label: "y", weight: 1, props: {} },
      ],
    };
    scene.positions.a = { x: 17, y: 29 };
    scene.pins = ["a"];
    let points: Record<string, { x: number; y: number }> = {};
    new Layout().run(scene, cyclic, (calculated) => {
      points = calculated;
    });
    expect(points["a"]).toEqual({ x: 17, y: 29 });
    expect(points["c"].x).toBeGreaterThan(points["b"].x);
    expect(points["b"].x).toBeGreaterThan(0);
    expect(
      Object.values(points).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    ).toBe(true);
  });
  it("styles by label, then by the first matching rule", () => {
    const scene = newScene(copy(graph));
    const [a, b, c] = scene.graph.nodes;
    expect(lookOf(scene, a).color).toBe(scene.style.labels["Event"].color);
    expect(lookOf(scene, c).color).toBe(scene.style.labels["Entity"].color);
    expect(scene.style.labels["Event"].color).not.toBe(scene.style.labels["Entity"].color);
    const range: Rule = { target: "nodes", label: "Event", property: "value", op: "range", min: "5", max: "15", value: "", color: "#123456", size: 30 };
    const all: Rule = { target: "nodes", label: "Event", property: "", value: "", color: "#654321", size: 0 };
    scene.style.rules = [range, all];
    expect(lookOf(scene, b)).toMatchObject({ color: "#123456", size: 30 });
    expect(lookOf(scene, a)).toMatchObject({ color: "#654321", size: scene.style.size });
    expect(lookOf(scene, c).color).toBe(scene.style.labels["Entity"].color);
    scene.style.rules = [{ ...range, enabled: false }, all];
    expect(lookOf(scene, b).color).toBe("#654321");
  });
  it("restores scenes saved by earlier versions", () => {
    const old = copy(newScene(copy(graph)));
    const style = old.style as unknown as Record<string, unknown>;
    delete style["labels"];
    delete style["types"];
    old.style.color = "#101010";
    old.style.rules = [
      { target: "nodes", property: "value", operator: "between", value: "5", max: "15", color: "#abcdef", size: 18 },
      { target: "nodes", property: "__label__", operator: "equals", value: "Entity", color: "#fedcba", size: 18 },
    ] as unknown as Rule[];
    const upgraded = upgrade(old);
    expect(upgraded.style.labels["Event"].color).toBe("#101010");
    expect(upgraded.style.rules[0]).toMatchObject({ op: "range", min: "5", max: "15" });
    expect(upgraded.style.rules[1]).toMatchObject({ label: "Entity", property: "", color: "#fedcba" });
    expect(lookOf(upgraded, upgraded.graph.nodes[2]).color).toBe("#fedcba");
  });
  it("escapes CSV values", () => {
    expect(csv([{ name: 'a,"b', count: 2 }])).toContain('"a,""b"');
  });
});
describe("query parameters", () => {
  it("sends numbers as numbers, drops incomplete conditions and describes the query", () => {
    const query = {
      labels: ["Class"],
      types: ["DF_C"],
      limit: 50,
      filters: [
        { target: "nodes" as const, label: "Class", property: "Count", op: "gte", value: "5" },
        { target: "edges" as const, label: "ignored", property: "Type", op: "eq", value: "Order" },
        { target: "nodes" as const, label: "", property: "", op: "eq", value: "x" },
        { target: "nodes" as const, label: "", property: "Name", op: "exists", value: "" },
      ],
    };
    expect(queryParams(query)).toEqual({
      labels: ["Class"],
      types: ["DF_C"],
      limit: 50,
      filters: [
        { target: "nodes", label: "Class", property: "Count", op: "gte", value: 5 },
        { target: "edges", label: "", property: "Type", op: "eq", value: "Order" },
        { target: "nodes", label: "", property: "Name", op: "exists" },
      ],
    });
    expect(describeQuery(query)).toContain("Class connected by DF_C where Count ≥ 5");
  });
});
describe("package integration", () => {
  it("reuses graph and inspector components, with scene undo, grouping, styling and exports", async () => {
    const action = vi.fn(
      async (name: string): Promise<unknown> =>
        name === "scenes" ? [] : raw(),
    );
    const el = mount(action);
    await tick();
    expect(el.shadowRoot!.querySelector("soup-graph-view")).not.toBeNull();
    expect(el.getAttribute("data-theme")).toBe("dark");
    el.scene.selection = ["a"];
    button(el, "Hide").click();
    expect(el.scene.hidden).toContain("a");
    button(el, "Undo").click();
    expect(el.scene.hidden).toEqual([]);
    button(el, "Redo").click();
    expect(el.scene.hidden).toContain("a");
    button(el, "Show all").click();
    el.scene.selection = ["a", "b"];
    button(el, "Group selection").click();
    expect(Object.keys(el.scene.groups)).toHaveLength(1);
    button(el, "Ungroup selection").click();
    expect(el.scene.groups).toEqual({});
    el.scene.selection = ["a"];
    button(el, "Pin / unpin selection").click();
    expect(el.scene.pins).toContain("a");
    tab(el, "Style");
    field(el, "Caption property", "value");
    expect(el.scene.style.caption).toBe("value");
    tab(el, "Insights");
    button(el, "Calculate").click();
    expect(el.shadowRoot!.querySelector("table")!.textContent).toContain(
      "Community",
    );
    button(el, "JSON").click();
    button(el, "CSV").click();
    button(el, "PNG").click();
    await tick();
    expect(el.context.download).toHaveBeenCalledTimes(4);
    expect(action.mock.calls.map(([name]) => name)).toEqual(["scenes"]);
    expect(el.shadowRoot!.querySelector("soup-keyvalue")).not.toBeNull();
  });
  it("bounds expansion and discards canceled responses", async () => {
    let release!: (value: unknown) => void;
    const action = vi.fn(
      (name: string): Promise<unknown> =>
        name === "scenes"
          ? Promise.resolve([])
          : new Promise((resolve) => {
              release = resolve;
            }),
    );
    const el = mount(action);
    await tick();
    el.scene.selection = ["a"];
    field(el, "Depth (1–6)", "2");
    labelled<HTMLButtonElement>(el, "Expand along: DF").click();
    button(el, "Expand").click();
    expect(action).toHaveBeenCalledWith(
      "expand",
      expect.objectContaining({ ids: ["a"], depth: 2, types: ["DF"] }),
    );
    button(el, "Cancel request").click();
    release(
      raw({
        ...graph,
        nodes: [
          ...graph.nodes,
          { id: "late", label: "late", group: "Event", props: {} },
        ],
      }),
    );
    await tick();
    expect(el.scene.graph.nodes.some((n) => n.id === "late")).toBe(false);
  });
  it("persists full scenes in application storage and restores the camera", async () => {
    let saved: unknown;
    const action = vi.fn(
      async (
        name: string,
        params?: Record<string, unknown>,
      ): Promise<unknown> => {
        if (name === "scenes")
          return saved ? [{ id: "scene-id", name: "Saved" }] : [];
        if (name === "save_scene") {
          saved = {
            id: "scene-id",
            dataset: "dataset-a",
            version: 1,
            scene: params!["scene"],
          };
          return saved;
        }
        if (name === "load_scene") return saved;
        return {};
      },
    );
    const el = mount(action);
    await tick();
    tab(el, "Scenes");
    el.scene.camera = { x: 11, y: 22, k: 2 };
    el.scene.positions.a = { x: 5, y: 9 };
    el.scene.filter.text = "saved";
    button(el, "Save").click();
    await tick();
    el.scene.camera.x = 999;
    button(el, "Load").click();
    await tick();
    expect(el.scene.camera.x).toBe(11);
    expect(el.scene.positions.a).toEqual({ x: 5, y: 9 });
    expect(el.scene.filter.text).toBe("saved");
    button(el, "Duplicate").click();
    await tick();
    expect(
      action.mock.calls.filter(([name]) => name === "save_scene"),
    ).toHaveLength(2);
    button(el, "Delete saved scene").click();
    await tick();
    expect(action).toHaveBeenCalledWith("delete_scene", { id: "scene-id" });
  });
  it("stops slicer playback when disconnected", async () => {
    vi.useFakeTimers();
    const el = mount();
    await tick();
    tab(el, "Filter");
    field(el, "Slicer property", "value");
    button(el, "Play / pause").click();
    vi.advanceTimersByTime(300);
    expect(el.scene.slicer.cursor).toBe(2);
    el.remove();
    vi.advanceTimersByTime(300);
    expect(el.scene.slicer.cursor).toBe(2);
  });
});

describe("search, query before rendering and styling", () => {
  it("opens on Search with the dataset's types and runs a read-only query that replaces the scene", async () => {
    const action = vi.fn(async (name: string): Promise<unknown> =>
      name === "scenes" ? [] : name === "query" ? raw(classes) : {},
    );
    const el = mount(action);
    await tick();
    expect(labelled(el, "Node type: Class").textContent).toBe("Class · 12");
    expect(labelled(el, "Relationship type: DF_C").textContent).toBe("DF_C · 7");
    labelled<HTMLButtonElement>(el, "Node type: Class").click();
    labelled<HTMLButtonElement>(el, "Relationship type: DF_C").click();
    button(el, "Add condition").click();
    field(el, "Condition property", "Count");
    choose(el, "Condition operator", "gte");
    field(el, "Condition value", "5");
    el.scene.camera = { x: 3, y: 4, k: 1 };
    button(el, "Run query").click();
    await tick();
    expect(action).toHaveBeenCalledWith("query", {
      labels: ["Class"],
      types: ["DF_C"],
      filters: [{ target: "nodes", label: "", property: "Count", op: "gte", value: 5 }],
      limit: 200,
    });
    expect(el.scene.graph.nodes.map((n) => n.id)).toEqual(["c1", "c2"]);
    expect(el.scene.graph.edges).toHaveLength(3);
    expect(el.scene.lastQuery?.types).toEqual(["DF_C"]);
    expect(el.scene.style.labels["Class"]).toBeDefined();
    expect(el.scene.positions["c2"].x).toBeGreaterThan(el.scene.positions["c1"].x);
    expect(el.shadowRoot!.querySelector(".counts")!.textContent).toContain("2/2 nodes · 3 relationships");
  });
  it("styles live: one undo step per gesture, rule priority, no camera or selection change", async () => {
    const el = mount();
    await tick();
    tab(el, "Style");
    el.scene.camera = { x: 11, y: 22, k: 2 };
    el.scene.selection = ["a"];
    const before = el.scene.style.labels["Event"].color;
    field(el, "Color of Event", "#ff0000");
    expect(el.scene.style.labels["Event"].color).toBe("#ff0000");
    expect(el.scene.camera).toEqual({ x: 11, y: 22, k: 2 });
    expect(el.scene.selection).toEqual(["a"]);
    button(el, "Add rule").click();
    field(el, "Rule property (optional)", "value");
    choose(el, "Rule condition", "range");
    field(el, "Rule minimum (number or ISO datetime)", "5");
    field(el, "Rule color", "#00ff00");
    expect(el.scene.style.rules[0]).toMatchObject({ label: "Event", op: "range", min: "5", color: "#00ff00" });
    expect(el.shadowRoot!.textContent).toContain("1 match");
    button(el, "Add rule").click();
    labelled<HTMLButtonElement>(el, "Move rule 2 up").click();
    expect(el.scene.style.rules.map((r) => r.property)).toEqual(["", "value"]);
    for (let step = 0; step < 8; step++) button(el, "Undo").click();
    expect(el.scene.style.labels["Event"].color).toBe(before);
    expect(el.scene.style.rules).toEqual([]);
  });
});
