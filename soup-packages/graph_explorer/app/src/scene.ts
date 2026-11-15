import type {
  GraphEdgeModel,
  GraphModel,
  GraphNodeModel,
} from "../../../soup_base/app/src/graph/model";
import { PREDEFINED_COLORS } from "../../../soup_base/app/src/graph/palette";

export type { GraphModel as Graph };
export type Item = GraphNodeModel | GraphEdgeModel;
export interface Point {
  x: number;
  y: number;
}
/** A styling rule; the first enabled matching rule (top of the list) wins. */
export interface Rule {
  target: "nodes" | "edges";
  property: string;
  value: string;
  color: string;
  /** 0 keeps the size of the label/type or the default. */
  size: number;
  op?: "contains" | "equals" | "range" | "exists";
  min?: string;
  max?: string;
  /** Restricts the rule to one node label or relationship type. */
  label?: string;
  enabled?: boolean;
}
/** Color, size and caption of one node label or relationship type. */
export interface Category {
  color?: string;
  size?: number;
  caption?: string;
}
export interface Look {
  color: string;
  size: number;
  caption: string;
  icon: string;
}
export interface QueryFilter {
  target: "nodes" | "edges";
  label: string;
  property: string;
  op: string;
  value: string;
}
export interface Query {
  labels: string[];
  types: string[];
  filters: QueryFilter[];
  limit: number;
}
export interface Scene {
  name: string;
  graph: GraphModel;
  positions: Record<string, Point>;
  pins: string[];
  hidden: string[];
  selection: string[];
  camera: { x: number; y: number; k: number };
  groups: Record<string, string[]>;
  query: Query;
  /** The last query that replaced the graph; "Refresh scene" runs it again. */
  lastQuery: Query | null;
  filter: {
    labels: string;
    types: string;
    property: string;
    text: string;
    min: string;
    max: string;
    mode: string;
    /** Which elements the property condition applies to. */
    scope: "nodes" | "edges";
  };
  style: {
    caption: string;
    icon: string;
    color: string;
    size: number;
    edgeCaption: string;
    edgeIcon: string;
    edgeColor: string;
    edgeSize: number;
    labels: Record<string, Category>;
    types: Record<string, Category>;
    rules: Rule[];
  };
  slicer: {
    property: string;
    cursor: number;
    width: number;
    temporal: boolean;
    enabled: boolean;
  };
}
export const newQuery = (): Query => ({
  labels: [],
  types: [],
  filters: [],
  limit: 200,
});
export function newScene(graph: GraphModel): Scene {
  const scene: Scene = {
    name: "Untitled scene",
    graph,
    positions: {},
    pins: [],
    hidden: [],
    selection: [],
    camera: { x: 0, y: 0, k: 1 },
    groups: {},
    query: newQuery(),
    lastQuery: null,
    filter: {
      labels: "",
      types: "",
      property: "",
      text: "",
      min: "",
      max: "",
      mode: "hide",
      scope: "nodes",
    },
    style: {
      caption: "",
      icon: "",
      color: "#4589c8",
      size: 18,
      edgeCaption: "",
      edgeIcon: "",
      edgeColor: "#8895a7",
      edgeSize: 1.5,
      labels: {},
      types: {},
      rules: [],
    },
    slicer: {
      property: "",
      cursor: 0,
      width: 10,
      temporal: false,
      enabled: false,
    },
  };
  assignDefaults(scene);
  return scene;
}
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const isEdge = (item: Item): item is GraphEdgeModel => "source" in item;
export const labelsOf = (node: GraphNodeModel): string[] =>
  node.group ? node.group.split(":") : [];

