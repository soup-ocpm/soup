import { VisualizerContext } from '@soup/sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import '../src/index';
import { ClassGraphData, SoupPkgEkgClassGraph } from '../src/class-graph';
import { ClassStatsData, SoupPkgEkgClassStats } from '../src/class-stats';
import { ChartData, GraphEdgeModel, GraphNodeModel, SearchPage, SearchTarget } from '../src/soup-base';

/** Stand-ins of the soup_base elements: they only keep what they receive. */
class FakeGraphView extends HTMLElement {
  public context: VisualizerContext | null = null;
  public search: ((query: string, target: SearchTarget, offset: number, limit: number) => Promise<SearchPage<GraphNodeModel | GraphEdgeModel>>) | null = null;
  public nodeDetails: ((id: string) => Promise<GraphNodeModel | null>) | null = null;
  public thumbnail = true;
  public toolbar: unknown = 'full';
  public searchVisible = false;
  public drawn: { data: unknown; thumbnail: boolean }[] = [];
  public shapes: string[] = [];
  private value: unknown;
  public get data(): unknown {
    return this.value;
  }
  public set data(value: unknown) {
    this.value = value;
    this.drawn.push({ data: value, thumbnail: this.thumbnail });
  }
  public setNodeShape(shape: string): void {
    this.shapes.push(shape);
  }
  public openSearch(open = !this.searchVisible): void {
    this.searchVisible = open;
  }
  public exportSvg(): string {
    return '<svg><text>classes</text></svg>';
  }
}

class FakeChart extends HTMLElement {
  public data: ChartData | undefined;
}

class FakeKeyValue extends HTMLElement {
  public data: { items: { key: string; value: unknown }[] } | undefined;
}

beforeAll(() => {
  customElements.define('soup-graph-view', FakeGraphView);
  customElements.define('soup-chart', FakeChart);
  customElements.define('soup-keyvalue', FakeKeyValue);
});

afterEach(() => {
  document.body.replaceChildren();
});

function fakeContext(action: (name: string, params: Record<string, unknown>) => Promise<unknown> = () => Promise.resolve({})): VisualizerContext {
  return {
    object: { id: 'c1', name: 'orders aggregato', kind: 'ekg_class', created_by: { type: 'operation', contributor_id: 'ekg_class_graph.build', package: 'ekg_class_graph' }, parents: ['g1'], created_at: '', description: '', meta: {} },
    theme: 'light',
    action: vi.fn(action) as VisualizerContext['action'],
    openObject: vi.fn(),
    notify: vi.fn(),
    setThumbnail: vi.fn(),
    download: vi.fn()
  };
}

function mount<T extends HTMLElement & { data: unknown; context: VisualizerContext }>(tag: string, data: unknown, context: VisualizerContext): T {
  const element = document.createElement(tag) as T;
  element.data = data;
  element.context = context;
  document.body.append(element);
  return element;
}

const CLASSES = { nodes: [{ id: '1', label: 'o1', group: 'Class', props: {} }], edges: [], directed: true };
const OTHER = { nodes: [{ id: '2', label: 'Create', group: 'Event', props: {} }], edges: [], directed: true };

const GRAPH_DATA: ClassGraphData = {
  views: [
    { key: 'class', label: 'Grafo aggregato', relationship_types: ['DF_C', 'OBSERVED'], default_relations: ['DF_C'] },
    { key: 'standard', label: 'Grafo standard', relationship_types: ['DF', 'CORR'], default_relations: ['DF'] }
  ],
  max_limit: 2000,
  view: 'class',
  limit: 200,
  relations: ['DF_C'],
  max_data: 12,
  graph: CLASSES,
  notice: null
};

