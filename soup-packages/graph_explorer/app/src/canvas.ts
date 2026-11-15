import type {
  GraphRenderer,
  NodeShape,
  RenderOptions,
} from "../../../soup_base/app/src/graph/renderer";
import {
  type Graph,
  type Item,
  type Point,
  type Scene,
  lookOf,
  matches,
} from "./scene";

const SELECTED = "#e99417";
const LANE_GAP = 36;

interface Loop extends Point {
  r: number;
}
/** Where an edge is drawn: a line, a curve (parallel edges) or a loop (self-relationship). */
interface Geo {
  a: Point;
  b: Point;
  c: Point | null;
  loop: Loop | null;
}
const mix = (p: Point, q: Point, t: number): Point => ({
  x: p.x + (q.x - p.x) * t,
  y: p.y + (q.y - p.y) * t,
});
function curveAt(g: Geo, t: number): Point {
  if (!g.c) return mix(g.a, g.b, t);
  return mix(mix(g.a, g.c, t), mix(g.c, g.b, t), t);
}
function distanceToEdge(g: Geo, p: Point): number {
  if (g.loop) return Math.abs(Math.hypot(p.x - g.loop.x, p.y - g.loop.y) - g.loop.r);
  let best = Infinity;
  for (let i = 0; i <= 16; i++) {
    const q = curveAt(g, i / 16);
    best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return best;
}
function pairKey(source: string, target: string): string {
  return source < target ? `${source}\u0000${target}` : `${target}\u0000${source}`;
}

export class ExplorerCanvas implements GraphRenderer {
  public onNodeClick: ((id: string) => void) | null = null;
  public onSelect: (() => void) | null = null;
  public onBefore: (() => void) | null = null;
  public onMenu: ((event: MouseEvent) => void) | null = null;
  public mode = "select";
  public model: Graph = { nodes: [], edges: [], directed: true };
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private observer: ResizeObserver | null = null;
  private frame = 0;
  private wheelSaved = -Infinity;
  private width = 800;
  private height = 600;
  /** Position of each edge among the edges that join the same two nodes. */
  private lanes = new Map<string, { index: number; count: number }>();
  private gesture: {
    start: Point;
    last: Point;
    node: string | null;
    points: Point[];
    moved: boolean;
  } | null = null;
  public constructor(public scene: Scene) {}
  public mount(container: HTMLElement): void {
    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText =
      "width:100%;height:100%;display:block;touch-action:none";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      "Graph canvas. Drag to pan; wheel to zoom; Shift-click for multi-select.",
    );
    container.append(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.canvas.addEventListener("pointerdown", this.down);
    this.canvas.addEventListener("pointermove", this.move);
    this.canvas.addEventListener("pointerup", this.up);
    this.canvas.addEventListener("pointercancel", this.up);
    this.canvas.addEventListener("wheel", this.wheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.menu);
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(container);
    }
    this.resize();
  }
  public render(model: Graph, _options: RenderOptions): void {
    this.model = model;
    model.nodes.forEach(
      (n, i) =>
        (this.scene.positions[n.id] ??= {
          x: Math.cos(i) * 200,
          y: Math.sin(i) * 200,
        }),
    );
    this.assignLanes();
    this.draw();
  }
  private assignLanes(): void {
    const groups = new Map<string, string[]>();
    for (const edge of this.model.edges) {
      const key = pairKey(edge.source, edge.target);
      groups.set(key, [...(groups.get(key) ?? []), edge.id]);
    }
    this.lanes.clear();
    for (const ids of groups.values())
      ids.forEach((id, index) => this.lanes.set(id, { index, count: ids.length }));
  }
  public setNodeShape(_shape: NodeShape): void {
    this.draw();
  }
  public setRelationshipVisible(_type: string, _visible: boolean): void {
    this.draw();
  }
  public setHighlighted(_ids: readonly string[], _on: boolean): void {
    this.draw();
  }
  public clear(): void {
    this.model = { nodes: [], edges: [], directed: true };
    this.lanes.clear();
    this.draw();
  }
  public exportSvg(): string {
    this.paint();
    return this.canvas
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}"><image width="100%" height="100%" href="${this.canvas.toDataURL("image/png")}"/></svg>`
      : "";
  }
  public png(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.paint();
      this.canvas?.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("PNG export failed")),
        "image/png",
      );
    });
  }
  public fit(): void {
    const points = this.model.nodes
      .map((n) => this.scene.positions[n.id])
      .filter(Boolean);
    if (!points.length) return;
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y),
      minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const k = Math.min(
      2,
      Math.max(
        0.05,
        Math.min(
          (this.width - 100) / (maxX - minX + 100),
          (this.height - 100) / (maxY - minY + 100),
        ),
      ),
    );
    this.scene.camera = {
      x: this.width / 2 - ((minX + maxX) / 2) * k,
      y: this.height / 2 - ((minY + maxY) / 2) * k,
      k,
    };
    this.draw();
  }
  private resize(): void {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.width = rect.width || 800;
    this.height = rect.height || 600;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.width * ratio;
    this.canvas.height = this.height * ratio;
    this.draw();
  }
  public draw(): void {
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.paint();
      });
  }
  private color(item: Item): { color: string; size: number } {
    const look = lookOf(this.scene, item);
    return {
      color: this.scene.selection.includes(item.id) ? SELECTED : look.color,
      size: look.size,
    };
  }
  private paint(): void {
    const c = this.ctx;
    if (!c || !this.canvas) return;
    const dark =
      this.canvas.getRootNode() instanceof ShadowRoot &&
      getComputedStyle(this.canvas).colorScheme.includes("dark");
    c.setTransform(
      this.canvas.width / this.width,
      0,
      0,
      this.canvas.height / this.height,
      0,
      0,
    );
    c.fillStyle = dark ? "#151c27" : "#fafbfc";
    c.fillRect(0, 0, this.width, this.height);
    c.save();
    const camera = this.scene.camera;
    c.translate(camera.x, camera.y);
    c.scale(camera.k, camera.k);
    this.model.edges.forEach((edge) => this.paintEdge(c, edge, dark));
    this.model.nodes.forEach((node) => this.paintNode(c, node, dark));
    c.restore();
    c.globalAlpha = 1;
    this.minimap(c);
    this.paintSelectionShape(c);
  }
  private paintSelectionShape(c: CanvasRenderingContext2D): void {
    if (!this.gesture || this.mode === "select" || this.gesture.node) return;
    const points = this.gesture.points;
    c.strokeStyle = SELECTED;
    c.beginPath();
    c.moveTo(points[0].x, points[0].y);
    if (this.mode === "box")
      c.rect(
        points[0].x,
        points[0].y,
        points.at(-1)!.x - points[0].x,
        points.at(-1)!.y - points[0].y,
      );
    else points.forEach((p) => c.lineTo(p.x, p.y));
    c.stroke();
  }
  private dim(item: Item): number {
    return this.scene.filter.mode === "dim" && !matches(this.scene, item)
      ? 0.12
      : 1;
  }
  private nodeSize(id: string): number {
    const node = this.model.nodes.find((n) => n.id === id);
    return node ? this.color(node).size : 18;
  }
  private geometry(edge: Graph["edges"][number]): Geo | null {
    const a = this.scene.positions[edge.source],
      b = this.scene.positions[edge.target];
    if (!a || !b) return null;
    const lane = this.lanes.get(edge.id) ?? { index: 0, count: 1 };
    if (edge.source === edge.target) {
      const r = 14 + lane.index * 7;
      return { a, b, c: null, loop: { x: a.x, y: a.y - this.nodeSize(edge.source) - r + 4, r } };
    }
    const [lo, hi] = edge.source < edge.target ? [a, b] : [b, a];
    const length = Math.hypot(hi.x - lo.x, hi.y - lo.y) || 1;
    const bulge = (lane.index - (lane.count - 1) / 2) * LANE_GAP * 2;
    const c = bulge
      ? {
          x: (a.x + b.x) / 2 - ((hi.y - lo.y) / length) * bulge,
          y: (a.y + b.y) / 2 + ((hi.x - lo.x) / length) * bulge,
        }
      : null;
    return { a, b, c, loop: null };
  }
  private paintEdge(
    c: CanvasRenderingContext2D,
    edge: Graph["edges"][number],
    dark: boolean,
  ): void {
    const g = this.geometry(edge);
    if (!g) return;
    const style = this.color(edge);
    c.globalAlpha = this.dim(edge);
    c.strokeStyle = style.color;
    c.fillStyle = style.color;
    c.lineWidth = style.size;
    c.beginPath();
    if (g.loop) c.arc(g.loop.x, g.loop.y, g.loop.r, 0, Math.PI * 2);
    else {
      c.moveTo(g.a.x, g.a.y);
      if (g.c) c.quadraticCurveTo(g.c.x, g.c.y, g.b.x, g.b.y);
      else c.lineTo(g.b.x, g.b.y);
    }
    c.stroke();
    this.paintArrow(c, g, this.nodeSize(edge.target));
    if (this.scene.camera.k > 0.6) this.paintEdgeLabel(c, edge, g, dark);
  }
  private paintArrow(c: CanvasRenderingContext2D, g: Geo, size: number): void {
    let tip: Point, angle: number;
    if (g.loop) {
      const a = Math.PI * 0.3;
      tip = { x: g.loop.x + Math.cos(a) * g.loop.r, y: g.loop.y + Math.sin(a) * g.loop.r };
      angle = a + Math.PI / 2;
    } else {
      const from = g.c ?? g.a;
      angle = Math.atan2(g.b.y - from.y, g.b.x - from.x);
      tip = { x: g.b.x - Math.cos(angle) * (size + 3), y: g.b.y - Math.sin(angle) * (size + 3) };
    }
    c.beginPath();
    c.moveTo(tip.x, tip.y);
    c.lineTo(tip.x - Math.cos(angle - 0.4) * 10, tip.y - Math.sin(angle - 0.4) * 10);
    c.lineTo(tip.x - Math.cos(angle + 0.4) * 10, tip.y - Math.sin(angle + 0.4) * 10);
    c.fill();
  }
  private paintEdgeLabel(
    c: CanvasRenderingContext2D,
    edge: Graph["edges"][number],
    g: Geo,
    dark: boolean,
  ): void {
    const look = lookOf(this.scene, edge);
    const text = look.caption ? (edge.props[look.caption] ?? edge.label) : edge.label;
    const at = g.loop ? { x: g.loop.x, y: g.loop.y - g.loop.r - 3 } : curveAt(g, 0.5);
    c.fillStyle = dark ? "#c9d4e2" : "#42566b";
    c.font = "10px system-ui";
    c.textAlign = "center";
    c.fillText((look.icon + " " + String(text)).trim().slice(0, 40), at.x, at.y);
  }
  private paintNode(
    c: CanvasRenderingContext2D,
    node: Graph["nodes"][number],
    dark: boolean,
  ): void {
    const p = this.scene.positions[node.id],
      style = this.color(node),
      look = lookOf(this.scene, node);
    c.globalAlpha = this.dim(node);
    c.fillStyle = style.color;
    c.beginPath();
    c.arc(p.x, p.y, style.size, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = this.scene.pins.includes(node.id)
      ? SELECTED
      : dark
        ? "#e1e7ee"
        : "#fff";
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = dark ? "#eef3fa" : "#172b40";
    c.font = "12px system-ui";
    c.textAlign = "center";
    const caption = look.caption
      ? (node.props[look.caption] ?? node.label)
      : node.label;
    c.fillText(
      (look.icon + " " + String(caption)).trim().slice(0, 70),
      p.x,
      p.y + style.size + 15,
    );
  }
  private mapBounds(): { x: number; y: number; k: number } {
    const points = Object.values(this.scene.positions),
      xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    const minX = Math.min(0, ...xs),
      minY = Math.min(0, ...ys),
      k = Math.min(
        140 / (Math.max(1, ...xs) - minX + 60),
        85 / (Math.max(1, ...ys) - minY + 60),
      );
    return { x: minX - 30, y: minY - 30, k };
  }
  private minimap(c: CanvasRenderingContext2D): void {
    const map = this.mapBounds(),
      left = this.width - 160,
      top = this.height - 105;
    c.save();
    c.beginPath();
    c.rect(left, top, 150, 95);
    c.clip();
    c.fillStyle = "#edf0f5";
    c.fillRect(left, top, 150, 95);
    this.model.nodes.forEach((node) => {
      const p = this.scene.positions[node.id];
      c.fillStyle = lookOf(this.scene, node).color;
      c.fillRect(
        left + (p.x - map.x) * map.k,
        top + (p.y - map.y) * map.k,
        2,
        2,
      );
    });
    const camera = this.scene.camera;
    c.strokeStyle = "#d17d0a";
    c.strokeRect(
      left + (-camera.x / camera.k - map.x) * map.k,
      top + (-camera.y / camera.k - map.y) * map.k,
      (this.width / camera.k) * map.k,
      (this.height / camera.k) * map.k,
    );
    c.restore();
  }
  private screen(event: MouseEvent): Point {
    const rect = this.canvas!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private world(p: Point): Point {
    const c = this.scene.camera;
    return { x: (p.x - c.x) / c.k, y: (p.y - c.y) / c.k };
  }
  private hit(p: Point): string | null {
    const w = this.world(p);
    const node = [...this.model.nodes]
      .reverse()
      .find(
        (n) =>
          Math.hypot(
            this.scene.positions[n.id].x - w.x,
            this.scene.positions[n.id].y - w.y,
          ) <
          this.color(n).size + 5,
      );
    if (node) return node.id;
    const reach = 6 / this.scene.camera.k;
    return (
      this.model.edges.find((e) => {
        const g = this.geometry(e);
        return g !== null && distanceToEdge(g, w) < reach;
      })?.id ?? null
    );
  }
  private down = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    this.canvas!.focus();
    this.onBefore?.();
    const p = this.screen(event);
    if (p.x > this.width - 160 && p.y > this.height - 105) {
      const m = this.mapBounds();
      this.scene.camera.x =
        this.width / 2 -
        ((p.x - this.width + 160) / m.k + m.x) * this.scene.camera.k;
      this.scene.camera.y =
        this.height / 2 -
        ((p.y - this.height + 105) / m.k + m.y) * this.scene.camera.k;
      this.draw();
      return;
    }
    const id = this.hit(p),
      node = this.model.nodes.find((n) => n.id === id);
    this.select(id, event.shiftKey);
    this.gesture = {
      start: p,
      last: p,
      node: node?.id ?? null,
      points: [p],
      moved: false,
    };
    this.canvas!.setPointerCapture?.(event.pointerId);
    this.onSelect?.();
    this.draw();
  };
  private select(id: string | null, multiple: boolean): void {
    if (!id) {
      if (!multiple) this.scene.selection = [];
      return;
    }
    const selected = this.scene.selection.includes(id);
    if (multiple)
      this.scene.selection = selected
        ? this.scene.selection.filter((x) => x !== id)
        : [...this.scene.selection, id];
    else if (!selected) this.scene.selection = [id];
  }
  private move = (event: PointerEvent): void => {
    const g = this.gesture;
    if (!g) return;
    const p = this.screen(event),
      dx = p.x - g.last.x,
      dy = p.y - g.last.y;
    g.moved ||= Math.hypot(p.x - g.start.x, p.y - g.start.y) > 3;
    if (g.node)
      this.scene.selection.forEach((id) => {
        const point = this.scene.positions[id];
        if (point) {
          point.x += dx / this.scene.camera.k;
          point.y += dy / this.scene.camera.k;
        }
      });
    else if (this.mode === "select") {
      this.scene.camera.x += dx;
      this.scene.camera.y += dy;
    } else if (g.points.length < 1000) g.points.push(p);
    g.last = p;
    this.draw();
  };
  private up = (): void => {
    const g = this.gesture;
    if (!g) return;
    if (!g.node && this.mode !== "select" && g.moved) {
      const polygon =
        this.mode === "box"
          ? [
              g.start,
              { x: g.last.x, y: g.start.y },
              g.last,
              { x: g.start.x, y: g.last.y },
            ]
          : g.points;
      const inside = (point: Point): boolean => {
        let yes = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const a = polygon[i],
            b = polygon[j];
          if (
            a.y > point.y !== b.y > point.y &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
          )
            yes = !yes;
        }
        return yes;
      };
      const c = this.scene.camera;
      this.scene.selection = this.model.nodes
        .filter((n) => {
          const p = this.scene.positions[n.id];
          return inside({ x: p.x * c.k + c.x, y: p.y * c.k + c.y });
        })
        .map((n) => n.id);
    }
    this.gesture = null;
    this.onSelect?.();
    this.draw();
  };
  private wheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (event.timeStamp - this.wheelSaved > 200) this.onBefore?.();
    this.wheelSaved = event.timeStamp;
    const p = this.screen(event),
      w = this.world(p),
      c = this.scene.camera;
    c.k = Math.max(0.05, Math.min(8, c.k * Math.exp(-event.deltaY * 0.001)));
    c.x = p.x - w.x * c.k;
    c.y = p.y - w.y * c.k;
    this.draw();
  };
  private menu = (event: MouseEvent): void => {
    event.preventDefault();
    const id = this.hit(this.screen(event));
    if (id && !this.scene.selection.includes(id)) this.scene.selection = [id];
    this.onSelect?.();
    this.onMenu?.(event);
  };
  public destroy(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.observer?.disconnect();
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }
}
