/**
 * The panels of <soup-graph-view>, as functions building DOM from what
 * they show and the callbacks they call (the element keeps the state and
 * redraws them): the toolbar (node shape, relationship types, search and
 * export buttons, counts), the search panel (nodes or edges, the query,
 * the list of results) and the properties of the selected node. Text
 * coming from data is always set with textContent.
 */

import { h } from '@soup/sdk';

import { display } from '../dom';
import { GraphNodeModel, SearchTarget } from './model';
import { NodeShape } from './renderer';

const SHAPES: [NodeShape, string][] = [
  ['rect', 'Rettangoli'],
  ['circle', 'Cerchi']
];

const TARGETS: [SearchTarget, string][] = [
  ['nodes', 'Nodi'],
  ['edges', 'Archi']
];

interface RelationshipToggle {
  name: string;
  color: string;
  visible: boolean;
}

interface ToolbarState {
  shape: NodeShape;
  relationships: readonly RelationshipToggle[];
  searchOpen: boolean;
  nodes: number;
  edges: number;
}

interface ToolbarActions {
  setShape(shape: NodeShape): void;
  setRelationshipVisible(type: string, visible: boolean): void;
  toggleSearch(): void;
  exportSvg(): void;
}

function shapeSelect(shape: NodeShape, actions: ToolbarActions): HTMLSelectElement {
  const select = h('select', {
    attrs: { 'aria-label': 'Forma dei nodi' },
    on: { change: (event) => actions.setShape((event.target as HTMLSelectElement).value as NodeShape) }
  });
  for (const [value, label] of SHAPES) {
    const option = h('option', { text: label, attrs: { value } });
    option.selected = value === shape;
    select.append(option);
  }
  return select;
}

function relationshipsMenu(relationships: readonly RelationshipToggle[], actions: ToolbarActions): HTMLElement {
  const list = h('div');
  for (const entry of relationships) {
    const box = h('input', {
      attrs: { type: 'checkbox', 'data-type': entry.name },
      on: { change: (event) => actions.setRelationshipVisible(entry.name, (event.target as HTMLInputElement).checked) }
    });
    box.checked = entry.visible;
    const swatch = h('span', { className: 'swatch' });
    swatch.style.background = entry.color;
    list.append(h('label', {}, box, swatch, entry.name || '(senza tipo)'));
  }
  return h('details', { className: 'relationships' }, h('summary', { text: 'Relazioni' }), list);
}

/** A command of the toolbar of <soup-graph-view> (its `toolbar` property). */
export type ToolbarCommand = 'shape' | 'relationships' | 'search' | 'export' | 'counts';

/** Every command, in the order of the toolbar. */
const TOOLBAR_COMMANDS: readonly ToolbarCommand[] = ['shape', 'relationships', 'search', 'export', 'counts'];

/** `toolbar`: every command, none, or the ones listed. */
export type ToolbarSetting = 'full' | 'none' | readonly ToolbarCommand[];

/**
 * The commands a `toolbar` value shows, in the toolbar's order. Also takes
 * the attribute's text: "full", "none" or names separated by spaces or
 * commas ("search export"); unknown names are ignored, null is "full".
 */
export function toolbarCommands(setting: ToolbarSetting | string | null | undefined): ToolbarCommand[] {
  if (setting === null || setting === undefined || setting === 'full') return [...TOOLBAR_COMMANDS];
  if (setting === 'none') return [];
  const names = typeof setting === 'string' ? setting.split(/[\s,]+/) : setting;
  const wanted = new Set(names.map((name) => name.trim()));
  return TOOLBAR_COMMANDS.filter((command) => wanted.has(command));
}

/** "N nodi, M archi" */
function countsText(nodes: number, edges: number): string {
  return `${nodes} nodi, ${edges} archi`;
}

/**
 * The controls of the toolbar, in groups: [shape, relationships] |
 * [search] | [export], the counts last (discreet, at the right). Only the
 * commands given (all by default); an empty group is not drawn.
 */
export function toolbarControls(state: ToolbarState, actions: ToolbarActions, commands: readonly ToolbarCommand[] = TOOLBAR_COMMANDS): Node[] {
  const wanted = new Set(commands);
  const controls: Record<ToolbarCommand, () => HTMLElement> = {
    shape: () => shapeSelect(state.shape, actions),
    relationships: () => relationshipsMenu(state.relationships, actions),
    search: () =>
      h('button', {
        text: state.searchOpen ? 'Chiudi ricerca' : 'Cerca',
        attrs: { type: 'button', 'aria-pressed': String(state.searchOpen) },
        on: { click: () => actions.toggleSearch() }
      }),
    export: () => h('button', { text: 'Esporta SVG', attrs: { type: 'button' }, on: { click: () => actions.exportSvg() } }),
    counts: () => h('span', { className: 'muted counts', text: countsText(state.nodes, state.edges) })
  };
  const groups: ToolbarCommand[][] = [['shape', 'relationships'], ['search'], ['export'], ['counts']];
  return groups
    .map((group) => group.filter((command) => wanted.has(command)))
    .filter((group) => group.length)
    .map((group) => h('div', { className: `group${group.includes('counts') ? ' group-counts' : ''}` }, ...group.map((command) => controls[command]())));
}

interface SearchActions {
  setTarget(target: SearchTarget): void;
  setQuery(query: string): void;
  scrolled(list: HTMLElement): void;
}

/** The tabs (nodes or edges), the query input and the empty list of results (filled by the element). */
export function searchPanel(target: SearchTarget, query: string, actions: SearchActions): { parts: Node[]; results: HTMLElement } {
  const tabs = h('div', { className: 'tabs', attrs: { role: 'tablist' } });
  for (const [value, label] of TARGETS) {
    tabs.append(
      h('button', {
        text: label,
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(target === value) },
        on: { click: () => actions.setTarget(value) }
      })
    );
  }
  const input = h('input', {
    attrs: { type: 'search', placeholder: 'Cerca', 'aria-label': 'Cerca nel grafo' },
    on: { input: (event) => actions.setQuery((event.target as HTMLInputElement).value) }
  });
  input.value = query;
  const results = h('ul', { className: 'results', on: { scroll: (event) => actions.scrolled(event.target as HTMLElement) } });
  return { parts: [tabs, input, results], results };
}

/** The properties of the selected node, with the button that closes them. */
export function propertiesPanel(node: GraphNodeModel, close: () => void): HTMLElement {
  const list = h('dl');
  list.append(h('dt', { text: 'id' }), h('dd', { text: node.id }));
  for (const [key, value] of Object.entries(node.props)) {
    list.append(h('dt', { text: key }), h('dd', { text: display(value) }));
  }
  const button = h('button', { text: '×', attrs: { type: 'button', 'aria-label': 'Chiudi' }, on: { click: close } });
  return h('div', { className: 'properties' }, h('div', { className: 'toolbar' }, h('strong', { text: node.label }), button), list);
}