/** Gives every label that has no color yet the next palette color, in order of appearance. */
export function assignDefaults(scene: Scene): void {
  const labels = scene.style.labels;
  for (const node of scene.graph.nodes)
    for (const label of labelsOf(node))
      labels[label] ??= {
        color: PREDEFINED_COLORS[Object.keys(labels).length % PREDEFINED_COLORS.length],
      };
}
type OldRule = Rule & { operator?: string };
/** Older rules used `operator` (equals/contains/gte/lte/between) and "__label__" for label colors. */
function migrateRule(rule: OldRule): Rule {
  if (!rule.operator) return rule;
  const { operator, ...rest } = rule;
  if (rest.property === "__label__")
    return { ...rest, property: "", value: "", label: rest.value, size: 0 };
  const bounds: Record<string, Partial<Rule>> = {
    gte: { op: "range", min: rest.value },
    lte: { op: "range", max: rest.value },
    between: { op: "range", min: rest.value, max: rest.max },
  };
  return { ...rest, ...(bounds[operator] ?? { op: operator as Rule["op"] }) };
}
/** Restores a saved scene written by an older version: missing parts get defaults, old looks are kept. */
export function upgrade(scene: Scene): Scene {
  const base = newScene({ nodes: [], edges: [], directed: true });
  const legacy = !scene.style.labels;
  scene.query ??= base.query;
  scene.lastQuery ??= null;
  scene.filter = { ...base.filter, ...scene.filter, scope: scene.filter.scope ?? "nodes" };
  scene.style = { ...base.style, ...scene.style, labels: scene.style.labels ?? {}, types: scene.style.types ?? {} };
  scene.style.rules = (scene.style.rules ?? []).map(migrateRule);
  if (legacy)
    for (const node of scene.graph.nodes)
      for (const label of labelsOf(node))
        scene.style.labels[label] ??= { color: scene.style.color };
  assignDefaults(scene);
  return scene;
}
function numberValue(value: unknown, temporal = false): number {
  if (value === null || value === undefined || value === "") return NaN;
  if (temporal) return Date.parse(String(value));
  return typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value))
    ? Number(value)
    : NaN;
}
function inRange(rule: Rule, raw: unknown): boolean {
  const temporal = (rule.min ?? "").includes("T") || (rule.max ?? "").includes("T");
  const value = numberValue(raw, temporal);
  const low = numberValue(rule.min, temporal),
    high = numberValue(rule.max, temporal);
  return (
    Number.isFinite(value) &&
    value >= (Number.isFinite(low) ? low : -Infinity) &&
    value <= (Number.isFinite(high) ? high : Infinity)
  );
}
function conditionMet(rule: Rule, props: Record<string, unknown>): boolean {
  const raw = props[rule.property];
  const text = raw === null || raw === undefined ? "" : String(raw);
  switch (rule.op ?? "contains") {
    case "exists":
      return text !== "";
    case "equals":
      return text === rule.value;
    case "range":
      return inRange(rule, raw);
    default:
      return text.toLowerCase().includes(rule.value.toLowerCase());
  }
}
export function ruleMatches(rule: Rule, item: Item): boolean {
  const edge = isEdge(item);
  if (rule.enabled === false || rule.target !== (edge ? "edges" : "nodes"))
    return false;
  if (
    rule.label &&
    !(edge ? [item.type] : labelsOf(item)).includes(rule.label)
  )
    return false;
  return rule.property ? conditionMet(rule, item.props) : Boolean(rule.label);
}
/** Rule, then label/type style, then the defaults. */
export function lookOf(scene: Scene, item: Item): Look {
  const s = scene.style,
    edge = isEdge(item);
  const rule = s.rules.find((r) => ruleMatches(r, item));
  const category: Category = edge
    ? (s.types[item.type] ?? {})
    : (labelsOf(item)
        .map((label) => s.labels[label])
        .find(Boolean) ?? {});
  return {
    color: rule?.color ?? category.color ?? (edge ? s.edgeColor : s.color),
    size: Math.max(
      1,
      Math.min(70, rule?.size || category.size || (edge ? s.edgeSize : s.size)),
    ),
    caption: category.caption ?? (edge ? s.edgeCaption : s.caption),
    icon: edge ? s.edgeIcon : s.icon,
  };
}
export function range(scene: Scene): [number, number] {
  const values = scene.graph.nodes
    .map((node) =>
      numberValue(node.props[scene.slicer.property], scene.slicer.temporal),
    )
    .filter(Number.isFinite);
  return values.length ? [Math.min(...values), Math.max(...values)] : [0, 100];
}
export function matches(scene: Scene, item: Item): boolean {
  const f = scene.filter,
    edge = isEdge(item);
  const categories = (edge ? f.types : f.labels)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (
    categories.length &&
    !categories.some((category) =>
      (edge ? [item.type] : labelsOf(item)).includes(category),
    )
  )
    return false;
  // A property condition constrains only the kind of element it is scoped to.
  return (f.scope === "edges") === edge ? propertyMatches(f, item.props) : true;
}
function propertyMatches(
  f: Scene["filter"],
  props: Record<string, unknown>,
): boolean {
  if (!f.property) return true;

  const value = props[f.property];
  if (
    f.text &&
    !String(value ?? "")
      .toLowerCase()
      .includes(f.text.toLowerCase())
  )
    return false;
  const temporal = f.min.includes("T") || f.max.includes("T");
  const parsed = numberValue(value, temporal);
  return (
    (!f.min || parsed >= numberValue(f.min, temporal)) &&
    (!f.max || parsed <= numberValue(f.max, temporal))
  );
}
function sliced(
  scene: Scene,
  node: GraphNodeModel,
  bounds: [number, number],
): boolean {
  if (!scene.slicer.enabled || !scene.slicer.property) return true;
  const [min, max] = bounds,
    value = numberValue(
      node.props[scene.slicer.property],
      scene.slicer.temporal,
    );
  const start = min + ((max - min) * scene.slicer.cursor) / 100;
  return (
    value >= start && value <= start + ((max - min) * scene.slicer.width) / 100
  );
}
export function visible(scene: Scene): GraphModel {
  const hidden = new Set(scene.hidden);
  const bounds = range(scene);
  const nodes = scene.graph.nodes.filter(
    (n) =>
      !hidden.has(n.id) &&
      sliced(scene, n, bounds) &&
      (scene.filter.mode === "dim" || matches(scene, n)),
  );
  const ids = new Set(nodes.map((n) => n.id));
  return {
    nodes,
    edges: scene.graph.edges.filter(
      (e) =>
        !hidden.has(e.id) &&
        ids.has(e.source) &&
        ids.has(e.target) &&
        (scene.filter.mode === "dim" || matches(scene, e)),
    ),
    directed: true,
  };
}
export function aggregate(scene: Scene, graph: GraphModel): GraphModel {
  const membership = new Map<string, string>(),
    nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const [name, ids] of Object.entries(scene.groups)) {
    const members = ids.filter((id) => nodes.has(id));
    if (!members.length) continue;
    const id = `group:${name}`;
    members.forEach((member) => {
      membership.set(member, id);
      nodes.delete(member);
    });
    nodes.set(id, {
      id,
      label: `${name} (${members.length})`,
      group: "Group",
      props: { members },
    });
  }
  return {
    nodes: [...nodes.values()],
    edges: aggregateEdges(graph, membership),
    directed: true,
  };
}
function groupedEdge(
  membership: Map<string, string>,
  edge: GraphEdgeModel,
): boolean {
  return membership.has(edge.source) || membership.has(edge.target);
}
function aggregateEdges(
  graph: GraphModel,
  membership: Map<string, string>,
): GraphEdgeModel[] {
  const edges = new Map<string, GraphEdgeModel>();
  for (const edge of graph.edges) {
    const source = membership.get(edge.source) ?? edge.source,
      target = membership.get(edge.target) ?? edge.target;
    if (source === target && membership.has(edge.source)) continue;
    const id = groupedEdge(membership, edge)
      ? JSON.stringify([source, target, edge.type])
      : edge.id;
    const previous = edges.get(id);
    edges.set(id, {
      ...edge,
      id,
      source,
      target,
      weight: (previous?.weight ?? 0) + 1,
      label: previous ? `${edge.type} ×${previous.weight + 1}` : edge.label,
    });
  }
  return [...edges.values()];
}

