import { dispatchSoupEvent, errorMessage, h, NotifyContext, SOUP_EVENTS } from '@soup/sdk';

import { BASE_CSS, style } from '../dom';
import { DagreGraphRenderer } from './dagre-renderer';
import { GraphEdgeModel, GraphModel, GraphNodeModel, searchModel, SearchPage, SearchTarget, toGraphModel } from './model';
import { RelationshipPalette } from './palette';
import { propertiesPanel, searchPanel, ToolbarCommand, toolbarCommands, toolbarControls, ToolbarSetting } from './panels';
import { GraphRenderer, GraphRendererFactory, NodeShape } from './renderer';

/** Remote search: a visualizer may page the matches on the server (e.g. through its actions). */
type GraphSearch = (query: string, target: SearchTarget, offset: number, limit: number) => Promise<SearchPage<GraphNodeModel | GraphEdgeModel>>;

/** The full properties of a node (e.g. one found by the remote search and not drawn); null: unknown. */
type GraphNodeDetails = (id: string) => Promise<GraphNodeModel | null>;

const SEARCH_PAGE_SIZE = 50;
// The thumbnail is saved only below this size (the catalog accepts 1 MB).
const MAX_THUMBNAIL_CHARS = 512 * 1024;

// The height of the drawing follows the window (never below 420 px; 420 px
// below 768 px, where the area is narrow); --soup-graph-height sets it.
// Below 768 px the side panel goes under it.
const CSS = `
  :host { position: relative; --soup-graph-area: var(--soup-graph-height, clamp(520px, calc(100dvh - 160px), 1400px)); }
  .toolbar { display: flex; flex-wrap: wrap; gap: var(--soup-space-2, 8px) var(--soup-space-3, 12px); align-items: center; margin-bottom: var(--soup-space-2, 8px); }
  .toolbar[hidden] { display: none; }
  .toolbar .group { display: flex; flex-wrap: wrap; gap: var(--soup-space-2, 8px); align-items: center; }
  .toolbar .group + .group:not(.group-counts) { padding-left: var(--soup-space-3, 12px); border-left: 1px solid var(--soup-border, #d0d7de); }
  .toolbar .group-counts { margin-left: auto; }
  .counts { font-size: 0.85rem; }
  .layout { display: flex; gap: var(--soup-space-2, 8px); }
  .canvas { flex: 1 1 auto; min-width: 0; height: var(--soup-graph-area); border: 1px solid var(--soup-border, #d0d7de); border-radius: var(--soup-radius-md, 8px); background: #fff; overflow: hidden; touch-action: none; }
  .side { flex: 0 0 300px; min-width: 0; display: flex; flex-direction: column; gap: var(--soup-space-2, 8px); max-height: var(--soup-graph-area); }
  .side[hidden] { display: none; }
  @media (max-width: 767.98px) {
    :host { --soup-graph-area: var(--soup-graph-height, clamp(360px, 70dvh, 800px)); }
    .layout { flex-direction: column; }
    .side { flex-basis: auto; max-height: none; }
    .results { max-height: 240px; }
  }
  .tabs { display: flex; gap: var(--soup-space-1, 4px); }
  .tabs button[aria-selected='true'] { border-color: var(--soup-primary-strong, #b86e00); color: var(--soup-primary-strong, #b86e00); font-weight: 600; }
  .results { flex: 1 1 auto; overflow: auto; border: 1px solid var(--soup-border, #d0d7de); border-radius: var(--soup-radius-md, 8px); margin: 0; padding: 0; list-style: none; }
  .results li { padding: var(--soup-space-1, 4px) var(--soup-space-2, 8px); border-bottom: 1px solid #eaeef2; cursor: pointer; font-size: 0.85rem; }
  .results li:hover, .results li.selected { background: #fff4e0; }
  .properties { border: 1px solid var(--soup-border, #d0d7de); border-radius: var(--soup-radius-md, 8px); padding: var(--soup-space-2, 8px); max-height: 35vh; overflow: auto; }
  .properties .toolbar { justify-content: space-between; flex-wrap: nowrap; }
  .properties dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0; font-size: 0.85rem; }
  .properties dt { font-weight: 600; } .properties dd { margin: 0; word-break: break-word; }
  details.relationships { position: relative; }
  details.relationships > summary { cursor: pointer; padding: 2px 4px; border-radius: var(--soup-radius-sm, 4px); }
  details.relationships > div { position: absolute; z-index: 3; padding: 6px 10px; background: #fff; border: 1px solid var(--soup-border, #d0d7de); border-radius: var(--soup-radius-md, 8px); box-shadow: 0 4px 12px rgba(16, 24, 40, 0.1); max-height: 300px; overflow: auto; }
  label { display: block; white-space: nowrap; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; }
  .error { color: #b02a37; padding: var(--soup-space-3, 12px); }
  .soup-graph-svg { display: block; }
  .soup-graph-svg .edgePath path { fill: none; }
  .soup-graph-svg .edgeLabel text { fill: #333; }
`;

