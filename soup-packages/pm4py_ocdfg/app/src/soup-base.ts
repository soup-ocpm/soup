/** Runtime elements are supplied by the declared soup_base package dependency. */
import type { GraphNode, GraphEdge as Edge, VisualizerContext } from '@soup/sdk';

export type GraphEdge = Required<Edge>;

export interface GraphData {
  nodes: Required<GraphNode>[];
  edges: GraphEdge[];
  directed: boolean;
}

export interface SoupGraphView extends HTMLElement {
  data: GraphData;
  context: VisualizerContext;
  toolbar: readonly string[];
  thumbnail: boolean;
  model: unknown;
  palette: unknown;
  shape: unknown;
  renderer: { render(model: unknown, options: {palette: unknown; shape: unknown; direction: string}): void } | null;
  openSearch(): void;
  exportSvg(): string;
  selectNode(id: string | null): void;
  highlight(ids: readonly string[], on: boolean): void;
}
