import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DagreGraphRenderer, fitTransform } from '../src/graph/dagre-renderer';
import { GraphModel } from '../src/graph/model';
import { RelationshipPalette } from '../src/graph/palette';

const MODEL: GraphModel = {
  nodes: [
    { id: '1', label: 'Create', group: 'Event', props: {} },
    { id: '2', label: 'Ship', group: 'Event', props: {} }
  ],
  edges: [{ id: 'e1', source: '1', target: '2', type: 'DF', label: 'DF', weight: 1, props: {} }],
  directed: true
};
const EMPTY: GraphModel = { nodes: [], edges: [], directed: true };
const TWO_TYPES: GraphModel = {
  nodes: [
    { id: '1', label: 'Create', group: 'Event', props: {} },
    { id: '2', label: 'Ship', group: 'Event', props: {} },
    { id: 'o1', label: 'o1', group: 'Entity', props: {} }
  ],
  edges: [
    { id: 'e1', source: '1', target: '2', type: 'DF', label: 'DF (2)', weight: 2, props: {} },
    { id: 'e2', source: '1', target: 'o1', type: 'CORR', label: 'CORR', weight: 1, props: {} }
  ],
  directed: true
};

describe('fitTransform', () => {
  it('fits and centers the graph, never enlarging it', () => {
    expect(fitTransform(400, 200, 820, 420)?.toString()).toBe('translate(210,110) scale(1)');
    expect(fitTransform(1600, 200, 820, 420)?.toString()).toBe('translate(10,160) scale(0.5)');
  });

  it.each([
    ['an empty graph (infinite layout)', -Infinity, -Infinity, 800, 600],
    ['a container of size zero', 400, 200, 0, 0],
    ['a NaN size', NaN, 200, 800, 600],
    ['an infinite graph', Infinity, 200, 800, 600],
    ['a box smaller than the margin', 400, 200, 10, 600]
  ])('is null for %s', (_, graphWidth, graphHeight, boxWidth, boxHeight) => {
    expect(fitTransform(graphWidth, graphHeight, boxWidth, boxHeight)).toBeNull();
  });
});

