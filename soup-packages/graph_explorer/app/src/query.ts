import { h } from "@soup/sdk";
import type { Query, QueryFilter, Scene } from "./scene";
import {
  button,
  chips,
  datalist,
  field,
  group,
  hint,
  select,
  toggled,
  type Choice,
  type Option,
} from "./ui";

export interface SchemaEntry {
  name: string;
  count: number;
  properties: string[];
}
export interface Schema {
  labels: SchemaEntry[];
  types: SchemaEntry[];
  truncated?: boolean;
}
export interface QueryHost {
  scene: Scene;
  schema: Schema;
  search: { text: string; property: string };
  refresh(): void;
  run(replace: boolean): void;
  find(): void;
}
const OPERATORS: Option[] = [
  ["contains", "contains"],
  ["eq", "equals"],
  ["ne", "does not equal"],
  ["starts", "starts with"],
  ["ends", "ends with"],
  ["gt", "greater than"],
  ["gte", "at least"],
  ["lt", "less than"],
  ["lte", "at most"],
  ["exists", "has a value"],
];
const NUMERIC = new Set(["gt", "gte", "lt", "lte"]);
const SYMBOLS: Record<string, string> = {
  contains: "contains",
  eq: "=",
  ne: "≠",
  starts: "starts with",
  ends: "ends with",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  exists: "has a value",
};
const asNumber = (value: string): string | number =>
  /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
const complete = (filter: QueryFilter): boolean =>
  Boolean(filter.property) && (filter.op === "exists" || filter.value !== "");

