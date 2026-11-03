import { Block, VisualizerContext } from '@soup/sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import '../src/index';
import { GraphViewData, SoupPkgEkgGraph } from '../src/graph';
import { canRunAtOnce, QueriesData, resultKey, SoupPkgEkgQueries } from '../src/queries';
import { ChartData, GraphEdgeModel, GraphNodeModel, NodeShape, SearchPage, SearchTarget, TableData } from '../src/soup-base';
import { SoupPkgEkgStats, StatsData } from '../src/stats';

/** Stand-ins of the soup_base elements: they only keep what they receive. */
class FakeGraphView extends HTMLElement {
  public context: VisualizerContext | null = null;
  public search: ((query: string, target: SearchTarget, offset: number, limit: number) => Promise<SearchPage<GraphNodeModel | GraphEdgeModel>>) | null = null;
  public nodeDetails: ((id: string) => Promise<GraphNodeModel | null>) | null = null;
  public thumbnail = true;
  public toolbar: unknown = 'full';
  public searchVisible = false;
  /** The value of `thumbnail` when each data was set. */
  public drawn: { data: unknown; thumbnail: boolean }[] = [];
  public shapes: NodeShape[] = [];
  private value: unknown;
  public openSearch(open = !this.searchVisible): void {
    this.searchVisible = open;
  }
  public get data(): unknown {
    return this.value;
  }
  public set data(value: unknown) {
    this.value = value;
    this.drawn.push({ data: value, thumbnail: this.thumbnail });
  }
  public setNodeShape(shape: NodeShape): void {
    this.shapes.push(shape);
  }
  public exportSvg(): string {
    return '<svg><text>graph</text></svg>';
  }
}

class FakeChart extends HTMLElement {
  public data: ChartData | undefined;
}

class FakeTable extends HTMLElement {
  public data: TableData | undefined;
}

class FakeKeyValue extends HTMLElement {
  public data: { items: { key: string; value: unknown }[] } | undefined;
}

class FakeReportView extends HTMLElement {
  public data: { blocks: Block[] } | undefined;
  public context: VisualizerContext | null = null;
}

beforeAll(() => {
  customElements.define('soup-graph-view', FakeGraphView);
  customElements.define('soup-chart', FakeChart);
  customElements.define('soup-table', FakeTable);
  customElements.define('soup-keyvalue', FakeKeyValue);
  customElements.define('soup-report-view', FakeReportView);
});

afterEach(() => {
  document.body.replaceChildren();
});

