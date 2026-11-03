/**
 * <soup-pkg-ocel-tables>: the "Tabelle OCEL" visualizer of "ocel_tables"
 * objects. One tab per table (events, objects, event-object and
 * object-object relationships); a <soup-table> (soup_base) pages the rows
 * on the server: every page is context.action('page', {table, offset,
 * limit, sort, search, type}). The select above the table filters by type
 * (event type for the events, object type for the others).
 */

import { h, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

import { SoupTableElement, TablePage, TableQuery } from './soup-base';

export interface OcelTab {
  key: string;
  label: string;
  columns: string[];
  total: number;
  type_label: string;
  types: string[];
}

export interface OcelTablesData {
  page_size: number;
  tables: OcelTab[];
}

const CSS = `
  :host { display: block; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 0.95rem; }
  :focus-visible { outline: 2px solid var(--soup-focus, #0b5ed7); outline-offset: 2px; }
  [role="tablist"] { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid #dee2e6; margin-bottom: 8px; }
  [role="tab"] { font: inherit; cursor: pointer; padding: 4px 12px; border: 1px solid transparent; border-radius: 4px 4px 0 0;
    background: none; color: #495057; margin-bottom: -1px; }
  [role="tab"][aria-selected="true"] { border-color: #dee2e6 #dee2e6 #fff; background: #fff; color: #212529; font-weight: 600; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 8px; }
  .info { color: var(--soup-text-muted, #5c636a); font-size: 0.875rem; }
  select { font: inherit; padding: 2px 6px; border: 1px solid #adb5bd; border-radius: 4px; }
`;

export const ALL_TYPES = '';

export class SoupPkgOcelTables extends HTMLElement implements SoupVisualizerElement<OcelTablesData> {
  public data: OcelTablesData = { page_size: 25, tables: [] };
  public context!: VisualizerContext;
  public table: SoupTableElement | null = null;
  public selected = 0;
  public type = ALL_TYPES;

  private readonly root = this.attachShadow({ mode: 'open' });
  private info: HTMLElement | null = null;

  public connectedCallback(): void {
    if (this.table) return;
    this.render();
  }

  public get tab(): OcelTab | undefined {
    return this.data.tables[this.selected];
  }

  /** Show the table at `index`, without a type filter. */
  public select(index: number): void {
    if (index < 0 || index >= this.data.tables.length) return;
    this.selected = index;
    this.type = ALL_TYPES;
    this.render();
  }

  /** Filter the current table by `type` (ALL_TYPES for none) and go back to the first page. */
  public setType(type: string): Promise<void> {
    this.type = type;
    return this.table ? this.table.goTo(0) : Promise.resolve();
  }

  /** One page from the server: what soup-table's loadPage calls. */
  public async loadPage(query: TableQuery): Promise<TablePage> {
    const tab = this.tab;
    if (!tab) return { rows: [], total: 0 };
    const page = await this.context.action<TablePage>('page', {
      table: tab.key,
      offset: query.offset,
      limit: query.limit,
      sort: query.sort,
      search: query.search,
      type: this.type
    });
    if (this.info) {
      this.info.textContent = page.total === tab.total ? `${tab.total} righe` : `${page.total} righe su ${tab.total}`;
    }
    return page;
  }

  private render(): void {
    const tablist = h('div', { attrs: { role: 'tablist', 'aria-label': 'Tabelle del log' } });
    this.data.tables.forEach((tab, index) => {
      const selected = index === this.selected;
      tablist.append(
        h('button', {
          text: `${tab.label} (${tab.total})`,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(selected), 'data-table': tab.key },
          on: { click: () => this.select(index) }
        })
      );
    });

    const tab = this.tab;
    if (!tab) {
      this.table = null;
      this.root.replaceChildren(h('style', { text: CSS }), tablist);
      return;
    }

    const filter = h('select', {
      attrs: { 'aria-label': tab.type_label },
      on: { change: (event) => void this.setType((event.target as HTMLSelectElement).value) }
    });
    filter.append(
      h('option', { text: 'Tutti i tipi', attrs: { value: ALL_TYPES } }),
      ...tab.types.map((type) => h('option', { text: type, attrs: { value: type } }))
    );
    this.info = h('span', { className: 'info', text: `${tab.total} righe` });
    const bar = h('div', { className: 'bar' }, h('label', {}, `${tab.type_label} `, filter), this.info);

    const table = document.createElement('soup-table') as SoupTableElement;
    table.pageSize = this.data.page_size || 25;
    table.loadPage = (query) => this.loadPage(query);
    table.data = { columns: [...tab.columns], rows: [] };
    this.table = table;

    this.root.replaceChildren(h('style', { text: CSS }), tablist, bar, table);
  }
}