/** The parameters of the server's read-only `query` action; incomplete conditions are left out. */
export function queryParams(query: Query): Record<string, unknown> {
  const filters = query.filters.filter(complete).map((f) => ({
    target: f.target,
    label: f.target === "nodes" ? f.label : "",
    property: f.property,
    op: f.op,
    ...(f.op === "exists"
      ? {}
      : { value: NUMERIC.has(f.op) ? asNumber(f.value) : f.value }),
  }));
  return { labels: query.labels, types: query.types, filters, limit: query.limit };
}
/** The query in plain words, shown before it runs. */
export function describe(query: Query): string {
  const nodes = query.labels.length ? query.labels.join(" or ") : "any node";
  const links = query.types.length
    ? ` connected by ${query.types.join(" or ")}`
    : "";
  const where = query.filters
    .filter(complete)
    .map(
      (f) =>
        `${f.target === "edges" ? "relationship " : ""}${f.property} ${SYMBOLS[f.op] ?? f.op}${f.op === "exists" ? "" : ` ${f.value}`}`,
    );
  return `Show ${nodes}${links}${where.length ? ` where ${where.join(" and ")}` : ""} — up to ${query.limit} results.`;
}
function propertiesFor(host: QueryHost, filter: QueryFilter): string[] {
  const entries = filter.target === "edges" ? host.schema.types : host.schema.labels;
  const chosen = filter.target === "edges" ? host.scene.query.types : filter.label ? [filter.label] : host.scene.query.labels;
  const relevant = entries.filter((entry) => !chosen.length || chosen.includes(entry.name));
  return [...new Set(relevant.flatMap((entry) => entry.properties))].sort();
}
function choices(host: QueryHost, kind: "labels" | "types"): Choice[] {
  return host.schema[kind].map((entry) => ({
    name: entry.name,
    note: entry.count.toLocaleString(),
    color: kind === "labels" ? host.scene.style.labels[entry.name]?.color : undefined,
  }));
}
function condition(
  host: QueryHost,
  filter: QueryFilter,
  index: number,
  update: () => void,
): HTMLElement {
  const id = `ge-property-${index}`;
  const labels: Option[] = [["", "Any type"], ...host.schema.labels.map((l): Option => l.name)];
  return h(
    "div",
    { className: "condition" },
    select(
      "Condition applies to",
      [["nodes", "Nodes"], ["edges", "Relationships"]],
      filter.target,
      (value) => {
        filter.target = value === "edges" ? "edges" : "nodes";
        filter.label = "";
        host.refresh();
      },
    ),
    filter.target === "nodes"
      ? select("Condition node type", labels, filter.label, (value) => {
          filter.label = value;
          host.refresh();
        })
      : null,
    field("Condition property", filter.property, (value) => {
      filter.property = value;
      update();
    }, "text", undefined, id),
    datalist(id, propertiesFor(host, filter)),
    select("Condition operator", OPERATORS, filter.op, (value) => {
      filter.op = value;
      host.refresh();
    }),
    filter.op === "exists"
      ? null
      : field("Condition value", filter.value, (value) => {
          filter.value = value;
          update();
        }),
    button("Remove", () => {
      host.scene.query.filters.splice(index, 1);
      host.refresh();
    }),
  );
}
function conditions(host: QueryHost, update: () => void): HTMLElement {
  const query = host.scene.query;
  return group(
    "Conditions",
    hint("Narrow by property. Numbers compare as numbers; ISO dates compare as text."),
    ...query.filters.map((filter, index) => condition(host, filter, index, update)),
    button("Add condition", () => {
      if (query.filters.length >= 10) return;
      query.filters.push({ target: "nodes", label: "", property: "", op: "contains", value: "" });
      host.refresh();
    }),
  );
}
function textSearch(host: QueryHost): HTMLElement {
  return group(
    "Text search",
    hint("Search database node properties (up to 1,000 candidates) and add matches to the current scene."),
    field("Search text", host.search.text, (value) => {
      host.search.text = value;
    }),
    field("Search property (optional)", host.search.property, (value) => {
      host.search.property = value;
    }),
    button("Find", () => host.find()),
  );
}
export function queryPanel(host: QueryHost): HTMLElement {
  const query = host.scene.query;
  const summary = hint(describe(query));
  summary.className = "summary";
  const update = (): void => {
    summary.textContent = describe(query);
  };
  const types = (kind: "labels" | "types", title: string, label: string): HTMLElement =>
    group(
      title,
      host.schema[kind].length
        ? chips(label, choices(host, kind), query[kind], (name) => {
            query[kind] = toggled(query[kind], name);
            host.refresh();
          })
        : hint("None found in this dataset."),
    );
  const presets = group(
    "Explore a graph",
    hint("Start with a graph view or configure the query below. Only matching results are loaded."),
    h("div", { className: "actions ge-presets" },
      button("Class graph · DF_C", () => {
        query.labels = ["Class"];
        query.types = ["DF_C"];
        query.filters = [];
        host.refresh();
        host.run(true);
      }, "primary"),
      button("Event graph · DF", () => {
        query.labels = ["Event"];
        query.types = ["DF"];
        query.filters = [];
        host.refresh();
        host.run(true);
      }),
      button("All graph types", () => {
        query.labels = [];
        query.types = [];
        query.filters = [];
        host.refresh();
      }),
    ),
  );
  return h(
    "div",
    { className: "tab" },
    presets,
    hint("Choose node and relationship types. Empty selections mean all types."),
    types("labels", "Node types", "Node type"),
    types("types", "Relationship types", "Relationship type"),
    conditions(host, update),
    group(
      "Results",
      field("Maximum results (1–1,000)", query.limit, (value) => {
        query.limit = Math.max(1, Math.min(1000, Math.trunc(Number(value)) || 200));
        host.refresh();
      }, "number"),
      summary,
      h(
        "div",
        { className: "actions" },
        button("Run query", () => host.run(true), "primary"),
        button("Add to scene", () => host.run(false)),
        button("Clear", () => {
          host.scene.query = { labels: [], types: [], filters: [], limit: query.limit };
          host.refresh();
        }),
      ),
    ),
    h("details", { className: "ge-disclosure" },
      h("summary", { text: "Find nodes by text" }),
      textSearch(host),
    ),
  );
}
