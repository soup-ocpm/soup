import type { Graph, Point, Scene } from "./scene";

interface Input {
  ids: string[];
  pairs: [string, string][];
  positions: Record<string, Point>;
  pins: string[];
}
/*
 * Fixed layered layout, left to right like the EKG graph views. The helpers are
 * self-contained functions so the same bounded calculation runs inside a
 * disposable worker.
 */

/** The edges that keep the graph acyclic: loops and edges that close a cycle are ignored for ranking. */
function acyclic(ids: string[], pairs: [string, string][]): Map<string, string[]> {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  pairs.forEach(([from, to]) => {
    if (from !== to) out.get(from)?.push(to);
  });
  const kept = new Map<string, string[]>(ids.map((id) => [id, []]));
  const state = new Map<string, number>();
  for (const root of ids) {
    if (state.has(root)) continue;
    const stack: [string, number][] = [[root, 0]];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const next = out.get(top[0])![top[1]++];
      if (next === undefined) {
        state.set(top[0], 2);
        stack.pop();
      } else if (state.get(next) !== 1) {
        kept.get(top[0])!.push(next);
        if (!state.has(next)) {
          state.set(next, 1);
          stack.push([next, 0]);
        }
      }
    }
  }
  return kept;
}
/** Longest-path ranks: every kept edge points to a strictly higher rank. */
function longest(ids: string[], kept: Map<string, string[]>): Map<string, number> {
  const incoming = new Map<string, number>(ids.map((id) => [id, 0]));
  kept.forEach((list) => list.forEach((to) => incoming.set(to, incoming.get(to)! + 1)));
  const queue = ids.filter((id) => !incoming.get(id));
  const rank = new Map<string, number>(queue.map((id) => [id, 0]));
  for (let i = 0; i < queue.length; i++)
    for (const to of kept.get(queue[i])!) {
      rank.set(to, Math.max(rank.get(to) ?? 0, rank.get(queue[i])! + 1));
      incoming.set(to, incoming.get(to)! - 1);
      if (!incoming.get(to)) queue.push(to);
    }
  return rank;
}
/** One column per rank; a few barycenter sweeps reduce crossings. */
function order(ids: string[], rank: Map<string, number>, pairs: [string, string][]): string[][] {
  const columns: string[][] = [];
  ids.forEach((id) => (columns[rank.get(id) ?? 0] ??= []).push(id));
  const near = new Map<string, string[]>(ids.map((id) => [id, []]));
  pairs.forEach(([a, b]) => {
    if (a !== b) {
      near.get(a)?.push(b);
      near.get(b)?.push(a);
    }
  });
  const index = new Map<string, number>();
  const refresh = (column: string[]): void =>
    column.forEach((id, i) => index.set(id, i));
  columns.forEach((column) => column && refresh(column));
  for (let pass = 0; pass < 4; pass++) {
    const down = pass % 2 === 0,
      step = down ? 1 : -1;
    for (let c = down ? 1 : columns.length - 2; columns[c]; c += step) {
      const score = (id: string): number => {
        const known = near.get(id)!.filter((n) => rank.get(n) === c - step);
        return known.length
          ? known.reduce((sum, n) => sum + index.get(n)!, 0) / known.length
          : index.get(id)!;
      };
      columns[c] = columns[c]
        .map((id, i) => ({ id, i, s: score(id) }))
        .sort((a, b) => a.s - b.s || a.i - b.i)
        .map((entry) => entry.id);
      refresh(columns[c]);
    }
  }
  return columns;
}
/** Columns of at most 24 rows; taller ones wrap into sub-columns so large result sets stay readable. */
function place(columns: string[][]): Record<string, Point> {
  const points: Record<string, Point> = {};
  let x = 0;
  for (const column of columns) {
    if (!column) continue;
    const rows = Math.min(column.length, 24);
    column.forEach((id, i) => {
      points[id] = {
        x: x + Math.floor(i / 24) * 130,
        y: ((i % 24) - (rows - 1) / 2) * 90,
      };
    });
    x += Math.ceil(column.length / 24) * 130 + 110;
  }
  return points;
}
function calculate(input: Input): Record<string, Point> {
  const rank = longest(input.ids, acyclic(input.ids, input.pairs));
  const points = place(order(input.ids, rank, input.pairs));
  for (const id of input.pins)
    if (input.positions[id] && points[id]) points[id] = { ...input.positions[id] };
  return points;
}
export class Layout {
  private worker: Worker | null = null;
  private version = 0;
  public stop(): void {
    this.version++;
    this.worker?.terminate();
    this.worker = null;
  }
  public run(
    scene: Scene,
    graph: Graph,
    done: (points: Record<string, Point>) => void,
  ): void {
    this.stop();
    const version = this.version;
    const input: Input = {
      ids: graph.nodes.map((n) => n.id),
      pairs: graph.edges.map((e) => [e.source, e.target]),
      positions: scene.positions,
      pins: scene.pins,
    };
    if (typeof Worker === "undefined") {
      done(calculate(input));
      return;
    }
    const url = URL.createObjectURL(
      new Blob(
        [
          `${acyclic.toString()};${longest.toString()};${order.toString()};${place.toString()};onmessage=e=>postMessage((${calculate.toString()})(e.data))`,
        ],
        { type: "text/javascript" },
      ),
    );
    try {
      this.worker = new Worker(url);
    } catch {
      done(calculate(input));
      return;
    } finally {
      URL.revokeObjectURL(url);
    }
    this.worker.onmessage = (event) => {
      if (version === this.version) {
        this.worker?.terminate();
        this.worker = null;
        done(event.data as Record<string, Point>);
      }
    };
    this.worker.onerror = () => {
      if (version === this.version) {
        this.stop();
        done(calculate(input));
      }
    };
    this.worker.postMessage(input);
  }
}
