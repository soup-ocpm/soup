import type { Context } from './studio';

interface GraphNode { id: string; label: string; group: string; props: Record<string, unknown>; }
interface GraphEdge {
  id: string; source: string; target: string; label: string; group: string; props: Record<string, unknown>;
}
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; directed: boolean; }
interface GraphResult { backend?: string; graph: GraphData; total: number; limit: number; edge_limit: number; }
interface GraphView extends HTMLElement {
  data: GraphData; context: Context; thumbnail: boolean;
  nodeDetails: (id: string) => Promise<GraphNode | null>;
}

/** Dagre cannot lay out some parallel DF_C combinations. Group only the drawing,
 * retaining every relationship identity/property and leaving the response unchanged. */
function connectionGraph(data: GraphData): GraphData {
  const groups = new Map<string, GraphEdge[]>();
  for (const edge of data.edges) {
    const key = JSON.stringify([edge.source, edge.target]);
    const group = groups.get(key) ?? [];
    group.push(edge); groups.set(key, group);
  }
  return { ...data, edges: [...groups.values()].map((edges) => edges.length === 1 ? edges[0] : {
    ...edges[0], label: `${edges[0].label} × ${edges.length}`,
    props: { relationship_count: edges.length, relationships: edges.map((edge) => ({ id: edge.id, properties: edge.props })) }
  }) };
}

/** Same shared hierarchical renderer, controls and inspector as ekg_views. */
export class OceanClassGraph extends HTMLElement {
  public data!: GraphResult;
  public context!: Context;
  private readonly root = this.attachShadow({ mode: 'open' });
  private request = 0;

  public connectedCallback(): void {
    const style = document.createElement('style');
    style.textContent = ':host{display:block;min-width:0;color:inherit;font:inherit}header{display:flex;align-items:center;gap:12px;flex-wrap:wrap}button{font:inherit;color:inherit;background:transparent;border:1px solid #8888;border-radius:4px;padding:6px 12px}';
    const context = this.context;
    const graph = document.createElement('soup-graph-view') as GraphView;
    graph.setAttribute('engine', 'dagre'); graph.context = context;
    graph.nodeDetails = (id) => context.action<GraphNode | null>('node', { id });
    graph.thumbnail = false;
    const header = document.createElement('header'); const title = document.createElement('p');
    const status = document.createElement('p'); status.setAttribute('role', 'alert'); status.hidden = true;
    const reportError = (error: unknown): void => {
      status.textContent = `Could not draw the Class graph: ${error instanceof Error ? error.message : String(error)}`;
      status.hidden = false; context.notify(status.textContent, 'error');
    };
    const show = (): void => {
      status.hidden = true;
      const drawing = connectionGraph(this.data.graph);
      graph.data = drawing;
      title.textContent = `${drawing.nodes.length} / ${this.data.total} Class nodes · ${this.data.graph.edges.length} DF_C relationships in ${drawing.edges.length} connections (limit ${this.data.edge_limit})`;
      if (!drawing.nodes.length) { status.textContent = 'No Class nodes are available. Run an aggregation on this dataset first.'; status.hidden = false; }
    };
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Refresh graph';
    refresh.addEventListener('click', () => {
      const request = ++this.request; refresh.disabled = true;
      void context.action<GraphResult>('graph').then((data) => {
        if (request !== this.request) return;
        this.data = data; graph.thumbnail = false; show();
      }).catch((error: unknown) => {
        if (request === this.request) reportError(error);
      }).finally(() => { if (request === this.request) refresh.disabled = false; });
    });
    const heading = document.createElement('h3'); heading.textContent = context.object.name;
    const note = document.createElement('p');
    note.textContent = this.data.backend === 'memgraph'
      ? 'This saved aggregation is restored from its own Memgraph dataset state when opened.'
      : 'This view shows the dataset’s current aggregation. Later runs replace the graph; previously saved settings remain.';
    header.append(title, refresh); this.root.replaceChildren(style, heading, note, header, status, graph);
    graph.thumbnail = true;
    try { show(); } catch (error) { reportError(error); }
    graph.thumbnail = false;
  }

  public disconnectedCallback(): void { this.request++; }
}
