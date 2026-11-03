import dagre, { type Edge, type Graph, type GraphLabel } from '@dagrejs/dagre';
import * as d3 from 'd3';

import { GraphModel } from './model';
import { RelationshipPalette } from './palette';
import { GraphRenderer, NodeShape, RenderOptions } from './renderer';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_STYLE = 'fill: #fff; stroke: #000; stroke-width: 2px; user-select: none; cursor: pointer;';
const HIGHLIGHT_STYLE = 'fill: #ffac1c; stroke: #faa614; stroke-width: 2px; cursor: pointer;';
const LABEL_STYLE = 'font-size: 1.1em;';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Selection = d3.Selection<any, unknown, null, undefined>;

// The margin, in pixels, left around the graph by the first centering.
const FIT_MARGIN = 20;

// The space between a node's label and its border (dagre-d3's default padding).
const NODE_PADDING = 10;

// The box behind an edge label: padding around the text and corner radius.
const LABEL_PAD_X = 4;
const LABEL_PAD_Y = 2;
const LABEL_RADIUS = 4;
let arrowheads = 0;

interface Point {
  x: number;
  y: number;
}

/** A node for dagre: its label, shape and style (dagre adds its size and position). */
interface LayoutNode {
  label: string;
  shape: NodeShape;
  style: string;
  rx: number;
  ry: number;
  width: number;
  height: number;
  x?: number;
  y?: number;
  // The border, for the edges ending on it.
  intersect?: (point: Point) => Point;
}

/** An edge for dagre: its id, label and style, then the label size, the points and the label position. */
interface LayoutEdge {
  id: string;
  label: string;
  style: string;
  arrowheadStyle: string;
  labelpos?: 'l' | 'c' | 'r';
  labeloffset?: number;
  width?: number;
  height?: number;
  points?: Point[];
  x?: number;
  y?: number;
}

type LayoutGraph = Graph<GraphLabel, LayoutNode, LayoutEdge>;
// A node after dagre.layout(), which sets x and y.
type PlacedNode = LayoutNode & { x: number; y: number };

/** The data of an edge of the graph (dagre types it loosely). */
const edgeOf = (graph: LayoutGraph, e: Edge): LayoutEdge => graph.edge(e) as LayoutEdge;

/** A \-escaped label as dagre-d3 drew it: "\n" (backslash, n) is a new line, "\x" is x. */
function unescapeLabel(text: string): string {
  let result = '';
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      result += ch === 'n' ? '\n' : ch;
      escaped = false;
    } else if (ch === '\\') escaped = true;
    else result += ch;
  }
  return result;
}

/** A text label centered on (0, 0): one <tspan> per line, in a <g> moved by half its size. */
function addLabel(parent: Selection, text: string, style: string): Selection {
  const group = parent.append('g');
  const element = group.append('text').attr('style', style);
  for (const line of unescapeLabel(text).split('\n')) {
    element.append('tspan').attr('xml:space', 'preserve').attr('dy', '1em').attr('x', '1').text(line);
  }
  const box = (group.node() as SVGGElement).getBBox();
  return group.attr('transform', `translate(${-box.width / 2},${-box.height / 2})`);
}

/** Where the line from the center of a rectangle node towards `point` crosses its border. */
function intersectRect(node: PlacedNode, point: Point): Point {
  const { x, y } = node;
  const dx = point.x - x;
  const dy = point.y - y;
  let w = node.width / 2;
  let h = node.height / 2;
  if (Math.abs(dy) * w > Math.abs(dx) * h) {
    if (dy < 0) h = -h;
    return { x: x + (dy === 0 ? 0 : (h * dx) / dy), y: y + h };
  }
  if (dx < 0) w = -w;
  return { x: x + w, y: y + (dx === 0 ? 0 : (w * dy) / dx) };
}