function fakeContext(action: (name: string, params: Record<string, unknown>) => Promise<unknown> = () => Promise.resolve({})): VisualizerContext {
  return {
    object: { id: 'g1', name: 'orders', kind: 'ekg', created_by: { type: 'importer', contributor_id: 'csv_ekg.csv', package: 'csv_ekg' }, parents: [], created_at: '', description: '', meta: {} },
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

const GRAPH = { nodes: [{ id: '1', label: 'Create', group: 'Event', props: {} }], edges: [], directed: true };
const OTHER = { nodes: [{ id: '2', label: 'Ship', group: 'Event', props: {} }], edges: [], directed: true };

const GRAPH_DATA: GraphViewData = {
  views: [
    { key: 'standard', label: 'Grafo standard', relationship_types: ['DF', 'CORR'], default_relations: ['DF'] },
    { key: 'only_df', label: 'Solo DF', relationship_types: ['DF'], default_relations: [] }
  ],
  max_limit: 2000,
  view: 'standard',
  limit: 200,
  relations: ['DF'],
  max_data: 340,
  graph: GRAPH
};

describe('<soup-pkg-ekg-graph>', () => {
  const graphAction = (name: string, params: Record<string, unknown>): Promise<unknown> =>
    Promise.resolve(name === 'graph' ? { view: params.view, limit: Math.min(Number(params.limit), 2000), relations: params.relations, max_data: 12, graph: OTHER } : {});

  function graphOf(element: SoupPkgEkgGraph): FakeGraphView {
    return element.shadowRoot!.querySelector('soup-graph-view') as FakeGraphView;
  }

  it('draws the first graph with the thumbnail, and later ones without', async () => {
    const context = fakeContext(graphAction);
    const element = mount<SoupPkgEkgGraph>('soup-pkg-ekg-graph', GRAPH_DATA, context);
    const view = graphOf(element);

    expect(view.drawn).toEqual([{ data: GRAPH, thumbnail: true }]);
    expect(view.thumbnail).toBe(false);
    expect(view.context).toBe(context);
    expect(element.shadowRoot!.querySelector('.info')!.textContent).toBe('1 nodi, 0 archi · massimo mostrabile: 340 elementi');

    await element.setLimit(50);
    expect(context.action).toHaveBeenCalledWith('graph', { view: 'standard', limit: 50, relations: ['DF'] });
    expect(view.drawn[1]).toEqual({ data: OTHER, thumbnail: false });
    expect(element.shadowRoot!.querySelector('.info')!.textContent).toBe('1 nodi, 0 archi · massimo mostrabile: 12 elementi');
  });

  it('has one bar: soup-graph-view without its toolbar, no command twice, the search opened from the bar', () => {
    const context = fakeContext(graphAction);
    const element = mount<SoupPkgEkgGraph>('soup-pkg-ekg-graph', GRAPH_DATA, context);
    const view = graphOf(element);
    const root = element.shadowRoot!;
    const names = () => [...root.querySelectorAll('.bar button')].map((button) => button.textContent);

    expect(view.toolbar).toBe('none');
    expect(root.querySelectorAll('.bar')).toHaveLength(1);
    expect(names()).toEqual(['Cerca', 'Esporta SVG']);
    expect(root.querySelectorAll('select[aria-label="Forma dei nodi"]')).toHaveLength(1);
    expect([...root.querySelectorAll('.bar > .group')]).toHaveLength(3);
    expect(root.querySelector('details.relations summary')!.textContent).toBe('Relazioni (1/2)');

    (root.querySelector('.bar button[aria-pressed]') as HTMLButtonElement).click();
    expect(view.searchVisible).toBe(true);
    expect(names()).toEqual(['Chiudi ricerca', 'Esporta SVG']);
    expect(root.querySelector('.bar button[aria-pressed]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('offers the views and the relationship types of the chosen view', async () => {
    const context = fakeContext(graphAction);
    const element = mount<SoupPkgEkgGraph>('soup-pkg-ekg-graph', GRAPH_DATA, context);
    const options = [...element.shadowRoot!.querySelectorAll('select[aria-label="Vista"] option')].map((option) => option.textContent);
    expect(options).toEqual(['Grafo standard', 'Solo DF']);
    const boxes = (): [string | null, boolean][] =>
      [...element.shadowRoot!.querySelectorAll<HTMLInputElement>('input[data-relation]')].map((box) => [box.getAttribute('data-relation'), box.checked]);
    expect(boxes()).toEqual([['DF', true], ['CORR', false]]);

    await element.setRelation('CORR', true);
    expect(context.action).toHaveBeenLastCalledWith('graph', { view: 'standard', limit: 200, relations: ['DF', 'CORR'] });
    expect(boxes()).toEqual([['DF', true], ['CORR', true]]);

    await element.chooseView('only_df');
    expect(context.action).toHaveBeenLastCalledWith('graph', { view: 'only_df', limit: 200, relations: ['DF'] });
    expect(boxes()).toEqual([['DF', true]]);
  });

  it('clamps the limit to the maximum', async () => {
    const context = fakeContext(graphAction);
    const element = mount<SoupPkgEkgGraph>('soup-pkg-ekg-graph', GRAPH_DATA, context);
    await element.setLimit(99999);
    expect(context.action).toHaveBeenLastCalledWith('graph', { view: 'standard', limit: 2000, relations: ['DF'] });
  });

  it('gives soup-graph-view the remote search and the node details through the actions', async () => {
    const context = fakeContext((name) => Promise.resolve(name === 'search' ? { items: [], total: 0 } : { id: '7', label: 'x', group: 'Event', props: {} }));
    const element = mount<SoupPkgEkgGraph>('soup-pkg-ekg-graph', GRAPH_DATA, context);
    const view = graphOf(element);

    await view.search!('pay', 'edges', 50, 50);
    expect(context.action).toHaveBeenCalledWith('search', { view: 'standard', text: 'pay', kind: 'edge', offset: 50, relations: ['DF'] });
    await view.search!('pay', 'nodes', 0, 50);
    expect(context.action).toHaveBeenLastCalledWith('search', { view: 'standard', text: 'pay', kind: 'node', offset: 0, relations: ['DF'] });
    await view.nodeDetails!('7');
    expect(context.action).toHaveBeenLastCalledWith('node', { view: 'standard', id: '7' });
  });

  it('changes the node shape and saves the SVG with context.download', () => {
    const context = fakeContext();
    const element = mount<SoupPkgEkgGraph>('soup-pkg-ekg-graph', GRAPH_DATA, context);
    element.setShape('circle');
    expect(graphOf(element).shapes).toEqual(['circle']);

    element.exportSvg();
    expect(context.download).toHaveBeenCalledWith('orders.svg', 'image/svg+xml', '<svg><text>graph</text></svg>');
  });

  it('notifies a failed action', async () => {
    const context = fakeContext(() => Promise.reject(new Error('Memgraph offline')));
    const element = mount<SoupPkgEkgGraph>('soup-pkg-ekg-graph', GRAPH_DATA, context);
    await element.setLimit(10);
    expect(context.notify).toHaveBeenCalledWith('Memgraph offline', 'error');
  });
});

const STATS: StatsData = {
  counts: { event_nodes: 3, entity_nodes: 2, corr_rel: 4, df_rel: 1 },
  timestamps: { min: '2021-01-01T10:00:00', max: '2021-01-02T10:00:00' },
  activities: ['Create', '<b>Ship</b>'],
  entities: [
    { name: 'item', nan_nodes: 0, warning: null },
    { name: 'order', nan_nodes: 2, warning: '2 nodi hanno valore NaN.' }
  ],
  charts: {
    data: { chart: 'pie', labels: ['Event', 'Entity', 'CORR', 'DF'], datasets: [{ label: 'numero', data: [3, 2, 4, 1] }] },
    process: null
  }
};

describe('<soup-pkg-ekg-stats>', () => {
  it('shows counts, entities with their warning, activities and the pies', () => {
    const element = mount<SoupPkgEkgStats>('soup-pkg-ekg-stats', STATS, fakeContext());
    const root = element.shadowRoot!;

    const summary = root.querySelector('soup-keyvalue') as FakeKeyValue;
    expect(summary.data!.items.slice(0, 4).map((item) => item.value)).toEqual([3, 2, 4, 1]);
    expect(summary.data!.items[4]).toEqual({ key: 'Primo evento', value: '2021-01-01T10:00:00' });

    const [entities, activities] = [...root.querySelectorAll('soup-table')] as FakeTable[];
    expect(entities.data!.rows).toEqual([['item', 0, ''], ['order', 2, '2 nodi hanno valore NaN.']]);
    expect(activities.data!.rows).toEqual([['Create'], ['<b>Ship</b>']]);
    expect(root.querySelector('.warning')!.textContent).toBe('order: 2 nodi hanno valore NaN.');

    const charts = [...root.querySelectorAll('soup-chart')] as FakeChart[];
    expect(charts.map((chart) => chart.data)).toEqual([STATS.charts.data]);
    expect(root.querySelector('.charts .info')!.textContent).toContain('non salvati');
    expect(root.querySelector('b')).toBeNull();
  });

  it('shows the columns of the dataset with their role, when there are some', () => {
    const columns: StatsData['columns'] = [
      { name: 'case', role: 'event_id' },
      { name: 'order', role: 'entity' },
      { name: 'note', role: '' }
    ];
    const element = mount<SoupPkgEkgStats>('soup-pkg-ekg-stats', { ...STATS, columns }, fakeContext());
    const tables = [...element.shadowRoot!.querySelectorAll('soup-table')] as FakeTable[];
    expect(tables).toHaveLength(3);
    expect(tables[2].data!.rows).toEqual([['case', 'id evento'], ['order', 'entità'], ['note', 'non usata']]);
    expect(element.shadowRoot!.textContent).toContain('Colonne del dataset');
  });

  it('adds the pie of the phase times when there is one', () => {
    const process: ChartData = { chart: 'pie', labels: ['Event', 'Entity', 'CORR', 'DF'], datasets: [{ label: 'secondi', data: [1, 2, 3, 4] }] };
    const element = mount<SoupPkgEkgStats>('soup-pkg-ekg-stats', { ...STATS, charts: { ...STATS.charts, process } }, fakeContext());
    const charts = [...element.shadowRoot!.querySelectorAll('soup-chart')] as FakeChart[];
    expect(charts.map((chart) => chart.data)).toEqual([STATS.charts.data, process]);
  });
});

const QUERIES: QueriesData = {
  groups: [
    {
      group: 'Conteggi',
      queries: [{ key: 'count_events', label: 'Nodi evento', group: 'Conteggi', description: '', fields: [] }]
    },
    {
      group: 'Test',
      queries: [
        {
          key: 'test.echo',
          label: 'Eco',
          group: 'Test',
          description: 'Ripete una parola',
          fields: [
            { name: 'word', label: 'Parola', type: 'text', required: true, default: null, choices: [], help: '', variants: [] },
            { name: 'limit', label: 'Righe', type: 'number', required: false, default: 100, choices: [], help: '', variants: [] }
          ]
        }
      ]
    }
  ]
};

describe('<soup-pkg-ekg-queries>', () => {
  const BLOCKS: Block[] = [{ type: 'text', title: 'Eco', data: { text: 'ciao' } }];

  it('lists the queries of every package by group', () => {
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', QUERIES, fakeContext());
    const root = element.shadowRoot!;
    expect([...root.querySelectorAll('nav h4')].map((title) => title.textContent)).toEqual(['Conteggi', 'Test']);
    expect([...root.querySelectorAll('nav button')].map((button) => button.getAttribute('data-query'))).toEqual(['count_events', 'test.echo']);
    expect(element.selected!.key).toBe('count_events');
  });

  it('shows the fields of the chosen query and runs it with the "query" action', async () => {
    const context = fakeContext(() => Promise.resolve({ key: 'test.echo', label: 'Eco', blocks: BLOCKS }));
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', QUERIES, context);
    const root = element.shadowRoot!;
    (root.querySelector('button[data-query="test.echo"]') as HTMLButtonElement).click();

    const word = root.querySelector('input[name="word"]') as HTMLInputElement;
    const limit = root.querySelector('input[name="limit"]') as HTMLInputElement;
    expect(limit.value).toBe('100');
    word.value = 'ciao';
    word.dispatchEvent(new Event('input'));
    limit.value = '5';
    limit.dispatchEvent(new Event('input'));
    await element.run();

    expect(context.action).toHaveBeenCalledWith('query', { key: 'test.echo', params: { word: 'ciao', limit: 5 } });
    const report = root.querySelector('.result soup-report-view') as FakeReportView;
    expect(report.data).toEqual({ blocks: BLOCKS });
    expect(report.context).toBe(context);
  });

  it('notifies a failed query', async () => {
    const context = fakeContext(() => Promise.reject(new Error("'word' is required")));
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', QUERIES, context);
    element.choose('test.echo');
    await element.run();
    expect(context.notify).toHaveBeenCalledWith("'word' is required", 'error');
    expect(element.shadowRoot!.querySelector('soup-report-view')).toBeNull();
  });

  /** An action answering each call with `blocksOf(key)`, or held until release(). */
  function controlledContext(): { context: VisualizerContext; pending: Map<string, () => void> } {
    const pending = new Map<string, () => void>();
    const context = fakeContext((_name, params) => {
      const key = String(params.key);
      const blocks: Block[] = [{ type: 'text', title: key, data: { text: key } }];
      return new Promise((resolve) => pending.set(key, () => resolve({ key, label: key, blocks })));
    });
    return { context, pending };
  }

  const shownTitle = (element: SoupPkgEkgQueries) =>
    (element.shadowRoot!.querySelector('.result soup-report-view') as FakeReportView | null)?.data?.blocks[0]?.title ?? null;

  it('decides from the fields whether a query runs at once', () => {
    const [count, echo] = [QUERIES.groups[0].queries[0], QUERIES.groups[1].queries[0]];
    expect(canRunAtOnce(count)).toBe(true);
    expect(canRunAtOnce(echo)).toBe(false);
    expect(canRunAtOnce({ ...echo, fields: [echo.fields[1]] })).toBe(true);
    expect(canRunAtOnce({ ...echo, fields: [{ ...echo.fields[0], default: 'x' }] })).toBe(true);
    expect(resultKey('q', { b: 1, a: 2 })).toBe(resultKey('q', { a: 2, b: 1 }));
  });

  it('runs a query without fields as soon as it is chosen, showing the wait meanwhile', async () => {
    const { context, pending } = controlledContext();
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', QUERIES, context);

    expect(context.action).toHaveBeenCalledWith('query', { key: 'count_events', params: {} });
    const area = element.shadowRoot!.querySelector('.result')!;
    expect(area.getAttribute('aria-busy')).toBe('true');
    expect(area.querySelector('.loading')!.textContent).toBe('Esecuzione…');

    pending.get('count_events')!();
    await vi.waitFor(() => expect(shownTitle(element)).toBe('count_events'));
    expect(area.hasAttribute('aria-busy')).toBe(false);
  });

  it('does not run a query with a required field without default until "Esegui"', async () => {
    const { context, pending } = controlledContext();
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', QUERIES, context);
    const root = element.shadowRoot!;
    (root.querySelector('button[data-query="test.echo"]') as HTMLButtonElement).click();
    expect(context.action).toHaveBeenCalledTimes(1); // only count_events, at the first opening

    const word = root.querySelector('input[name="word"]') as HTMLInputElement;
    word.value = 'ciao';
    word.dispatchEvent(new Event('input'));
    expect(context.action).toHaveBeenCalledTimes(1); // nothing at each key

    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(context.action).toHaveBeenLastCalledWith('query', { key: 'test.echo', params: { word: 'ciao', limit: 100 } });
    pending.get('test.echo')!();
    await vi.waitFor(() => expect(shownTitle(element)).toBe('test.echo'));
    expect(root.querySelector('form button[type="submit"]')!.textContent).toBe('Esegui');
  });

  it('shows only the last query when the user switches while one is running', async () => {
    const { context, pending } = controlledContext();
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', WITH_LIMIT, context);
    // count_events is running; the user goes to "top" (runs at once too).
    element.choose('top');
    pending.get('top')!();
    await vi.waitFor(() => expect(shownTitle(element)).toBe('top'));

    // The late answer of count_events is not drawn.
    pending.get('count_events')!();
    await Promise.resolve();
    await Promise.resolve();
    expect(shownTitle(element)).toBe('top');
    expect(element.selected!.key).toBe('top');
  });

  it('shows a query already run without a new request; "Esegui" asks again', async () => {
    const { context, pending } = controlledContext();
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', WITH_LIMIT, context);
    pending.get('count_events')!();
    await vi.waitFor(() => expect(shownTitle(element)).toBe('count_events'));
    element.choose('top');
    pending.get('top')!();
    await vi.waitFor(() => expect(shownTitle(element)).toBe('top'));
    expect(context.action).toHaveBeenCalledTimes(2);

    element.choose('count_events');
    expect(shownTitle(element)).toBe('count_events');
    expect(context.action).toHaveBeenCalledTimes(2);

    void element.run();
    expect(context.action).toHaveBeenCalledTimes(3);
  });

  it('shows no form and no "Esegui" for a query without fields; keeps "Esegui" for one with a default', async () => {
    const { context, pending } = controlledContext();
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', WITH_LIMIT, context);
    const root = element.shadowRoot!;
    const buttons = () => [...root.querySelectorAll('.main button')].map((button) => button.textContent);

    expect(element.selected!.key).toBe('count_events');
    expect(root.querySelector('.main form')).toBeNull();
    pending.get('count_events')!();
    await vi.waitFor(() => expect(shownTitle(element)).toBe('count_events'));
    expect(buttons()).toEqual([]);

    // Only a limit, with its default: runs at once and keeps "Esegui" to run again with other values.
    element.choose('top');
    expect(root.querySelector('.main form input[name="limit"]')).not.toBeNull();
    expect(buttons()).toEqual(['Esegui']);
  });

  it('shows the error of a query without fields in the result, with "Riprova"', async () => {
    let fail = true;
    const context = fakeContext(() => (fail ? Promise.reject(new Error('Memgraph offline')) : Promise.resolve({ key: 'count_events', label: 'Nodi evento', blocks: BLOCKS })));
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', QUERIES, context);
    const root = element.shadowRoot!;

    await vi.waitFor(() => expect(root.querySelector('.result .failure')).not.toBeNull());
    const failure = root.querySelector('.result .failure')!;
    expect(failure.getAttribute('role')).toBe('alert');
    expect(failure.querySelector('p')!.textContent).toBe('Memgraph offline');
    expect(context.notify).not.toHaveBeenCalled();

    fail = false;
    (failure.querySelector('button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root.querySelector('.result soup-report-view')).not.toBeNull());
    expect(context.action).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.result .failure')).toBeNull();
  });

  it('notifies, without "Riprova", the error of a query with fields', async () => {
    const context = fakeContext((_name, params) =>
      params.key === 'test.echo' ? Promise.reject(new Error("'word' is required")) : Promise.resolve({ key: 'count_events', label: '', blocks: [] })
    );
    const element = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', QUERIES, context);
    element.choose('test.echo');
    await element.run();
    expect(context.notify).toHaveBeenCalledWith("'word' is required", 'error');
    expect(element.shadowRoot!.querySelector('.result .failure')).toBeNull();
  });
});

/** count_events (no field) and "top" (only a limit with its default): both run at once. */
const WITH_LIMIT: QueriesData = {
  groups: [
    { group: 'Conteggi', queries: [QUERIES.groups[0].queries[0]] },
    {
      group: 'Classifiche',
      queries: [
        {
          key: 'top',
          label: 'Attività più frequenti',
          group: 'Classifiche',
          description: '',
          fields: [{ name: 'limit', label: 'Righe', type: 'number', required: false, default: 10, choices: [], help: '', variants: [] }]
        }
      ]
    }
  ]
};

describe('the notice of an object', () => {
  const NOTICE = "L'analisi non ha modificato il grafo: è uguale a quello di partenza.";

  it('is shown above the data of the three visualizers, as text', () => {
    const graph = mount<SoupPkgEkgGraph>('soup-pkg-ekg-graph', { ...GRAPH_DATA, notice: NOTICE }, fakeContext());
    const stats = mount<SoupPkgEkgStats>('soup-pkg-ekg-stats', { ...STATS, notice: '<b>x</b>' }, fakeContext());
    const queries = mount<SoupPkgEkgQueries>('soup-pkg-ekg-queries', { ...QUERIES, notice: NOTICE }, fakeContext());

    expect(graph.shadowRoot!.querySelector('.notice')!.textContent).toBe(NOTICE);
    expect(stats.shadowRoot!.querySelector('.notice')!.textContent).toBe('<b>x</b>');
    expect(stats.shadowRoot!.querySelector('b')).toBeNull();
    expect(queries.shadowRoot!.querySelector('.notice')!.getAttribute('role')).toBe('status');
  });

  it('is absent when the object has none', () => {
    const graph = mount<SoupPkgEkgGraph>('soup-pkg-ekg-graph', { ...GRAPH_DATA, notice: null }, fakeContext());
    const stats = mount<SoupPkgEkgStats>('soup-pkg-ekg-stats', STATS, fakeContext());
    expect(graph.shadowRoot!.querySelector('.notice')).toBeNull();
    expect(stats.shadowRoot!.querySelector('.notice')).toBeNull();
  });
});
