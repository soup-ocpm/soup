/**
 * <soup-pkg-csv-table-viewer>: the "Tabella CSV" visualizer of "table"
 * objects, after ProM's CSVViewer. A <soup-table> (soup_base) pages the
 * rows on the server: every page is context.action('page', {offset,
 * limit, sort, search, filter}). Sorting is the click on a header, the
 * search box of soup-table searches every column, and the row of inputs
 * above the table filters column by column (all the filters together).
 */

import { h, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

import { SoupTableElement, TablePage, TableQuery } from './soup-base';

interface CsvTableData {
  columns: string[];
  total: number;
  page_size: number;
}

interface ColumnFilter {
  column: number;
  value: string;
}

const CSS = `
  :host { display: block; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 0.95rem; }
  :focus-visible { outline: 2px solid var(--soup-focus, #0b5ed7); outline-offset: 2px; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--soup-space-3, 12px); margin-bottom: var(--soup-space-2, 8px); }
  .info { color: var(--soup-text-muted, #5c636a); font-size: 0.875rem; }
  .filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--soup-space-2, 8px); margin-bottom: var(--soup-space-3, 12px); }
  .filters label { display: flex; flex-direction: column; font-size: 0.8rem; color: #495057; overflow: hidden; }
  .filters span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button, input { font: inherit; }
  button { cursor: pointer; padding: 2px 10px; border: 1px solid #adb5bd; border-radius: 4px; background: #fff; }
  input { padding: 2px 6px; border: 1px solid #adb5bd; border-radius: 4px; min-width: 0; }
`;

export const FILTER_DELAY_MS = 250;

export class SoupPkgCsvTableViewer extends HTMLElement implements SoupVisualizerElement<CsvTableData> {
  public data: CsvTableData = { columns: [], total: 0, page_size: 25 };
  public context!: VisualizerContext;
  public table: SoupTableElement | null = null;

  private readonly root = this.attachShadow({ mode: 'open' });
  private readonly values = new Map<number, string>();
  // One timer per column: typing in another column must not drop a pending filter.
  private readonly filterTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private info: HTMLElement | null = null;

  /** The non-empty column filters, in column order. */
  public get filters(): ColumnFilter[] {
    return [...this.values.entries()]
      .filter(([, value]) => value.trim() !== '')
      .sort(([a], [b]) => a - b)
      .map(([column, value]) => ({ column, value }));
  }

  public connectedCallback(): void {
    if (this.table) return;
    this.render();
  }

  /** Set the filter of a column and go back to the first page. */
  public setFilter(column: number, value: string): Promise<void> {
    this.values.set(column, value);
    return this.table ? this.table.goTo(0) : Promise.resolve();
  }

  public clearFilters(): Promise<void> {
    for (const timer of this.filterTimers.values()) clearTimeout(timer);
    this.filterTimers.clear();
    this.values.clear();
    for (const input of this.root.querySelectorAll<HTMLInputElement>('.filters input')) input.value = '';
    return this.table ? this.table.goTo(0) : Promise.resolve();
  }

  /** One page from the server: what soup-table's loadPage calls. */
  public async loadPage(query: TableQuery): Promise<TablePage> {
    const page = await this.context.action<TablePage>('page', {
      offset: query.offset,
      limit: query.limit,
      sort: query.sort,
      search: query.search,
      filter: this.filters
    });
    if (this.info) {
      const filtered = page.total !== this.data.total;
      this.info.textContent = filtered
        ? `${page.total} of ${this.data.total} rows · ${this.data.columns.length} columns`
        : `${this.data.total} rows · ${this.data.columns.length} columns`;
    }
    return page;
  }

  private render(): void {
    const name = this.context?.object.name ?? '';
    this.info = h('span', { className: 'info', text: `${this.data.total} rows · ${this.data.columns.length} columns` });
    const clear = h('button', {
      className: 'clear-filters',
      text: 'Clear filters',
      attrs: { type: 'button' },
      on: { click: () => void this.clearFilters() }
    });
    const header = h('header', {}, h('strong', { text: name }), this.info, clear);

    const filters = h(
      'div',
      { className: 'filters' },
      ...this.data.columns.map((column, index) => {
        const input = h('input', {
          attrs: { type: 'search', placeholder: 'Filter', 'aria-label': `Filter ${column}`, 'data-column': String(index) },
          on: {
            input: (event) => {
              const value = (event.target as HTMLInputElement).value;
              clearTimeout(this.filterTimers.get(index));
              this.filterTimers.set(
                index,
                setTimeout(() => {
                  this.filterTimers.delete(index);
                  void this.setFilter(index, value);
                }, FILTER_DELAY_MS)
              );
            }
          }
        });
        return h('label', {}, h('span', { text: column, attrs: { title: column } }), input);
      })
    );

    const table = document.createElement('soup-table') as SoupTableElement;
    table.pageSize = this.data.page_size || 25;
    table.loadPage = (query) => this.loadPage(query);
    table.data = { columns: [...this.data.columns], rows: [] };
    this.table = table;

    this.root.replaceChildren(h('style', { text: CSS }), header, filters, table);
  }
}
