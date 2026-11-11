import { h } from '@soup/sdk';
import { BASE_CSS, display, style } from '../dom';
import { LoadPage, localPage, nextSort, pageCount, Row, TablePage, TableQuery, TableSort } from './table-model';

interface TableData {
  columns: string[];
  rows: Row[];
  /** The full row count when `rows` is only the first part (a report block). */
  total?: number;
}

const CSS = `
  .toolbar { display: flex; flex-wrap: wrap; gap: var(--soup-space-2, 8px); align-items: center; margin-bottom: var(--soup-space-2, 8px); }
  .wrap { overflow: auto; max-height: 78dvh; border: 1px solid var(--soup-border, #d0d7de); border-radius: var(--soup-radius-md, 8px); background: #fff; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 0.875rem; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #eaeef2; text-align: left; vertical-align: top; }
  th { position: sticky; top: 0; z-index: 1; background: var(--soup-surface-alt, #f6f8fa); border-bottom-color: var(--soup-border, #d0d7de); cursor: pointer; user-select: none; white-space: nowrap; font-weight: 600; }
  th:focus-visible { outline: 2px solid var(--soup-focus, #0b5ed7); outline-offset: -2px; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  tbody tr:hover td { background: var(--soup-primary-soft, #fff4e0); }
  tbody tr:last-child td { border-bottom: 0; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  th[aria-sort='ascending']::after { content: ' ▲'; }
  th[aria-sort='descending']::after { content: ' ▼'; }
  .pager { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
  details { position: relative; }
  details > div { position: absolute; z-index: 2; padding: 6px 10px; background: #fff; border: 1px solid #d0d7de; border-radius: 6px; max-height: 260px; overflow: auto; }
  label { display: block; white-space: nowrap; }
  .error { color: #b02a37; }
`;

/**
 * <soup-table>: a table with paging, sorting by column (click on the
 * header: ascending, descending, none), search and choice of the visible
 * columns. The rows are paged in memory, or by `loadPage` (remote paging,
 * set by a visualizer that asks its own action).
 *
 * Properties: `data` ({columns, rows, total?}) or `columns` + `rows`;
 * `pageSize` (default 25); `loadPage`. Methods: `refresh()`,
 * `goTo(page)`, `sortBy(column)`, `setSearch(text)`, `setColumnVisible(i, v)`.
 * Event `soup-table-page` {page, total} after each page is drawn.
 */
export class SoupTable extends HTMLElement {
  public columns: string[] = [];
  public rows: Row[] = [];
  /** Rows of the whole table when `rows` is truncated (shown as a note). */
  public declaredTotal: number | null = null;
  public pageSize = 25;
  public loadPage: LoadPage | null = null;

  /** The page on screen (0-based) and its rows. */
  public page = 0;
  public current: TablePage = { rows: [], total: 0 };
  public sort: TableSort | null = null;
  public searchText = '';
  public readonly hiddenColumns = new Set<number>();

  private readonly root = this.attachShadow({ mode: 'open' });
  private request = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  public set data(value: TableData | undefined) {
    this.columns = [...(value?.columns ?? [])];
    this.rows = [...(value?.rows ?? [])];
    this.declaredTotal = typeof value?.total === 'number' ? value.total : null;
    this.page = 0;
    this.hiddenColumns.clear();
    if (this.isConnected) void this.refresh();
  }

  public get data(): TableData {
    return { columns: this.columns, rows: this.rows, total: this.declaredTotal ?? undefined };
  }

  public connectedCallback(): void {
    void this.refresh();
  }

  public query(): TableQuery {
    return { offset: this.page * this.pageSize, limit: this.pageSize, sort: this.sort, search: this.searchText };
  }

  /** Load (or compute) the current page and draw it. */
  public async refresh(): Promise<void> {
    const request = ++this.request;
    const query = this.query();
    let page: TablePage;
    try {
      page = this.loadPage ? await this.loadPage(query) : localPage(this.rows, query);
    } catch (error) {
      if (request === this.request) this.drawError(error);
      return;
    }
    if (request !== this.request) return;
    this.current = page;
    this.draw();
    this.dispatchEvent(new CustomEvent('soup-table-page', { detail: { page: this.page, total: page.total } }));
  }

  public goTo(page: number): Promise<void> {
    this.page = Math.min(Math.max(0, page), pageCount(this.current.total, this.pageSize) - 1);
    return this.refresh();
  }

  public sortBy(column: number): Promise<void> {
    this.sort = nextSort(this.sort, column);
    this.page = 0;
    return this.refresh();
  }

  public setSearch(text: string): Promise<void> {
    this.searchText = text;
    this.page = 0;
    return this.refresh();
  }

  public setColumnVisible(column: number, visible: boolean): void {
    if (visible) this.hiddenColumns.delete(column);
    else this.hiddenColumns.add(column);
    this.draw();
  }