/**
 * <soup-graph-view> - a graph with zoom and pan, the node shape, the
 * visibility of each relationship type, the search of nodes and edges
 * (paged by scrolling, local or remote), the properties of the selected
 * node and the SVG export. Its public API is documented in
 * soup_base/README.md.
 */
export class SoupGraphView extends HTMLElement {
  private static readonly renderers = new Map<string, GraphRendererFactory>([['dagre', () => new DagreGraphRenderer()]]);

  /** Register an engine for <soup-graph-view engine="name">. */
  public static registerRenderer(name: string, factory: GraphRendererFactory): void {
    SoupGraphView.renderers.set(name, factory);
  }

  public static rendererNames(): string[] {
    return [...SoupGraphView.renderers.keys()];
  }

  public static readonly observedAttributes = ['engine', 'toolbar'];

  // Only notify() is used: any VisualizerContext fits.
  public context: NotifyContext | null = null;
  /** Remote search; null searches the model in the browser. */
  public search: GraphSearch | null = null;
  /** Asked for the properties of the selected node; null shows the ones of the model. */
  public nodeDetails: GraphNodeDetails | null = null;
  /** Emit soup-thumbnail with the SVG after drawing new data. */
  public thumbnail = true;

  public readonly palette = new RelationshipPalette();
  public model: GraphModel = { nodes: [], edges: [], directed: true };
  public shape: NodeShape = 'rect';
  public selected: GraphNodeModel | null = null;

  private readonly root = this.attachShadow({ mode: 'open' });
  private engine: GraphRenderer | null = null;
  private customEngine: GraphRenderer | null = null;
  private value: unknown;
  private error = '';

  // Search panel state
  private searchOpen = false;
  private target: SearchTarget = 'nodes';
  private query = '';
  private results: (GraphNodeModel | GraphEdgeModel)[] = [];
  private resultsTotal = 0;
  private loadingMore = false;
  private searchRequest = 0;
  private detailsRequest = 0;

  private canvas: HTMLElement | null = null;
  // The `toolbar` property; null: the attribute's value (default "full")
  private toolbarSetting: ToolbarSetting | null = null;

  // --- properties ---------------------------------------------------------- //
  /**
   * The commands of the toolbar: 'full' (default: shape, relationships,
   * search, export, counts), 'none' (no toolbar: the visualizer draws its
   * own, with openSearch() and exportSvg()) or the list of the commands to
   * show. Wins over the `toolbar` attribute ("full", "none" or the names
   * separated by spaces or commas).
   */
  public get toolbar(): ToolbarSetting {
    if (this.toolbarSetting !== null) return this.toolbarSetting;
    const attribute = this.getAttribute('toolbar');
    return attribute === null || attribute === 'full' || attribute === 'none' ? (attribute ?? 'full') : toolbarCommands(attribute);
  }

  public set toolbar(value: ToolbarSetting | null) {
    this.toolbarSetting = value;
    this.drawToolbar();
  }

  /** The commands the toolbar shows, in order. */
  public toolbarCommands(): ToolbarCommand[] {
    return toolbarCommands(this.toolbarSetting ?? this.getAttribute('toolbar'));
  }

  /** True when the search panel is open. */
  public get searchVisible(): boolean {
    return this.searchOpen;
  }
  public get data(): unknown {
    return this.value;
  }

  /** A graph block {nodes, edges, directed} or the EKG rows (see toGraphModel). */
  public set data(value: unknown) {
    this.value = value;
    try {
      this.model = toGraphModel(value);
      this.error = '';
    } catch (error) {
      this.model = { nodes: [], edges: [], directed: true };
      this.error = error instanceof Error ? error.message : String(error);
    }
    this.palette.assign(this.model);
    this.selected = null;
    if (this.isConnected) this.redraw(true);
  }

  /** The engine: an instance (wins over the `engine` attribute). */
  public get renderer(): GraphRenderer | null {
    return this.engine;
  }

  public set renderer(value: GraphRenderer | null) {
    this.customEngine = value;
    if (this.isConnected) this.redraw(false);
  }

