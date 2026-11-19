import { defineSoupElement, errorMessage, h, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';
import { GraphData, GraphEdge, SoupGraphView } from './soup-base';
import { standaloneSvg } from './svg';

export interface OcdfgData {
  svg: string;
  warning: string;
  options: Record<string, string | number>;
  interactive: GraphData;
  summary: { events: number; objects: number; relations: number; activities: string[]; object_types: string[] };
}

const SELECTS: [string, string, [string, string][]][] = [
  ['annotation', 'Annotation', [['frequency', 'Frequency'], ['performance', 'Performance']]],
  ['act_metric', 'Activity metric', [['events', 'Events'], ['unique_objects', 'Unique objects'], ['total_objects', 'Object occurrences']]],
  ['edge_metric', 'Edge metric', [['event_couples', 'Event pairs'], ['unique_objects', 'Unique objects'], ['total_objects', 'Object occurrences']]],
  ['performance_aggregation', 'Performance aggregation', [['mean', 'Mean'], ['median', 'Meann'], ['min', 'Minimum'], ['max', 'Maximum'], ['sum', 'Sum']]],
  ['rankdir', 'Direction', [['LR', 'Left to right'], ['TB', "Top to bottom"]]]
];
const CSS = `
:host { display:block; color:var(--soup-text,#212529); font:14px/1.5 system-ui,sans-serif; }
form,.bar { display:flex; flex-wrap:wrap; gap:var(--soup-space-3,12px); align-items:end; }
form { padding:16px; background:var(--soup-surface-alt,#f6f8fa); border:1px solid var(--soup-border,#d0d7de); border-radius:8px; }
label { display:flex; flex-direction:column; gap:4px; font-weight:600; }
select,input,button { font:inherit; min-height:36px; border:1px solid var(--soup-border,#d0d7de); border-radius:4px; padding:6px 10px; background:var(--soup-surface,#fff); color:inherit; }
input[type=number] { width:110px; } button { cursor:pointer; } button:disabled { opacity:.6; cursor:default; }
button.primary { background:var(--soup-primary,#ffac1c); color:var(--soup-on-primary,#1f1300); }
:focus-visible { outline:2px solid var(--soup-focus,#0b5ed7); outline-offset:2px; }
.summary,.hint { color:var(--soup-text-muted,#5c636a); margin:12px 0; }
.bar { margin:12px 0; align-items:end; }
soup-graph-view { display:block; --soup-graph-height:560px; }
.static { overflow:auto; max-height:75vh; min-height:240px; border:1px solid var(--soup-border,#d0d7de); border-radius:8px; background:white; }
img { display:block; width:100%; }
.warning { color:var(--soup-notice-text,#664d03); background:var(--soup-notice-bg,#fff8e1); padding:12px; }
details { margin-top:16px; border:1px solid var(--soup-border,#d0d7de); border-radius:8px; padding:12px; }
summary { cursor:pointer; font-weight:600; } .edge-picker { display:flex; gap:12px; align-items:end; margin:12px 0; flex-wrap:wrap; }
.edge-picker label { flex:1; min-width:200px; } .edge-picker select { max-width:100%; }
dl { display:grid; grid-template-columns:minmax(120px,220px) 1fr; gap:4px 16px; margin:12px 0 0; }
dt { font-weight:600; } dd { margin:0; overflow-wrap:anywhere; }
[hidden] { display:none !important; }
`;

export class OcdfgElement extends HTMLElement implements SoupVisualizerElement<OcdfgData> {
  public data!: OcdfgData;
  public context!: VisualizerContext;
  private readonly root = this.attachShadow({ mode: 'open' });
  private form!: HTMLFormElement;
  private graph!: SoupGraphView;
  private image!: HTMLImageElement;
  private staticView!: HTMLElement;
  private status!: HTMLElement;
  private submit!: HTMLButtonElement;
  private download!: HTMLButtonElement;
  private search!: HTMLButtonElement;
  private fit!: HTMLButtonElement;
  private edgeDetails!: HTMLDetailsElement;
  private edgeBody!: HTMLElement;
  private edgeTitle!: HTMLElement;
  private mode = 'interactive';
  private objectUrl = '';
  private request = 0;
  private selectedNode: string | null = null;
  private highlighted: string[] = [];

  public connectedCallback(): void { this.mount(); }
  public disconnectedCallback(): void { this.request++; this.releaseImage(); }

  private mount(): void {
    this.graph = document.createElement('soup-graph-view') as SoupGraphView;
    this.graph.toolbar = ['shape', 'relationships', 'counts'];
    this.graph.context = this.context;
    this.graph.thumbnail = false;
    this.graph.addEventListener('soup-node-select', event => {
      this.selectedNode = (event as CustomEvent<{id: string | null}>).detail.id;
      this.drawEdgePicker();
    });
    this.form = this.createForm();
    const s = this.data.summary;
    const summary = h('p', {className: 'summary', text: `${s.events} events · ${s.objects} objects · ${s.activities.length} activities · ${s.relations} relationships. Types: ${s.object_types.join(', ')}`});
    this.status = h('p', {className: 'warning', attrs: {role: 'status'}});
    this.image = h('img', {attrs: {alt: 'OC-DFG rendered by PM4Py as SVG'}});
    this.staticView = h('div', {className: 'static'}, this.image);
    this.edgeBody = h('div');
    this.edgeTitle = h('summary');
    this.edgeDetails = h('details', {}, this.edgeTitle, this.edgeBody);
    const hint = h('p', {className: 'hint', text: 'Scroll to zoom and drag the background to pan. Select a node to inspect its properties and connected edges. Use Search to find activities and edges.'});
    this.root.replaceChildren(h('style', {text: CSS}), this.form, summary, this.createBar(), hint, this.status, this.graph, this.staticView, this.edgeDetails);
    this.show();
  }

  private createForm(): HTMLFormElement {
    const form = h('form');
    for (const [key, title, choices] of SELECTS) {
      const select = h('select', {attrs: {name: key}});
      for (const [value, text] of choices) select.add(new Option(text, value));
      select.value = String(this.data.options[key]);
      form.append(h('label', {}, title, select));
    }
    for (const [key, title] of [['act_threshold', 'Minimum activity frequency'], ['edge_threshold', 'Minimum edge frequency']]) {
      const input = h('input', {attrs: {name: key, type: 'number', min: '0', step: '1', required: ''}});
      input.value = String(this.data.options[key]);
      form.append(h('label', {}, title, input));
    }
    this.submit = h('button', {className: 'primary', text: 'Update graph', attrs: {type: 'submit'}});
    form.append(this.submit);
    form.addEventListener('submit', event => { event.preventDefault(); void this.update(); });
    form.addEventListener('change', () => this.syncMetrics());
    return form;
  }

  private createBar(): HTMLElement {
    const mode = h('select', {attrs: {'aria-label': 'OC-DFG view'}});
    mode.add(new Option('Interactive', 'interactive'));
    mode.add(new Option('SVG PM4Py', 'svg'));
    mode.value = this.mode;
    mode.addEventListener('change', () => { this.mode = mode.value; this.showMode(); });
    this.search = h('button', {text: 'Search graph', attrs: {type: 'button'}, on: {click: () => this.graph.openSearch()}});
    this.fit = h('button', {text: 'Fit graph', attrs: {type: 'button'}, on: {click: () => this.fitGraph()}});
    this.download = h('button', {text: 'Export view as SVG', attrs: {type: 'button'}, on: {click: () => this.exportSvg()}});
    return h('div', {className: 'bar', attrs: {role: 'toolbar', 'aria-label': 'OC-DFG controls'}}, h('label', {}, 'View', mode), this.search, this.fit, this.download);
  }

  private syncMetrics(): void {
    const annotation = this.form.elements.namedItem('annotation') as HTMLSelectElement;
    const edges = this.form.elements.namedItem('edge_metric') as HTMLSelectElement;
    const unique = Array.from(edges.options).find(option => option.value === 'unique_objects')!;
    unique.disabled = annotation.value === 'performance';
    if (unique.disabled && edges.value === 'unique_objects') edges.value = 'event_couples';
    (this.form.elements.namedItem('performance_aggregation') as HTMLSelectElement).disabled = annotation.value !== 'performance';
  }

  private fitGraph(): void {
    this.graph.renderer?.render(this.graph.model, {
      palette: this.graph.palette, shape: this.graph.shape, direction: this.data.options['rankdir'] === 'TB' ? 'TB' : 'LR'
    });
    if (this.highlighted.length || this.selectedNode) {
      this.graph.highlight([...this.highlighted, ...(this.selectedNode ? [this.selectedNode] : [])], true);
    }
  }

  private releaseImage(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = '';
  }

  private show(): void {
    this.releaseImage();
    this.selectedNode = null;
    this.highlighted = [];
    this.graph.data = this.data.interactive;
    if (this.data.svg) {
      this.objectUrl = URL.createObjectURL(new Blob([this.data.svg], {type: 'image/svg+xml'}));
      this.image.src = this.objectUrl;
    } else this.image.removeAttribute('src');
    this.drawEdgePicker();
    this.syncMetrics();
    this.showMode();
    if (this.data.svg && this.data.svg.length < 512 * 1024) this.context.setThumbnail(this.data.svg);
  }

  private showMode(): void {
    const interactive = this.mode === 'interactive';
    this.graph.hidden = !interactive;
    this.staticView.hidden = interactive || !this.data.svg;
    this.search.hidden = this.fit.hidden = this.edgeDetails.hidden = !interactive;
    this.download.disabled = !interactive && !this.data.svg;
    this.status.textContent = this.data.warning;
    this.status.hidden = interactive || !this.data.warning;
    if (interactive) this.fitGraph();
  }

  private exportSvg(): void {
    const style = getComputedStyle(this.graph);
    const svg = this.mode === 'interactive'
      ? standaloneSvg(this.graph.exportSvg(), style.fontFamily || undefined, style.fontSize || undefined)
      : this.data.svg;
    if (svg) this.context.download(`${this.context.object.name}.svg`, 'image/svg+xml', svg);
  }

  private drawEdgePicker(): void {
    this.graph.highlight(this.highlighted, false);
    this.highlighted = [];
    const edges = this.data.interactive.edges.filter(edge => !this.selectedNode || edge.source === this.selectedNode || edge.target === this.selectedNode);
    this.edgeTitle.textContent = `Edge details${this.selectedNode ? ' for selected node' : ''} (${edges.length})`;
    const select = h('select', {attrs: {'aria-label': 'Edge to inspect'}});
    select.add(new Option('Select an edge…', ''));
    for (const edge of edges) select.add(new Option(this.edgeCaption(edge), edge.id));
    const props = h('div', {attrs: {'aria-live': 'polite'}});
    select.addEventListener('change', () => this.selectEdge(edges.find(edge => edge.id === select.value), props));
    const all = h('button', {text: 'All edges', attrs: {type: 'button'}, on: {click: () => { this.selectedNode = null; this.graph.selectNode(null); this.drawEdgePicker(); }}});
    this.edgeBody.replaceChildren(h('div', {className: 'edge-picker'}, h('label', {}, 'Edge to inspect', select), all), props);
  }

  private edgeCaption(edge: GraphEdge): string {
    const label = (id: string) => {
      const node = this.data.interactive.nodes.find(node => node.id === id);
      return String(node?.props['Activity'] ?? node?.props['Category'] ?? id);
    };
    return `${edge.group}: ${label(edge.source)} → ${label(edge.target)}`;
  }

  private selectEdge(edge: GraphEdge | undefined, container: HTMLElement): void {
    this.graph.highlight(this.highlighted, false);
    this.highlighted = edge ? [edge.source, edge.target] : [];
    this.graph.highlight(this.highlighted, true);
    const table = h('dl');
    if (edge) for (const [key, value] of Object.entries(edge.props)) {
      if (key !== 'weight') table.append(h('dt', {text: key}), h('dd', {text: String(value)}));
    }
    container.replaceChildren(table);
  }

  private async update(): Promise<void> {
    if (!this.form.reportValidity()) return;
    const params: Record<string, unknown> = {};
    for (const [key] of SELECTS) params[key] = (this.form.elements.namedItem(key) as HTMLSelectElement).value;
    for (const key of ['act_threshold', 'edge_threshold']) params[key] = Number((this.form.elements.namedItem(key) as HTMLInputElement).value);
    const version = ++this.request;
    this.submit.disabled = true;
    this.submit.textContent = 'Rendering…';
    this.form.setAttribute('aria-busy', 'true');
    try {
      const response = await this.context.action<OcdfgData>('render', params);
      if (version !== this.request) return;
      this.data = response;
      this.show();
    } catch (error) {
      if (version === this.request) this.context.notify(errorMessage(error), 'error');
    } finally {
      if (version === this.request) {
        this.submit.disabled = false;
        this.submit.textContent = 'Update graph';
        this.form.removeAttribute('aria-busy');
      }
    }
  }
}

defineSoupElement('soup-pkg-pm4py-ocdfg', OcdfgElement);