  private visibleColumns(): number[] {
    return this.columns.map((_, index) => index).filter((index) => !this.hiddenColumns.has(index));
  }

  // The toolbar stays while the pages change: the search keeps its focus.
  private skeleton: { search: HTMLInputElement; chooser: HTMLElement; note: HTMLElement; wrap: HTMLElement; pager: HTMLElement } | null = null;
  private chooserFor: string[] | null = null;

  private ensureSkeleton() {
    if (this.skeleton) return this.skeleton;
    const search = h('input', {
      attrs: { type: 'search', placeholder: 'Search', 'aria-label': 'Search table' },
      on: {
        input: (event) => {
          const value = (event.target as HTMLInputElement).value;
          clearTimeout(this.searchTimer);
          this.searchTimer = setTimeout(() => void this.setSearch(value), 250);
        }
      }
    });
    const chooser = h('div');
    const note = h('span', { className: 'muted note' });
    const wrap = h('div', { className: 'wrap' });
    const pager = h('div', { className: 'pager' });
    const columnsMenu = h('details', { className: 'columns' }, h('summary', { text: 'Columns' }), chooser);
    this.root.replaceChildren(style(BASE_CSS + CSS), h('div', { className: 'toolbar' }, search, columnsMenu, note), wrap, pager);
    this.skeleton = { search, chooser, note, wrap, pager };
    return this.skeleton;
  }

  private draw(): void {
    const { search, chooser, note, wrap, pager } = this.ensureSkeleton();
    if (search.value !== this.searchText && this.root.activeElement !== search) search.value = this.searchText;
    this.drawChooser(chooser);
    this.drawTable(wrap);
    this.drawPager(pager);
    this.drawNote(note);
  }

  /** The checkboxes of the visible columns, redrawn only when the columns change. */
  private drawChooser(chooser: HTMLElement): void {
    if (this.chooserFor === this.columns) return;
    this.chooserFor = this.columns;
    chooser.replaceChildren(
      ...this.columns.map((name, index) => {
        const box = h('input', {
          attrs: { type: 'checkbox' },
          on: { change: (event) => this.setColumnVisible(index, (event.target as HTMLInputElement).checked) }
        });
        box.checked = !this.hiddenColumns.has(index);
        return h('label', {}, box, ` ${name}`);
      })
    );
  }

  private drawTable(wrap: HTMLElement): void {
    const visible = this.visibleColumns();
    const head = h('tr');
    for (const index of visible) {
      // Sorted by a click or, with the keyboard, Enter or Space.
      const th = h('th', {
        text: this.columns[index],
        attrs: { scope: 'col', tabindex: '0' },
        on: {
          click: () => void this.sortBy(index),
          keydown: (event) => {
            const key = (event as KeyboardEvent).key;
            if (key === 'Enter' || key === ' ') {
              event.preventDefault();
              void this.sortBy(index);
            }
          }
        }
      });
      if (this.sort?.column === index) th.setAttribute('aria-sort', this.sort.direction === 'asc' ? 'ascending' : 'descending');
      head.append(th);
    }
    const body = h('tbody');
    for (const row of this.current.rows) {
      body.append(h('tr', {}, ...visible.map((index) => h('td', { text: display(row[index]), className: typeof row[index] === 'number' ? 'num' : '' }))));
    }
    wrap.replaceChildren(h('table', {}, h('thead', {}, head), body));
  }

  private drawPager(pager: HTMLElement): void {
    const pages = pageCount(this.current.total, this.pageSize);
    const first = this.current.total === 0 ? 0 : this.page * this.pageSize + 1;
    const last = Math.min(this.current.total, (this.page + 1) * this.pageSize);
    const previous = h('button', {
      text: '‹',
      attrs: { type: 'button', 'aria-label': 'Previous page' },
      on: { click: () => void this.goTo(this.page - 1) }
    });
    const next = h('button', {
      text: '›',
      attrs: { type: 'button', 'aria-label': 'Next page' },
      on: { click: () => void this.goTo(this.page + 1) }
    });
    previous.disabled = this.page === 0;
    next.disabled = this.page >= pages - 1;
    pager.replaceChildren(previous, h('span', { className: 'range', text: `${first}–${last} of ${this.current.total}` }), next);
  }

  /** With local paging, a note when the data says the table has more rows than it was given. */
  private drawNote(note: HTMLElement): void {
    note.textContent =
      !this.loadPage && this.declaredTotal !== null && this.declaredTotal > this.rows.length
        ? `Showing ${this.rows.length} of ${this.declaredTotal} rows`
        : '';
  }

  private drawError(error: unknown): void {
    const { wrap } = this.ensureSkeleton();
    wrap.replaceChildren(h('div', { className: 'error', attrs: { role: 'alert' }, text: error instanceof Error ? error.message : String(error) }));
  }
}