describe('DagreGraphRenderer', () => {
  let resized: (() => void) | null;
  let observed: number;
  let box: { width: number; height: number };
  let label: { width: number; height: number };

  beforeEach(() => {
    resized = null;
    observed = 0;
    box = { width: 0, height: 0 };
    label = { width: 40, height: 20 };
    // jsdom has no layout: the labels measure `label`, the screen matrix is the identity, no ResizeObserver.
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ x: 0, y: 0, ...label })
    });
    const identity = { e: 0, f: 0, inverse: () => identity, multiply: () => identity, translate: () => identity };
    Object.defineProperty(SVGElement.prototype, 'getScreenCTM', { configurable: true, value: () => identity });
    for (const side of ['width', 'height']) {
      Object.defineProperty(SVGElement.prototype, side, { configurable: true, get: () => ({ baseVal: { value: 0 } }) });
    }
    vi.stubGlobal(
      'ResizeObserver',
      class {
        public constructor(callback: () => void) {
          resized = callback;
        }
        public observe(): void {
          observed++;
        }
        public disconnect(): void {
          resized = null;
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const name of ['getBBox', 'getScreenCTM', 'width', 'height']) delete (SVGElement.prototype as unknown as Record<string, unknown>)[name];
    document.body.replaceChildren();
  });

  function mounted(): { renderer: DagreGraphRenderer; group: () => string | null } {
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ ...box, x: 0, y: 0, top: 0, left: 0, right: box.width, bottom: box.height, toJSON: () => ({}) });
    document.body.append(container);
    const renderer = new DagreGraphRenderer();
    renderer.mount(container);
    return { renderer, group: () => container.querySelector('g.soup-graph-group')!.getAttribute('transform') };
  }

  it('draws the SVG of dagre-d3: nodes with shape and label, edges with curve, arrowhead and label', () => {
    box = { width: 800, height: 600 };
    const palette = new RelationshipPalette();
    palette.assign(TWO_TYPES);
    const { renderer, group } = mounted();
    renderer.render(TWO_TYPES, { palette, shape: 'rect' });
    const svg = document.querySelector('svg.soup-graph-svg')!;

    expect([...svg.querySelectorAll('g.soup-graph-group > g.output > g')].map((g) => g.getAttribute('class'))).toEqual([
      'clusters',
      'edgePaths',
      'edgeLabels',
      'nodes'
    ]);
    const nodes = [...svg.querySelectorAll('g.nodes > g.node')];
    expect(nodes.map((node) => node.textContent)).toEqual(['Create', 'Ship', 'o1']);
    const rect = nodes[0].querySelector('rect.label-container')!;
    expect(nodes[0].firstElementChild).toBe(rect);
    expect([rect.getAttribute('rx'), rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['5', '60', '40']);
    expect(rect.getAttribute('style')).toBe(`fill: #fff; stroke: #000; stroke-width: 2px; user-select: none; cursor: pointer;stroke: ${palette.groupColorOf('Event')};`);
    expect(nodes[0].getAttribute('transform')).toMatch(/^translate\([\d.]+,[\d.]+\)$/);
    expect(nodes[0].querySelector('g.label > g > text')!.getAttribute('style')).toBe('font-size: 1.1em;');
    expect(nodes[0].querySelector('tspan')!.getAttribute('dy')).toBe('1em');

    const paths = [...svg.querySelectorAll('g.edgePaths > g.edgePath')];
    expect(paths).toHaveLength(2);
    const path = paths[0].querySelector('path.path')!;
    // curveBasis: a B-spline through the points, from border to border.
    expect(path.getAttribute('d')).toMatch(/^M[\d.,-]+(L[\d.,-]+)+(C[\d.,-]+)+(L[\d.,-]+)+$/);
    expect(path.getAttribute('style')).toBe(`stroke: ${palette.colorOf('DF')}; stroke-width: 5px; fill: none;`);
    const marker = paths[0].querySelector('defs > marker')!;
    expect(path.getAttribute('marker-end')).toBe(`url(${location.href.split('#')[0]}#${marker.id})`);
    expect(marker.querySelector('path')!.getAttribute('d')).toBe('M 0 0 L 10 5 L 0 10 z');
    expect(marker.querySelector('path')!.getAttribute('style')).toBe(`fill: ${palette.colorOf('DF')};`);
    expect(paths[1].querySelector('path.path')!.getAttribute('style')).toContain('stroke-width: 2px');
    expect([...svg.querySelectorAll('g.edgeLabels > g.edgeLabel')].map((label) => label.textContent)).toEqual(['DF (2)', 'CORR']);
    expect(group()).toMatch(/^translate\([\d.]+,[\d.]+\) scale\(1\)$/);
  });

  it('redraws in place: circles, highlighted nodes, hidden types, clicks', () => {
    box = { width: 800, height: 600 };
    const palette = new RelationshipPalette();
    palette.assign(TWO_TYPES);
    const { renderer } = mounted();
    const clicked: string[] = [];
    renderer.onNodeClick = (id) => clicked.push(id);
    renderer.render(TWO_TYPES, { palette, shape: 'rect' });
    const first = document.querySelector('g.node')!;

    renderer.setNodeShape('circle');
    expect(document.querySelectorAll('g.node > circle.label-container')).toHaveLength(3);
    expect(document.querySelectorAll('g.node > rect')).toHaveLength(0);
    expect(document.querySelector('g.node circle')!.getAttribute('r')).toBe('30');
    expect(document.querySelector('g.node')).toBe(first);

    renderer.setHighlighted(['2'], true);
    expect(document.querySelectorAll('g.node circle[style*="#ffac1c"]')).toHaveLength(1);
    renderer.setHighlighted(['2'], false);
    expect(document.querySelectorAll('g.node circle[style*="#ffac1c"]')).toHaveLength(0);

    renderer.setRelationshipVisible('CORR', false);
    expect(document.querySelectorAll('g.edgePath')).toHaveLength(1);
    expect(document.querySelectorAll('g.edgeLabel')).toHaveLength(1);
    renderer.setRelationshipVisible('CORR', true);
    expect(document.querySelectorAll('g.edgePath')).toHaveLength(2);

    (document.querySelectorAll('g.node')[1] as SVGGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toEqual(['2']);
    expect(renderer.exportSvg()).toContain('<g class="edgePath"');
  });

  it('sets no transform with NaN for an empty graph, a container of size zero or labels of size zero', () => {
    const { renderer, group } = mounted();

    renderer.render(EMPTY, { palette: new RelationshipPalette(), shape: 'rect' });
    expect(group() ?? '').not.toContain('NaN');
    box = { width: 800, height: 600 };
    renderer.render(EMPTY, { palette: new RelationshipPalette(), shape: 'rect' });
    expect(group() ?? '').not.toContain('NaN');

    box = { width: 0, height: 0 };
    renderer.render(MODEL, { palette: new RelationshipPalette(), shape: 'rect' });
    expect(group()).toBeNull();

    box = { width: 800, height: 600 };
    label = { width: 0, height: 0 };
    renderer.render(MODEL, { palette: new RelationshipPalette(), shape: 'rect' });
    expect(group()).toBeNull();
  });

  it('centers the graph at the first resize with a valid size, and again at every resize', () => {
    const { renderer, group } = mounted();
    renderer.render(MODEL, { palette: new RelationshipPalette(), shape: 'rect' });
    expect(group()).toBeNull();
    expect(observed).toBe(1);

    box = { width: 800, height: 600 };
    resized!();
    const first = group();
    expect(first).toMatch(/^translate\([\d.]+,[\d.]+\) scale\(1\)$/);

    // A taller area: the graph moves down to stay in the middle.
    box = { width: 800, height: 900 };
    resized!();
    const [, y1] = /translate\([\d.]+,([\d.]+)\)/.exec(first!)!;
    const [, y2] = /translate\([\d.]+,([\d.]+)\)/.exec(group()!)!;
    expect(Number(y2) - Number(y1)).toBeCloseTo(150);
  });

  it('stops fitting the graph once the user zooms or pans, until new data', async () => {
    box = { width: 800, height: 600 };
    const { renderer, group } = mounted();
    renderer.render(MODEL, { palette: new RelationshipPalette(), shape: 'rect' });
    expect(resized).not.toBeNull();

    document.querySelector('svg.soup-graph-svg')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 10, clientY: 10, bubbles: true }));
    const zoomed = group();
    expect(resized).toBeNull();

    renderer.setNodeShape('circle');
    expect(group()).toBe(zoomed);

    // d3 ends the wheel gesture 150 ms after the last wheel event.
    await new Promise((done) => setTimeout(done, 200));
    renderer.render(MODEL, { palette: new RelationshipPalette(), shape: 'rect' });
    expect(group()).not.toBe(zoomed);
    expect(resized).not.toBeNull();
  });

  it('draws each edge label on a light rounded box, also in the exported SVG', () => {
    box = { width: 800, height: 600 };
    const { renderer } = mounted();
    renderer.render(TWO_TYPES, { palette: new RelationshipPalette(), shape: 'rect' });

    const label = document.querySelector('g.edgeLabel')!;
    const background = label.firstElementChild!;
    expect(background.matches('rect.label-bg')).toBe(true);
    // The text measures 40 x 20: 4 px around it horizontally, 2 px vertically, centered on the label.
    expect(['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke'].map((name) => background.getAttribute(name))).toEqual([
      '-24',
      '-12',
      '48',
      '24',
      '4',
      '#fff',
      '#d0d7de'
    ]);
    expect(label.querySelector('g.label text')).not.toBeNull();
    expect(renderer.exportSvg()).toContain('class="label-bg"');

    // Redrawn in place: still one box per label.
    renderer.setNodeShape('circle');
    expect(label.querySelectorAll('rect.label-bg')).toHaveLength(1);
  });

  it('centers at the next draw once the graph is not empty', () => {
    const { renderer, group } = mounted();
    box = { width: 800, height: 600 };
    renderer.render(EMPTY, { palette: new RelationshipPalette(), shape: 'rect' });
    expect(group()).toBeNull();

    renderer.render(MODEL, { palette: new RelationshipPalette(), shape: 'rect' });

    expect(group()).toMatch(/^translate\([\d.]+,[\d.]+\) scale\(1\)$/);
  });
});