export function merge(scene: Scene, incoming: GraphModel): void {
  const nodes = new Map(scene.graph.nodes.map((n) => [n.id, n]));
  incoming.nodes.forEach((n) => {
    if (nodes.size < 1000 || nodes.has(n.id)) nodes.set(n.id, n);
  });
  const edges = new Map(scene.graph.edges.map((e) => [e.id, e]));
  incoming.edges.forEach((e) => {
    if (
      nodes.has(e.source) &&
      nodes.has(e.target) &&
      (edges.size < 2000 || edges.has(e.id))
    )
      edges.set(e.id, e);
  });
  scene.graph = {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    directed: true,
  };
}
export function analytics(
  graph: GraphModel,
): Record<string, { degree: number; rank: number; community: number }> {
  const result: Record<
    string,
    { degree: number; rank: number; community: number }
  > = {};
  const adjacent = new Map(
    graph.nodes.map((node, i) => {
      result[node.id] = {
        degree: 0,
        rank: 1 / Math.max(1, graph.nodes.length),
        community: i,
      };
      return [node.id, [] as string[]];
    }),
  );
  graph.edges.forEach((e) => {
    adjacent.get(e.source)?.push(e.target);
    adjacent.get(e.target)?.push(e.source);
  });
  for (let step = 0; step < 20; step++) {
    const previous = Object.fromEntries(
      Object.entries(result).map(([id, v]) => [id, { ...v }]),
    );
    const dangling =
      [...adjacent]
        .filter(([, neighbors]) => !neighbors.length)
        .reduce((sum, [id]) => sum + previous[id].rank, 0) /
      Math.max(1, graph.nodes.length);
    for (const [id, neighbors] of adjacent) {
      const counts = new Map<number, number>();
      neighbors.forEach((n) =>
        counts.set(
          result[n].community,
          (counts.get(result[n].community) ?? 0) + 1,
        ),
      );
      result[id] = {
        degree: neighbors.length,
        rank:
          0.15 / Math.max(1, graph.nodes.length) +
          0.85 *
            (dangling +
              neighbors.reduce(
                (sum, n) =>
                  sum + previous[n].rank / Math.max(1, adjacent.get(n)!.length),
                0,
              )),
        community:
          [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ??
          previous[id].community,
      };
    }
  }
  return result;
}
export function csv(rows: Record<string, unknown>[]): string {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (v: unknown): string =>
    `"${String(typeof v === "object" ? JSON.stringify(v) : (v ?? "")).replaceAll('"', '""')}"`;
  return [keys, ...rows.map((row) => keys.map((key) => row[key]))]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
