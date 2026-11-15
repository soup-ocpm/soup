import { h } from "@soup/sdk";
import { PREDEFINED_COLORS } from "../../../soup_base/app/src/graph/palette";
import {
  assignDefaults,
  isEdge,
  labelsOf,
  ruleMatches,
  type Category,
  type Item,
  type Rule,
  type Scene,
} from "./scene";
import { button, datalist, field, group, hint, select, type Option } from "./ui";

export interface StyleHost {
  scene: Scene;
  /** Called before the first change of a gesture: one undo step. */
  begin: () => void;
  /** Redraws the canvas and the counts at once; does not rebuild the panel. */
  preview: () => void;
  /** Rebuilds the panel after a structural change. */
  refresh: () => void;
}
const CONDITIONS: Option[] = [
  ["equals", "equals"],
  ["contains", "contains"],
  ["range", "is between"],
  ["exists", "has a value"],
];
const itemsOf = (scene: Scene, target: Rule["target"]): Item[] =>
  target === "edges" ? scene.graph.edges : scene.graph.nodes;
const kindOf = (item: Item): string[] => (isEdge(item) ? [item.type] : labelsOf(item));

function counts(scene: Scene, target: Rule["target"]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of itemsOf(scene, target))
    for (const name of kindOf(item)) result.set(name, (result.get(name) ?? 0) + 1);
  return new Map([...result].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}