/** Where the line from the center of a circle node of radius r towards `point` crosses it. */
function intersectCircle(node: PlacedNode, r: number, point: Point): Point {
  const { x: cx, y: cy } = node;
  const px = cx - point.x;
  const py = cy - point.y;
  const det = Math.sqrt(r * r * py * py + r * r * px * px);
  const dx = Math.abs((r * r * px) / det);
  const dy = Math.abs((r * r * py) / det);
  return { x: point.x < cx ? cx - dx : cx + dx, y: point.y < cy ? cy - dy : cy + dy };
}

/** The node's shape, behind its label, sized on the label plus the padding. */
function addShape(group: Selection, node: PlacedNode, width: number, height: number): Selection {
  if (node.shape === 'circle') {
    const r = Math.max(width, height) / 2;
    node.intersect = (point) => intersectCircle(node, r, point);
    return group.insert('circle', ':first-child').attr('x', -width / 2).attr('y', -height / 2).attr('r', r);
  }
  node.intersect = (point) => intersectRect(node, point);
  return group
    .insert('rect', ':first-child')
    .attr('rx', node.rx)
    .attr('ry', node.ry)
    .attr('x', -width / 2)
    .attr('y', -height / 2)
    .attr('width', width)
    .attr('height', height);
}

/** The arrowhead of an edge, in its color ("normal" in dagre-d3). */
function addArrowhead(defs: Selection, id: string, style: string): void {
  defs
    .append('marker')
    .attr('id', id)
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 9)
    .attr('refY', 5)
    .attr('markerUnits', 'strokeWidth')
    .attr('markerWidth', 8)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('style', style);
}

const edgeLine = d3
  .line<Point>()
  .x((point) => point.x)
  .y((point) => point.y)
  .curve(d3.curveBasis);

/** The key of an edge's elements across redraws (as dagre-d3's: source, target, name = the edge id). */
const edgeKey = (e: Edge): string => `${e.v}:${e.w}:${e.name ?? ''}`;

/** The <g class="name"> child of `parent`, created the first time. */
function child(parent: Selection, name: string): Selection {
  const found = parent.select(`g.${name}`);
  return found.empty() ? parent.append('g').attr('class', name) : found;
}

/** One g.node per node (kept across redraws by id), with its label and shape; sets the sizes dagre lays out. */
function drawNodes(parent: Selection, graph: LayoutGraph): d3.Selection<SVGGElement, string, SVGGElement, unknown> {
  const nodes = (parent as d3.Selection<SVGGElement, unknown, null, undefined>)
    .selectAll<SVGGElement, string>('g.node')
    .data(graph.nodes(), (id) => id)
    .join((enter) => enter.append('g').attr('class', 'node').style('opacity', 0));
  nodes.each(function (id) {
    const node = graph.node(id) as PlacedNode;
    const group = d3.select(this) as Selection;
    group.select('g.label').remove();
    group.select('.label-container').remove();
    const label = group.append('g').attr('class', 'label').attr('transform', 'translate(0,0)');
    const box = (addLabel(label, node.label, LABEL_STYLE).node() as SVGGElement).getBBox();
    const shape = addShape(group, node, box.width + 2 * NODE_PADDING, box.height + 2 * NODE_PADDING)
      .classed('label-container', true)
      .attr('style', node.style);
    const shapeBox = (shape.node() as SVGGraphicsElement).getBBox();
    node.width = shapeBox.width;
    node.height = shapeBox.height;
  });
  return nodes;
}

/**
 * One g.edgeLabel per edge (kept across redraws by id), with its label on a
 * light rounded box (rect.label-bg, presentation attributes: the same in
 * the exported SVG and in the thumbnail) that hides the line under the
 * text, so the label never looks struck through; sets the label sizes
 * dagre lays out (box included). An empty label has no box.
 */
