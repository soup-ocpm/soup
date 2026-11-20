import { defineSoupElement, h, errorMessage, VisualizerContext, SoupVisualizerElement } from '@soup/sdk';
interface Data { svg: string; options: { rankdir: string }; summary: { events: number; objects: number; places: number; activities: string[]; object_types: string[] }; }
export class OcpnElement extends HTMLElement implements SoupVisualizerElement<Data> {
  public data!: Data;
  public context!: VisualizerContext;
  private readonly root = this.attachShadow({mode: 'open'});
  private image = h('img', {attrs: {alt: 'Object-centric Petri net'}});
  private viewport = h('div');
  private status = h('p', {attrs: {role: 'status'}});
  private url = '';
  private scale = 1;
  private x = 0;
  private y = 0;
  private request = 0;
  public connectedCallback(): void {
    const s = this.data.summary;
    const bar = h('div', {className: 'bar'});
    const button = (label: string, action: () => void): void => {
      const b = h('button', {text: label, attrs: {type: 'button'}}); b.onclick = action; bar.append(b);
    };
    button('Zoom in', () => this.zoom(1.25));
    button('Zoom out', () => this.zoom(0.8));
    button('Fit', () => { this.scale = 1; this.x = this.y = 0; this.transform(); });
    button('Export SVG', () => this.context.download('oc-pn.svg', 'image/svg+xml', this.data.svg));
    const direction = h('select', {attrs: {'aria-label': 'Graph direction'}});
    direction.add(new Option('Left to right', 'LR')); direction.add(new Option('Top to bottom', 'TB'));
    direction.value = this.data.options.rankdir;
    direction.onchange = () => { void this.render(direction); };
    bar.append(direction);
    this.viewport.className = 'viewport'; this.viewport.tabIndex = 0;
    this.viewport.setAttribute('aria-label', 'Petri net. Scroll to zoom, drag to pan.');
    this.viewport.replaceChildren(this.image);
    this.image.draggable = false;
    this.viewport.onwheel = event => { event.preventDefault(); this.zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1); };
    this.viewport.onpointerdown = event => {
      if (event.button !== 0) return;
      this.viewport.setPointerCapture(event.pointerId);
      let px = event.clientX, py = event.clientY;
      this.viewport.onpointermove = move => {
        this.x += move.clientX - px; this.y += move.clientY - py;
        px = move.clientX; py = move.clientY; this.transform();
      };
    };
    this.viewport.onpointerup = this.viewport.onpointercancel = () => { this.viewport.onpointermove = null; };
    this.root.replaceChildren(h('style', {text: `:host{display:block;font:14px system-ui;color:var(--soup-text,#212529)}.bar{display:flex;gap:8px;flex-wrap:wrap}button,select{font:inherit;padding:8px;border:1px solid #ccd1d6;border-radius:5px;background:var(--soup-surface,#fff);color:inherit;cursor:pointer}.viewport{height:580px;overflow:hidden;background:white;border:1px solid #ccd1d6;margin-top:12px;touch-action:none;cursor:grab;display:flex;align-items:center;justify-content:center}.viewport:active{cursor:grabbing}img{width:100%;height:100%;object-fit:contain;transform-origin:center;user-select:none;pointer-events:none}button:focus-visible,select:focus-visible,.viewport:focus-visible{outline:2px solid #1769aa}`}),
      h('p', {text: `${s.events} events · ${s.objects} objects · ${s.activities.length} activities · ${s.places} places. Types: ${s.object_types.join(', ')}`}), bar,
      h('p', {text: 'Scroll to zoom and drag to pan. Coloured places identify object types; thick arcs represent variable multiplicity.'}), this.status, this.viewport);
    this.show();
  }
  public disconnectedCallback(): void { this.request++; if (this.url) URL.revokeObjectURL(this.url); }
  private transform(): void { this.image.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.scale})`; }
  private zoom(factor: number): void { this.scale = Math.min(12, Math.max(0.2, this.scale * factor)); this.transform(); }
  private show(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(new Blob([this.data.svg], {type: 'image/svg+xml'})); this.image.src = this.url;
    this.scale = 1; this.x = this.y = 0; this.transform();
    if (this.data.svg.length < 500000) this.context.setThumbnail(this.data.svg);
  }
  private async render(select: HTMLSelectElement): Promise<void> {
    const request = ++this.request;
    select.disabled = true; this.status.textContent = 'Rendering…';
    try {
      const data = await this.context.action<Data>('render', {rankdir: select.value});
      if (request !== this.request) return;
      this.data = data; this.show(); this.status.textContent = '';
    } catch (error) { if (request === this.request) this.status.textContent = errorMessage(error); }
    finally { if (request === this.request) select.disabled = false; }
  }
}
defineSoupElement('soup-pkg-pm4py-ocpn', OcpnElement);