  // --- lifecycle ----------------------------------------------------------- //
  public connectedCallback(): void {
    this.redraw(true);
  }

  public disconnectedCallback(): void {
    this.engine?.destroy();
    this.engine = null;
  }

  public attributeChangedCallback(name: string): void {
    if (name === 'toolbar') this.drawToolbar();
    else if (this.isConnected && !this.customEngine) this.redraw(false);
  }

  // --- methods ------------------------------------------------------------- //
  public setNodeShape(shape: NodeShape): void {
    this.shape = shape;
    this.engine?.setNodeShape(shape);
    this.drawToolbar();
  }

  public setRelationshipVisible(type: string, visible: boolean): void {
    if (this.engine) this.engine.setRelationshipVisible(type, visible);
    else this.palette.setVisible(type, visible);
  }

  public highlight(ids: readonly string[], on: boolean): void {
    this.engine?.setHighlighted(ids, on);
  }

  /**
   * Select a node (null: none) of the model or of the search results: it
   * is highlighted and its properties shown (asked to nodeDetails, if set).
   */
  public selectNode(id: string | null): void {
    const previous = this.selected;
    if (previous) this.highlight([previous.id], false);
    this.selected = id === null || id === previous?.id ? null : this.findNode(id);
    if (this.selected) this.highlight([this.selected.id], true);
    this.drawSide();
    this.dispatchEvent(new CustomEvent('soup-node-select', { detail: { id: this.selected?.id ?? null, node: this.selected }, bubbles: true, composed: true }));
    if (this.selected && this.nodeDetails) void this.loadDetails(this.selected.id);
  }

  private findNode(id: string): GraphNodeModel | null {
    const drawn = this.model.nodes.find((node) => node.id === id);
    if (drawn) return drawn;
    const found = this.results.find((item): item is GraphNodeModel => !('source' in item) && item.id === id);
    return found ?? null;
  }

  private async loadDetails(id: string): Promise<void> {
    const request = ++this.detailsRequest;
    try {
      const node = await this.nodeDetails!(id);
      // Another node was selected meanwhile, or none.
      if (request !== this.detailsRequest || this.selected?.id !== id || !node) return;
      this.selected = { ...this.selected, label: node.label || this.selected.label, props: { ...node.props } };
      this.drawSide();
    } catch (error) {
      this.context?.notify(errorMessage(error), 'error');
    }
  }

  public exportSvg(): string {
    return this.engine?.exportSvg() ?? '';
  }