function drawEdgeLabels(parent: Selection, graph: LayoutGraph): d3.Selection<SVGGElement, Edge, SVGGElement, unknown> {
  const labels = (parent as d3.Selection<SVGGElement, unknown, null, undefined>)
    .selectAll<SVGGElement, Edge>('g.edgeLabel')
    .data(graph.edges(), edgeKey)
    .join((enter) => enter.append('g').classed('edgeLabel', true).style('opacity', 0));
  labels.each(function (e) {
    const edge = edgeOf(graph, e);
    const group = d3.select(this) as Selection;
    group.select('.label').remove();
    group.select('rect.label-bg').remove();
    const box = (addLabel(group, edge.label, LABEL_STYLE).classed('label', true).node() as SVGGElement).getBBox();
    const width = box.width > 0 ? box.width + 2 * LABEL_PAD_X : 0;
    const height = box.height > 0 ? box.height + 2 * LABEL_PAD_Y : 0;
    if (width > 0 && height > 0) {
      group
        .insert('rect', ':first-child')
        .attr('class', 'label-bg')
        .attr('x', -width / 2)
        .attr('y', -height / 2)
        .attr('width', width)
        .attr('height', height)
        .attr('rx', LABEL_RADIUS)
        .attr('ry', LABEL_RADIUS)
        .attr('fill', '#fff')
        .attr('fill-opacity', 0.92)
        .attr('stroke', '#d0d7de')
        .attr('stroke-width', 1);
    }
    edge.width = width;
    edge.height = height;
  });
  return labels;
}

/** One g.edgePath per edge (kept across redraws by id): the curve from border to border and its arrowhead. */
function drawEdgePaths(parent: Selection, graph: LayoutGraph): void {
  const base = location.href.split('#')[0];
  const paths = (parent as d3.Selection<SVGGElement, unknown, null, undefined>)
    .selectAll<SVGGElement, Edge>('g.edgePath')
    .data(graph.edges(), edgeKey)
    .join((enter) => {
      const group = enter.append('g').attr('class', 'edgePath');
      group.append('path').attr('class', 'path');
      group.append('defs');
      return group;
    })
    .style('opacity', 1);
  paths.each(function (e) {
    const edge = edgeOf(graph, e);
    const id = `arrowhead${++arrowheads}`;
    const group = d3.select(this) as Selection;
    const points = (edge.points ?? []).slice(1, -1);
    points.unshift(graph.node(e.v).intersect!(points[0]));
    points.push(graph.node(e.w).intersect!(points[points.length - 1]));
    group.select('path.path').attr('marker-end', `url(${base}#${id})`).attr('d', edgeLine(points)).attr('style', edge.style);
    const defs = group.select('defs');
    defs.selectAll('*').remove();
    addArrowhead(defs, id, edge.arrowheadStyle);
  });
}

/**
 * The zoom that fits a laid out graph of graphWidth x graphHeight in a box
 * of boxWidth x boxHeight (centered, never enlarged), or null unless all
 * four sizes and the result are positive and finite: an empty graph is
 * laid out with an infinite size, and a container not shown yet is 0 x 0
 * (either gave the zoom "translate(NaN,NaN) scale(0)").
 */
export function fitTransform(graphWidth: number, graphHeight: number, boxWidth: number, boxHeight: number): d3.ZoomTransform | null {
  if (![graphWidth, graphHeight, boxWidth, boxHeight].every((size) => Number.isFinite(size) && size > 0)) return null;
  const scale = Math.min(1, (boxWidth - FIT_MARGIN) / graphWidth, (boxHeight - FIT_MARGIN) / graphHeight);
  const x = (boxWidth - graphWidth * scale) / 2;
  const y = (boxHeight - graphHeight * scale) / 2;
  if (!(scale > 0 && Number.isFinite(scale) && Number.isFinite(x) && Number.isFinite(y))) return null;
  return d3.zoomIdentity.translate(x, y).scale(scale);
}