function propertyNames(scene: Scene, target: Rule["target"], label = ""): string[] {
  const names = new Set<string>();
  itemsOf(scene, target)
    .filter((item) => !label || kindOf(item).includes(label))
    .slice(0, 500)
    .forEach((item) => Object.keys(item.props).forEach((key) => names.add(key)));
  return [...names].sort();
}
function iconButton(symbol: string, label: string, run: () => void): HTMLButtonElement {
  return h("button", {
    text: symbol,
    attrs: { type: "button", title: label, "aria-label": label },
    on: { click: () => run() },
  });
}
function categoryRow(
  host: StyleHost,
  kind: "labels" | "types",
  name: string,
  count: number,
): HTMLElement {
  const style = host.scene.style;
  const target = kind === "labels" ? "nodes" : "edges";
  const category: Category = style[kind][name] ?? {};
  const edit = (apply: (value: Category) => void): void => {
    apply((style[kind][name] ??= {}));
    host.preview();
  };
  const size = kind === "labels" ? style.size : style.edgeSize;
  const properties = propertyNames(host.scene, target, name);
  return h(
    "div",
    { className: "category ge-category" },
    field(`Color of ${name}`, category.color ?? (kind === "labels" ? style.color : style.edgeColor), (value) =>
      edit((c) => { c.color = value; }), "color", host.begin),
    h("span", { className: "name", text: name }),
    h("span", { className: "ge-count", text: count.toLocaleString() }),
    h("details", { className: "ge-category-more" },
      h("summary", { text: "Advanced" }),
      field(`${kind === "labels" ? "Size" : "Width"} of ${name}`, category.size ?? size, (value) =>
        edit((c) => { c.size = Number(value) > 0 ? Math.min(70, Number(value)) : undefined; }), "number", host.begin),
      select(`Caption of ${name}`, [["", "Default"], ...properties], category.caption ?? "", (value) => {
        host.begin();
        edit((c) => { c.caption = value || undefined; });
      }),
    ),
  );
}
function categories(host: StyleHost, kind: "labels" | "types"): HTMLElement {
  const rows = [...counts(host.scene, kind === "labels" ? "nodes" : "edges")].slice(0, 30);
  return group(
    kind === "labels" ? "Node types" : "Relationships",
    ...(rows.length
      ? rows.map(([name, count]) => categoryRow(host, kind, name, count))
      : [hint("Run a query to style what it returns.")]),
  );
}
function swatches(host: StyleHost, rule: Rule): HTMLElement {
  return h(
    "div",
    { className: "swatches", attrs: { role: "group", "aria-label": "Preset colors" } },
    ...PREDEFINED_COLORS.slice(0, 10).map((color) => {
      const swatch = h("button", {
        className: "swatch",
        attrs: { type: "button", title: color, "aria-label": `Use ${color}` },
        on: {
          click: () => {
            host.begin();
            rule.color = color;
            host.refresh();
          },
        },
      });
      swatch.style.background = color;
      return swatch;
    }),
  );
}
function valueFields(host: StyleHost, rule: Rule, apply: () => void): (HTMLElement | null)[] {
  const set = (key: "value" | "min" | "max") => (value: string): void => {
    rule[key] = value;
    apply();
  };
  switch (rule.op ?? "contains") {
    case "exists":
      return [];
    case "range":
      return [
        field("Rule minimum (number or ISO datetime)", rule.min ?? "", set("min"), "text", host.begin),
        field("Rule maximum (number or ISO datetime)", rule.max ?? "", set("max"), "text", host.begin),
      ];
    default:
      return [field("Rule value", rule.value, set("value"), "text", host.begin)];
  }
}
function ruleCondition(host: StyleHost, rule: Rule, index: number, apply: () => void): HTMLElement {
  const scene = host.scene;
  const names = [...counts(scene, rule.target).keys()];
  const id = `ge-rule-property-${index}`;
  const restructure = (change: () => void): void => {
    host.begin();
    change();
    host.refresh();
  };
  return h(
    "div",
    { className: "rule-condition" },
    select("Rule applies to", [["nodes", "Nodes"], ["edges", "Relationships"]], rule.target, (value) =>
      restructure(() => {
        rule.target = value === "edges" ? "edges" : "nodes";
        rule.label = "";
      })),
    select(rule.target === "edges" ? "Rule relationship type" : "Rule node type", [["", "Any"], ...names], rule.label ?? "", (value) =>
      restructure(() => {
        rule.label = value;
      })),
    field("Rule property (optional)", rule.property, (value) =>
      restructure(() => {
        rule.property = value;
      }), "text", undefined, id),
    datalist(id, propertyNames(scene, rule.target, rule.label)),
    ...(rule.property
      ? [
          select("Rule condition", CONDITIONS, rule.op ?? "contains", (value) =>
            restructure(() => {
              rule.op = value as Rule["op"];
            })),
          ...valueFields(host, rule, apply),
        ]
      : []),
  );
}
function ruleHeader(host: StyleHost, rule: Rule, index: number, badge: HTMLElement, apply: () => void): HTMLElement {
  const rules = host.scene.style.rules;
  const number = index + 1;
  const enabled = h("input", {
    attrs: { type: "checkbox", "aria-label": `Enable rule ${number}` },
    on: {
      change: (event) => {
        host.begin();
        rule.enabled = (event.target as HTMLInputElement).checked;
        apply();
      },
    },
  });
  enabled.checked = rule.enabled !== false;
  const move = (by: number): void => {
    host.begin();
    [rules[index], rules[index + by]] = [rules[index + by], rules[index]];
    host.refresh();
  };
  return h(
    "div",
    { className: "rule-head" },
    enabled,
    h("strong", { text: `Rule ${number}` }),
    badge,
    iconButton("↑", `Move rule ${number} up`, () => index > 0 && move(-1)),
    iconButton("↓", `Move rule ${number} down`, () => index < rules.length - 1 && move(1)),
    iconButton("✕", `Remove rule ${number}`, () => {
      host.begin();
      rules.splice(index, 1);
      host.refresh();
    }),
  );
}
function ruleCard(host: StyleHost, rule: Rule, index: number): HTMLElement {
  const badge = h("span", { className: "badge" });
  const preview = h("span", { className: "preview", text: "Aa" });
  const paint = (): void => {
    const matched = itemsOf(host.scene, rule.target).filter((item) => ruleMatches(rule, item)).length;
    badge.textContent = `${matched} match${matched === 1 ? "" : "es"}`;
    preview.style.background = rule.color;
  };
  const apply = (): void => {
    paint();
    host.preview();
  };
  paint();
  return h(
    "div",
    { className: "rule-card" },
    ruleHeader(host, rule, index, badge, apply),
    ruleCondition(host, rule, index, apply),
    h("div", { className: "rule-effect" },
      field("Rule color", rule.color, (value) => {
        rule.color = value;
        apply();
      }, "color", host.begin),
      field("Rule size (0 keeps the default)", rule.size, (value) => {
        rule.size = Math.max(0, Math.min(70, Number(value) || 0));
        apply();
      }, "number", host.begin),
      preview),
    swatches(host, rule),
  );
}
function rules(host: StyleHost): HTMLElement {
  const scene = host.scene;
  return group(
    "Rules",
    hint("The first enabled rule that matches wins, so order is priority. Rules override the colors above."),
    ...scene.style.rules.map((rule, index) => ruleCard(host, rule, index)),
    button("Add rule", () => {
      host.begin();
      scene.style.rules.push({
        target: "nodes",
        property: "",
        value: "",
        color: PREDEFINED_COLORS[scene.style.rules.length % PREDEFINED_COLORS.length],
        size: 0,
        op: "equals",
        label: [...counts(scene, "nodes").keys()][0] ?? "",
        enabled: true,
      });
      host.refresh();
    }),
  );
}
function defaults(host: StyleHost): HTMLElement {
  const s = host.scene.style;
  const id = "ge-caption-properties";
  const set = (apply: (value: string) => void) => (value: string): void => {
    apply(value);
    host.preview();
  };
  const number = (low: number, high: number, fallback: number) => (value: string): number =>
    Math.max(low, Math.min(high, Number(value) || fallback));
  const live = (label: string, value: string | number, apply: (value: string) => void, type = "text", list?: string) =>
    field(label, value, set(apply), type, host.begin, list);
  return h(
    "details",
    {},
    h("summary", { text: "Defaults" }),
    hint("Used by node types and relationship types that have no color, size or caption of their own."),
    live("Caption property", s.caption, (v) => { s.caption = v; }, "text", id),
    datalist(id, propertyNames(host.scene, "nodes")),
    live("Icon (text or symbol)", s.icon, (v) => { s.icon = v.slice(0, 8); }),
    live("Node color", s.color, (v) => { s.color = v; }, "color"),
    live("Node size", s.size, (v) => { s.size = number(4, 70, 18)(v); }, "number"),
    live("Edge caption property", s.edgeCaption, (v) => { s.edgeCaption = v; }),
    live("Edge icon (text or symbol)", s.edgeIcon, (v) => { s.edgeIcon = v.slice(0, 8); }),
    live("Edge color", s.edgeColor, (v) => { s.edgeColor = v; }, "color"),
    live("Edge width", s.edgeSize, (v) => { s.edgeSize = number(1, 12, 1)(v); }, "number"),
  );
}
export function stylePanel(host: StyleHost): HTMLElement {
  return h(
    "div",
    { className: "tab" },
    hint("Choose a color for each node or relationship type. Changes are previewed instantly; advanced options and conditional rules are optional."),
    categories(host, "labels"),
    categories(host, "types"),
    h("details", { className: "ge-disclosure ge-rules", attrs: host.scene.style.rules.length ? { open: "" } : {} },
      h("summary", { text: `Conditional color rules (${host.scene.style.rules.length})` }),
      rules(host),
    ),
    defaults(host),
    button("Reset styles", () => {
      host.begin();
      const s = host.scene.style;
      s.labels = {};
      s.types = {};
      s.rules = [];
      assignDefaults(host.scene);
      host.refresh();
    }),
  );
}
