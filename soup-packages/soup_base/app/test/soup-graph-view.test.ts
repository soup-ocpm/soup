import { afterEach, describe, expect, it, vi } from 'vitest';

import { GraphModel, GraphNodeModel } from '../src/graph/model';
import { GraphRenderer } from '../src/graph/renderer';
import { SoupGraphView } from '../src/graph/soup-graph-view';

if (!customElements.get('soup-graph-view')) customElements.define('soup-graph-view', SoupGraphView);

/** An engine that draws nothing (jsdom has no SVG sizes for the dagre layout). */
class FakeRenderer implements GraphRenderer {
  public onNodeClick: ((id: string) => void) | null = null;
  public models: GraphModel[] = [];
  public mount(): void {}
  public render(model: GraphModel): void {
    this.models.push(model);
  }
  public setNodeShape(): void {}
  public setRelationshipVisible(): void {}
  public setHighlighted(): void {}
  public clear(): void {}
  public exportSvg(): string {
    return '<svg></svg>';
  }
  public destroy(): void {}
}

const DRAWN: GraphNodeModel = { id: '1', label: 'Create', group: 'Event', props: { case: 1 } };
const FOUND: GraphNodeModel = { id: '9', label: 'Pay', group: 'Event', props: { case: 9 } };

function mount(): SoupGraphView {
  const view = document.createElement('soup-graph-view') as SoupGraphView;
  view.thumbnail = false;
  view.renderer = new FakeRenderer();
  view.data = { nodes: [DRAWN], edges: [], directed: true };
  document.body.append(view);
  return view;
}

function properties(view: SoupGraphView): string[] {
  return [...view.shadowRoot!.querySelectorAll('.properties dd')].map((item) => item.textContent ?? '');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('<soup-graph-view> nodeDetails', () => {
  it('shows the properties of the model without nodeDetails', () => {
    const view = mount();
    view.selectNode('1');
    expect(view.selected).toEqual(DRAWN);
    expect(properties(view)).toEqual(['1', '1']);
  });

  it('asks nodeDetails for the selected node and shows its properties', async () => {
    const view = mount();
    view.nodeDetails = vi.fn(() => Promise.resolve({ ...DRAWN, props: { case: 1, cost: '<b>5</b>' } }));
    view.selectNode('1');
    await vi.waitFor(() => expect(view.selected?.props).toEqual({ case: 1, cost: '<b>5</b>' }));

    expect(view.nodeDetails).toHaveBeenCalledWith('1');
    expect(properties(view)).toEqual(['1', '1', '<b>5</b>']);
    expect(view.shadowRoot!.querySelector('.properties b')).toBeNull();
  });

  it('selects a node found by the remote search even if it is not drawn', async () => {
    const view = mount();
    view.search = vi.fn(() => Promise.resolve({ items: [FOUND], total: 1 }));
    view.nodeDetails = vi.fn(() => Promise.resolve({ ...FOUND, props: { case: 9, amount: 3 } }));
    await view.runSearch('pay', 'nodes');

    view.selectNode('9');
    expect(view.selected?.id).toBe('9');
    await vi.waitFor(() => expect(view.selected?.props).toEqual({ case: 9, amount: 3 }));
  });

  it('ignores the details of a node no longer selected', async () => {
    const view = mount();
    let resolve: (node: GraphNodeModel) => void = () => undefined;
    view.nodeDetails = vi.fn(() => new Promise<GraphNodeModel>((done) => (resolve = done)));
    view.selectNode('1');
    view.selectNode(null);
    resolve({ ...DRAWN, props: { late: true } });
    await Promise.resolve();
    expect(view.selected).toBeNull();
  });
});

describe('<soup-graph-view> toolbar', () => {
  const toolbar = (view: SoupGraphView) => view.shadowRoot!.querySelector<HTMLElement>('.toolbar')!;
  const buttons = (view: SoupGraphView) => [...toolbar(view).querySelectorAll('button')].map((button) => button.textContent);
  const shown = (view: SoupGraphView) => ({
    shape: toolbar(view).querySelector('select[aria-label="Forma dei nodi"]') !== null,
    relationships: toolbar(view).querySelector('details.relationships') !== null,
    buttons: buttons(view),
    counts: toolbar(view).querySelector('.counts')?.textContent ?? null
  });

  it('shows every command by default, in groups', () => {
    const view = mount();
    expect(view.toolbar).toBe('full');
    expect(view.toolbarCommands()).toEqual(['shape', 'relationships', 'search', 'export', 'counts']);
    expect(shown(view)).toEqual({ shape: true, relationships: true, buttons: ['Cerca', 'Esporta SVG'], counts: '1 nodi, 0 archi' });
    expect([...toolbar(view).children].map((group) => group.className)).toEqual(['group', 'group', 'group', 'group group-counts']);
    expect(toolbar(view).hidden).toBe(false);
  });

  it("'none' hides the toolbar; the search still opens with openSearch()", () => {
    const view = mount();
    view.toolbar = 'none';
    expect(toolbar(view).hidden).toBe(true);
    expect(toolbar(view).children).toHaveLength(0);

    view.openSearch();
    expect(view.searchVisible).toBe(true);
    expect(view.shadowRoot!.querySelector('.side')!.hasAttribute('hidden')).toBe(false);
    expect(view.shadowRoot!.querySelector('.side input[type="search"]')).not.toBeNull();
    view.openSearch(false);
    expect(view.searchVisible).toBe(false);
    expect(view.shadowRoot!.querySelector('.side')!.hasAttribute('hidden')).toBe(true);
  });

  it('a list shows only those commands, in the order of the toolbar', () => {
    const view = mount();
    view.toolbar = ['export', 'search'];
    expect(view.toolbarCommands()).toEqual(['search', 'export']);
    expect(shown(view)).toEqual({ shape: false, relationships: false, buttons: ['Cerca', 'Esporta SVG'], counts: null });
  });

  it('reads the attribute: "none", a list of names (unknown ones ignored), and the property wins over it', () => {
    const view = mount();
    view.setAttribute('toolbar', 'none');
    expect(view.toolbar).toBe('none');
    expect(toolbar(view).hidden).toBe(true);

    view.setAttribute('toolbar', 'counts, zoom search');
    expect(view.toolbar).toEqual(['search', 'counts']);
    expect(shown(view)).toEqual({ shape: false, relationships: false, buttons: ['Cerca'], counts: '1 nodi, 0 archi' });

    view.toolbar = 'full';
    expect(shown(view).buttons).toEqual(['Cerca', 'Esporta SVG']);
    view.toolbar = null;
    expect(view.toolbar).toEqual(['search', 'counts']);
  });

  it('keeps the chosen commands across new data and the search toggle', () => {
    const view = mount();
    view.toolbar = ['search'];
    view.data = { nodes: [DRAWN, FOUND], edges: [], directed: true };
    expect(buttons(view)).toEqual(['Cerca']);
    toolbar(view).querySelector('button')!.click();
    expect(buttons(view)).toEqual(['Chiudi ricerca']);
    expect(view.searchVisible).toBe(true);
  });
});