/**
 * DagreGraphRenderer - the default engine, moved from the old
 * GraphComponent (createGraphVisualization, initializePanZoom,
 * onChangeNodeView, onChangeRelationshipsView, hoverEdge,
 * selectNodeSearched). Fixed on the way:
 *  - the old page redrew into the <svg> instead of the zoomed group
 *    (every hover/selection rendered a second copy outside the zoom);
 *    here the <svg> and its <g> are created once and every redraw is in
 *    that group, so zoom and pan stay;
 *  - the first centering was a transform attribute the zoom did not know
 *    (the first drag jumped back); here it is a zoom transform, applied
 *    only with valid sizes (fitTransform): an empty graph or a container
 *    not laid out yet leave it for the next draw or the first resize;
 *  - a hidden relationship type shown again kept no weight (thinner,
 *    label without weight): edges are always rebuilt from the model;
 *  - the weight scale had an empty domain with a single weight.
 * The layout is @dagrejs/dagre's; the drawing is d3, with the SVG
 * dagre-d3 made (g.output > g.edgePaths > g.edgePath, g.edgeLabels >
 * g.edgeLabel, g.nodes > g.node with its shape and g.label; the same
 * styles, arrowheads, curves and borders), which it replaces.
 */
export class DagreGraphRenderer implements GraphRenderer {
  public onNodeClick: ((id: string) => void) | null = null;

  private container: HTMLElement | null = null;
  private svg: Selection | null = null;
  private group: Selection | null = null;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private model: GraphModel | null = null;
  private options: RenderOptions = { palette: new RelationshipPalette(), shape: 'rect' };
  private readonly highlighted = new Set<string>();
  private centered = false;
  // The user zoomed or panned since the last new data: no more automatic fit.
  private moved = false;
  // The last graph laid out, centered when the container gets a size.
  private laidOut: LayoutGraph | null = null;
  private resizes: ResizeObserver | null = null;