  /** Save the current drawing as graph.svg. */
  public downloadSvg(filename = 'graph.svg'): void {
    const svg = this.exportSvg();
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const link = h('a', { attrs: { href: url, download: filename } });
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /** Search nodes or edges (resets the list); more are loaded when scrolling. */
  public async runSearch(query: string, target: SearchTarget = this.target): Promise<void> {
    this.query = query;
    this.target = target;
    this.results = [];
    this.resultsTotal = 0;
    // A new search replaces the page being loaded for the previous one.
    this.loadingMore = false;
    await this.loadMore();
  }

  // --- drawing ------------------------------------------------------------- //
  private createEngine(): GraphRenderer {
    if (this.customEngine) return this.customEngine;
    const name = this.getAttribute('engine') || 'dagre';
    const factory = SoupGraphView.renderers.get(name) ?? SoupGraphView.renderers.get('dagre')!;
    return factory();
  }

  private redraw(newData: boolean): void {
    if (!this.canvas) this.drawSkeleton();
    const engine = this.createEngine();
    if (engine !== this.engine) {
      this.engine?.destroy();
      this.engine = engine;
      this.canvas!.replaceChildren();
      engine.onNodeClick = (id) => this.selectNode(id);
      engine.mount(this.canvas!);
    }
    this.drawToolbar();
    this.drawSide();
    if (this.error) {
      this.engine.clear();
      this.canvas!.append(h('div', { className: 'error', attrs: { role: 'alert' }, text: this.error }));
      return;
    }
    this.engine.render(this.model, { palette: this.palette, shape: this.shape });
    if (newData) {
      void this.runSearch(this.query);
      this.emitThumbnail();
    }
  }

  private drawSkeleton(): void {
    this.canvas = h('div', { className: 'canvas' });
    this.root.replaceChildren(
      style(BASE_CSS + CSS),
      h('div', { className: 'toolbar' }),
      h('div', { className: 'layout' }, this.canvas, h('div', { className: 'side', attrs: { hidden: '' } }))
    );
  }

  private drawToolbar(): void {
    // The first .toolbar: the properties panel has one too, after it.
    const toolbar = this.root.querySelector<HTMLElement>('.toolbar');
    if (!toolbar) return;
    const commands = this.toolbarCommands();
    toolbar.hidden = commands.length === 0;
    const state = {
      shape: this.shape,
      relationships: this.palette.relationshipTypes(),
      searchOpen: this.searchOpen,
      nodes: this.model.nodes.length,
      edges: this.model.edges.length
    };
    toolbar.replaceChildren(
      ...toolbarControls(state, {
        setShape: (shape) => this.setNodeShape(shape),
        setRelationshipVisible: (type, visible) => this.setRelationshipVisible(type, visible),
        toggleSearch: () => this.openSearch(),
        exportSvg: () => this.downloadSvg()
      }, commands)
    );
  }

  /**
   * Open (true) or close (false) the search panel; without an argument,
   * toggle it. For a visualizer with its own toolbar (toolbar = 'none').
   */
  public openSearch(open = !this.searchOpen): void {
    this.searchOpen = open;
    this.drawToolbar();
    this.drawSide();
    if (open) this.root.querySelector<HTMLInputElement>('.side input[type="search"]')?.focus();
  }

  private drawSide(): void {
    const side = this.root.querySelector<HTMLElement>('.side');
    if (!side) return;
    side.hidden = !this.searchOpen && !this.selected;
    const parts: Node[] = [];
    if (this.searchOpen) {
      const search = searchPanel(this.target, this.query, {
        setTarget: (target) => void this.runSearch(this.query, target).then(() => this.drawSide()),
        setQuery: (query) => void this.runSearch(query),
        scrolled: (list) => this.onResultsScroll(list)
      });
      this.fillResults(search.results);
      parts.push(...search.parts);
    }
    if (this.selected) parts.push(propertiesPanel(this.selected, () => this.selectNode(null)));
    side.replaceChildren(...parts);
  }

  private fillResults(list: HTMLElement): void {
    list.replaceChildren(
      ...this.results.map((item) => {
        if ('source' in item) {
          const edge = item;
          const label = `${this.nodeLabel(edge.source)} → ${this.nodeLabel(edge.target)} (${edge.label})`;
          return h('li', {
            text: label,
            on: { mouseenter: () => this.highlight([edge.source, edge.target], true), mouseleave: () => this.highlight([edge.source, edge.target], this.selected ? [edge.source, edge.target].includes(this.selected.id) : false) }
          });
        }
        const node = item;
        const row = h('li', { text: node.label, on: { click: () => this.selectNode(node.id) } });
        if (this.selected?.id === node.id) row.className = 'selected';
        return row;
      }),
      ...(this.results.length < this.resultsTotal ? [h('li', { className: 'muted more', text: `${this.results.length} of ${this.resultsTotal}…` })] : [])
    );
  }

  private nodeLabel(id: string): string {
    return this.model.nodes.find((node) => node.id === id)?.label ?? id;
  }

  private onResultsScroll(list: HTMLElement): void {
    if (list.scrollTop + list.clientHeight >= list.scrollHeight * 0.9) void this.loadMore();
  }

  /** The next page of the search (incremental scroll), local or through `search`. */
  public async loadMore(): Promise<void> {
    if (this.loadingMore || (this.results.length > 0 && this.results.length >= this.resultsTotal)) return;
    this.loadingMore = true;
    const request = ++this.searchRequest;
    try {
      const page = this.search
        ? await this.search(this.query, this.target, this.results.length, SEARCH_PAGE_SIZE)
        : searchModel(this.model, this.query, this.target, this.results.length, SEARCH_PAGE_SIZE);
      if (request !== this.searchRequest) return;
      this.results = [...this.results, ...page.items];
      this.resultsTotal = page.total;
    } catch (error) {
      this.context?.notify(errorMessage(error), 'error');
    } finally {
      this.loadingMore = false;
    }
    const list = this.root.querySelector<HTMLElement>('.results');
    if (list) this.fillResults(list);
  }

  private emitThumbnail(): void {
    if (!this.thumbnail || this.model.nodes.length === 0) return;
    // After the browser laid out the drawing (the export measures it).
    requestAnimationFrame(() => {
      const svg = this.exportSvg();
      if (!svg || svg.length > MAX_THUMBNAIL_CHARS) return;
      dispatchSoupEvent(this, SOUP_EVENTS.thumbnail, { svg });
    });
  }
}