describe('<soup-pkg-ekg-class-graph>', () => {
  const graphAction = (name: string, params: Record<string, unknown>): Promise<unknown> =>
    Promise.resolve(name === 'graph' ? { view: params.view, limit: Math.min(Number(params.limit), 2000), relations: params.relations, max_data: 3, graph: OTHER } : {});

  function graphOf(element: SoupPkgEkgClassGraph): FakeGraphView {
    return element.shadowRoot!.querySelector('soup-graph-view') as FakeGraphView;
  }

  it('draws the class view first, with the thumbnail only the first time', async () => {
    const context = fakeContext(graphAction);
    const element = mount<SoupPkgEkgClassGraph>('soup-pkg-ekg-class-graph', GRAPH_DATA, context);

    expect(graphOf(element).drawn).toEqual([{ data: CLASSES, thumbnail: true }]);
    expect([...element.shadowRoot!.querySelectorAll('[data-relation]')].map((box) => box.getAttribute('data-relation'))).toEqual(['DF_C', 'OBSERVED']);

    await element.setRelation('OBSERVED', true);
    expect(context.action).toHaveBeenCalledWith('graph', { view: 'class', limit: 200, relations: ['DF_C', 'OBSERVED'] });
    expect(graphOf(element).drawn[1]).toEqual({ data: OTHER, thumbnail: false });
  });

  it('has one bar: soup-graph-view without its toolbar, with shape, search and export once', () => {
    const context = fakeContext(graphAction);
    const element = mount<SoupPkgEkgClassGraph>('soup-pkg-ekg-class-graph', GRAPH_DATA, context);
    const root = element.shadowRoot!;
    const names = () => [...root.querySelectorAll('.bar button')].map((button) => button.textContent);

    expect(graphOf(element).toolbar).toBe('none');
    expect(names()).toEqual(['Cerca', 'Esporta SVG']);
    expect(root.querySelectorAll('.bar > .group')).toHaveLength(3);
    expect(root.querySelector('.info')!.textContent).toMatch(/^\d+ nodi, \d+ archi/);

    (root.querySelector('select[aria-label="Forma dei nodi"]') as HTMLSelectElement).value = 'circle';
    root.querySelector('select[aria-label="Forma dei nodi"]')!.dispatchEvent(new Event('change'));
    expect(graphOf(element).shapes).toEqual(['circle']);

    (root.querySelector('.bar button[aria-pressed]') as HTMLButtonElement).click();
    expect(graphOf(element).searchVisible).toBe(true);
    expect(names()).toEqual(['Chiudi ricerca', 'Esporta SVG']);
  });

  it('switches to a standard view with its default relationship types and clamps the limit', async () => {
    const context = fakeContext(graphAction);
    const element = mount<SoupPkgEkgClassGraph>('soup-pkg-ekg-class-graph', GRAPH_DATA, context);

    await element.chooseView('standard');
    expect(context.action).toHaveBeenLastCalledWith('graph', { view: 'standard', limit: 200, relations: ['DF'] });
    await element.setLimit(99999);
    expect(element.limit).toBe(2000);
  });

  it('searches and reads the nodes through the actions, and saves the SVG', async () => {
    const context = fakeContext(() => Promise.resolve({ items: [], total: 0 }));
    const element = mount<SoupPkgEkgClassGraph>('soup-pkg-ekg-class-graph', GRAPH_DATA, context);

    await graphOf(element).search!('o1', 'nodes', 50, 50);
    expect(context.action).toHaveBeenCalledWith('search', { view: 'class', text: 'o1', kind: 'node', offset: 50, relations: ['DF_C'] });
    await graphOf(element).nodeDetails!('7');
    expect(context.action).toHaveBeenCalledWith('node', { view: 'class', id: '7' });

    element.exportSvg();
    expect(context.download).toHaveBeenCalledWith('orders aggregato.svg', 'image/svg+xml', '<svg><text>classes</text></svg>');
  });

  it('notifies a failed action and shows the notice', async () => {
    const context = fakeContext(() => Promise.reject(new Error('Memgraph down')));
    const element = mount<SoupPkgEkgClassGraph>('soup-pkg-ekg-class-graph', { ...GRAPH_DATA, notice: 'Avviso' }, context);

    await element.setLimit(10);
    expect(context.notify).toHaveBeenCalledWith('Memgraph down', 'error');
    expect(element.shadowRoot!.querySelector('.notice')!.textContent).toBe('Avviso');
  });
});

const STATS: ClassStatsData = {
  counts: { class_nodes: 4, obs_rel: 6, dfc_rel: 2 },
  entity_types: ['order', '<i>item</i>'],
  charts: {
    data: { chart: 'pie', labels: ['Class Nodes', 'OBS', 'DF_C'], datasets: [{ label: 'numero', data: [4, 6, 2] }] },
    process: null
  }
};

describe('<soup-pkg-ekg-class-stats>', () => {
  it('shows the counts, the entity types and the pie of the composition', () => {
    const element = mount<SoupPkgEkgClassStats>('soup-pkg-ekg-class-stats', STATS, fakeContext());
    const root = element.shadowRoot!;

    const summary = root.querySelector('soup-keyvalue') as FakeKeyValue;
    expect(summary.data!.items.map((item) => item.value)).toEqual([4, 6, 2, 'order, <i>item</i>']);
    const charts = [...root.querySelectorAll('soup-chart')] as FakeChart[];
    expect(charts.map((chart) => chart.data)).toEqual([STATS.charts.data]);
    expect(root.querySelector('.charts .info')!.textContent).toContain('non disponibili');
    expect(root.querySelector('i')).toBeNull();
  });

  it('adds the pie of the phase times when there is one', () => {
    const process: ChartData = { chart: 'pie', labels: ['Class queries', 'OBS queries', 'DF_C queries'], datasets: [{ label: 'secondi', data: [1, 2, 3] }] };
    const element = mount<SoupPkgEkgClassStats>('soup-pkg-ekg-class-stats', { ...STATS, charts: { ...STATS.charts, process } }, fakeContext());
    const charts = [...element.shadowRoot!.querySelectorAll('soup-chart')] as FakeChart[];
    expect(charts.map((chart) => chart.data)).toEqual([STATS.charts.data, process]);
  });
});