  public mount(container: HTMLElement): void {
    this.container = container;
    const svg = d3.select(container).append('svg').attr('xmlns', SVG_NS).attr('class', 'soup-graph-svg').attr('width', '100%').attr('height', '100%');
    this.svg = svg;
    this.group = svg.append('g').attr('class', 'soup-graph-group');
    this.zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      this.group?.attr('transform', event.transform.toString());
      // Only the zooms of the user have a source event (the fit has none).
      if (event.sourceEvent) {
        this.moved = true;
        this.stopWatchingSize();
      }
    });
    (svg as d3.Selection<SVGSVGElement, unknown, null, undefined>).call(this.zoom);
  }

  public render(model: GraphModel, options: RenderOptions): void {
    this.model = model;
    this.options = { ...options };
    this.highlighted.clear();
    this.centered = false;
    this.moved = false;
    this.draw();
  }

  public setNodeShape(shape: NodeShape): void {
    this.options = { ...this.options, shape };
    this.draw();
  }

  public setRelationshipVisible(type: string, visible: boolean): void {
    this.options.palette.setVisible(type, visible);
    this.draw();
  }

  public setHighlighted(ids: readonly string[], on: boolean): void {
    for (const id of ids) {
      if (on) this.highlighted.add(id);
      else this.highlighted.delete(id);
    }
    this.draw();
  }

  public clear(): void {
    this.model = null;
    this.laidOut = null;
    this.highlighted.clear();
    this.group?.selectAll('*').remove();
    this.stopWatchingSize();
  }

  public exportSvg(): string {
    const node = this.svg?.node() as SVGSVGElement | null;
    if (!node) return '';
    const copy = node.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('xmlns', SVG_NS);
    try {
      const box = (this.group?.node() as SVGGElement).getBBox();
      copy.setAttribute('viewBox', `${box.x - 10} ${box.y - 10} ${box.width + 20} ${box.height + 20}`);
      copy.querySelector('g.soup-graph-group')?.removeAttribute('transform');
    } catch {
      // getBBox needs a rendered SVG; keep the copy as it is.
    }
    return new XMLSerializer().serializeToString(copy);
  }

  public destroy(): void {
    this.stopWatchingSize();
    this.svg?.on('.zoom', null);
    this.svg?.remove();
    this.svg = this.group = null;
    this.container = null;
  }

  // ------------------------------------------------------------------ //
  private graph(model: GraphModel): LayoutGraph {
    const { palette, shape, direction } = this.options;
    const graph: LayoutGraph = new dagre.graphlib.Graph({ multigraph: true, compound: true });
    // dagre-d3 also passed multiedgesep: 10, which dagre ignores.
    graph.setGraph({ rankdir: direction ?? 'LR', nodesep: 25 });

    const nodes = model.nodes.filter((node) => palette.isGroupVisible(node.group));
    const shown = new Set(nodes.map((node) => node.id));
    for (const node of nodes) {
      const stroke = node.group ? `stroke: ${palette.groupColorOf(node.group)};` : '';
      graph.setNode(node.id, {
        label: node.label,
        shape,
        rx: 5,
        ry: 5,
        style: this.highlighted.has(node.id) ? HIGHLIGHT_STYLE : NODE_STYLE + stroke,
        width: 0,
        height: 0
      });
    }

    const edges = model.edges.filter((edge) => palette.isVisible(edge.type) && shown.has(edge.source) && shown.has(edge.target));
    const weights = edges.map((edge) => edge.weight);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const width = min === max ? () => 3 : d3.scaleLinear().domain([min, max]).range([2, 5]);
    for (const edge of edges) {
      const color = palette.colorOf(edge.type);
      graph.setEdge(
        edge.source,
        edge.target,
        {
          id: edge.id,
          label: edge.label,
          style: `stroke: ${color}; stroke-width: ${width(edge.weight)}px; fill: none;`,
          arrowheadStyle: `fill: ${color};`,
          labelpos: 'c',
          labeloffset: 5
        },
        edge.id
      );
    }
    return graph;
  }

  private draw(): void {
    if (!this.group || !this.svg || !this.model) return;
    const graph = this.graph(this.model);
    const output = child(this.group, 'output');
    child(output, 'clusters');
    const paths = child(output, 'edgePaths');
    const labels = drawEdgeLabels(child(output, 'edgeLabels'), graph);
    const nodes = drawNodes(child(output, 'nodes'), graph);

    dagre.layout(graph);

    nodes.attr('transform', (id) => `translate(${graph.node(id).x},${graph.node(id).y})`).style('opacity', 1);
    labels
      .attr('transform', (e) => {
        const edge = edgeOf(graph, e);
        return edge.x === undefined ? '' : `translate(${edge.x},${edge.y})`;
      })
      .style('opacity', 1);
    drawEdgePaths(paths, graph);

    nodes.on('click', (event: MouseEvent, id: string) => {
      event.stopPropagation();
      this.onNodeClick?.(id);
    });

    this.laidOut = graph;
    if (!this.centered) {
      this.centered = this.center(graph);
      if (!this.moved) this.watchSize();
    }
  }

  /**
   * Fit the graph in the container, as a zoom transform (pan and zoom
   * continue from it). False, and nothing applied, without valid sizes.
   */
  private center(graph: LayoutGraph): boolean {
    if (!this.svg || !this.zoom || !this.container) return false;
    const { width = 0, height = 0 } = graph.graph();
    const box = this.container.getBoundingClientRect();
    const transform = fitTransform(width, height, box.width, box.height);
    if (!transform) return false;
    (this.svg as d3.Selection<SVGSVGElement, unknown, null, undefined>).call(this.zoom.transform, transform);
    return true;
  }

  /**
   * Fit the last graph laid out again whenever the container changes size
   * (it gets one, the window or the toolbar changes), until the user zooms
   * or pans: then the view stays theirs. Where ResizeObserver exists.
   */
  private watchSize(): void {
    if (this.resizes || !this.container || typeof ResizeObserver === 'undefined') return;
    this.resizes = new ResizeObserver(() => {
      if (this.moved || !this.laidOut) return;
      this.centered = this.center(this.laidOut) || this.centered;
    });
    this.resizes.observe(this.container);
  }

  private stopWatchingSize(): void {
    this.resizes?.disconnect();
    this.resizes = null;
  }
}
