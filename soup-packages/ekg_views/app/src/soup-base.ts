/**
 * The types of the soup_base elements this package creates by tag, copied
 * from soup_base/README.md (the code of soup_base is never imported: the
 * elements are defined by its bundle, loaded first by the host because
 * the manifest requires soup_base).
 */

import { Block, VisualizerContext } from '@soup/sdk';

export interface GraphNodeModel {
  id: string;
  label: string;
  group: string;
  props: Record<string, unknown>;
}

export interface GraphEdgeModel {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  weight: number;
  props: Record<string, unknown>;
}

/** The data of a "graph" block. */
export interface GraphData {
  nodes: { id: string; label: string; group: string; props: Record<string, unknown> }[];
  edges: { id: string; source: string; target: string; label: string; group: string; props: Record<string, unknown> }[];
  directed: boolean;
}

export type SearchTarget = 'nodes' | 'edges';
export type NodeShape = 'rect' | 'circle';

export interface SearchPage<T> {
  items: T[];
  total: number;
}

/** The commands of the toolbar of <soup-graph-view>. */
export type GraphToolbarCommand = 'shape' | 'relationships' | 'search' | 'export' | 'counts';

/** <soup-graph-view>: zoom, relationship types, search, properties, SVG export. */
export interface SoupGraphViewElement extends HTMLElement {
  data: unknown;
  /** 'full' (default), 'none' (the visualizer has its own bar) or the commands to show. */
  toolbar: 'full' | 'none' | readonly GraphToolbarCommand[];
  /** Open, close (or toggle, without argument) the search panel. */
  openSearch(open?: boolean): void;
  readonly searchVisible: boolean;
  context: VisualizerContext | null;
  search: ((query: string, target: SearchTarget, offset: number, limit: number) => Promise<SearchPage<GraphNodeModel | GraphEdgeModel>>) | null;
  nodeDetails: ((id: string) => Promise<GraphNodeModel | null>) | null;
  thumbnail: boolean;
  setNodeShape(shape: NodeShape): void;
  exportSvg(): string;
}

/** <soup-report-view>: the blocks one below the other. */
export interface SoupReportViewElement extends HTMLElement {
  data: { blocks: Block[]; name?: string; description?: string } | undefined;
  context: VisualizerContext | null;
}

export interface ChartData {
  chart: 'pie' | 'bar' | 'line';
  labels: string[];
  datasets: { label: string; data: number[] }[];
}

export interface SoupChartElement extends HTMLElement {
  data: ChartData | undefined;
}

export interface TableData {
  columns: string[];
  rows: unknown[][];
  total?: number;
}

export interface SoupTableElement extends HTMLElement {
  data: TableData | undefined;
}

export interface SoupKeyValueElement extends HTMLElement {
  data: { items: { key: string; value: unknown }[] } | undefined;
}
