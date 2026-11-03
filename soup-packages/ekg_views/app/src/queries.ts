/**
 * <soup-pkg-ekg-queries>: the "Interrogazioni" visualizer of "ekg" objects.
 * The queries contributed to "ekg.queries" by any package, by group; the
 * chosen one shows a form of its fields and runs with the action "query"
 * {key, params}; the blocks of the answer are drawn by <soup-report-view>
 * (soup_base). A query whose form is valid with its defaults runs as soon
 * as it is chosen (canRunAtOnce, from its fields); "Esegui" runs it again
 * with the values typed (never at each key). A query without fields has no
 * form and no "Esegui": if it fails, the error is shown in the result area
 * with "Riprova". The results stay in memory for the page, by query and
 * values: choosing a query already run shows its result without a new
 * request. Also the queries of "ekg_class".
 */

import { Block, errorMessage, Field, h, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

import { NOTICE_CSS, noticeBox } from './dom';
import { SoupReportViewElement } from './soup-base';

export interface QueryInfo {
  key: string;
  label: string;
  group: string;
  description: string;
  fields: Field[];
}

export interface QueriesData {
  groups: { group: string; queries: QueryInfo[] }[];
  notice?: string | null;
}

interface QueryResult {
  key: string;
  label: string;
  blocks: Block[];
}

// The list of the queries and the chosen one as two cards; one above the other below 768 px.
const CSS = `
  :host { display: block; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 0.95rem; }
  .layout { display: flex; gap: var(--soup-space-4, 16px); align-items: flex-start; }
  nav, .main { padding: var(--soup-space-3, 12px) var(--soup-space-4, 16px); border: 1px solid var(--soup-border, #d0d7de); border-radius: var(--soup-radius-md, 8px); background: var(--soup-surface, #fff); box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06); }
  nav { flex: 0 0 260px; min-width: 0; max-height: var(--soup-graph-height, clamp(420px, calc(100dvh - 300px), 900px)); overflow: auto; }
  nav h4 { margin: var(--soup-space-3, 12px) 0 var(--soup-space-1, 4px); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--soup-text-muted, #5c636a); }
  nav h4:first-child { margin-top: 0; }
  nav button { display: block; width: 100%; text-align: left; background: none; border: none; padding: var(--soup-space-1, 4px) var(--soup-space-2, 8px); cursor: pointer; font: inherit; color: inherit; border-radius: var(--soup-radius-sm, 4px); }
  nav button:hover { background: var(--soup-surface-alt, #f6f8fa); }
  nav button[aria-pressed='true'] { background: var(--soup-primary-soft, #fff4e0); color: var(--soup-on-primary, #1f1300); font-weight: 600; box-shadow: inset 3px 0 0 var(--soup-primary, #ffac1c); }
  .main { flex: 1 1 auto; min-width: 0; }
  .main > h3 { margin: 0 0 var(--soup-space-1, 4px); font-size: 1.05rem; }
  form { display: flex; flex-wrap: wrap; gap: var(--soup-space-3, 12px); align-items: flex-end; margin: var(--soup-space-3, 12px) 0; }
  form label { display: flex; flex-direction: column; gap: 2px; font-size: 0.875rem; }
  input, select, button { font: inherit; }
  input:not([type='checkbox']), select { padding: 2px 6px; border: 1px solid #adb5bd; border-radius: var(--soup-radius-sm, 4px); }
  form button[type='submit'] { padding: 3px 14px; border: 1px solid var(--soup-primary, #ffac1c); border-radius: var(--soup-radius-sm, 4px); background: var(--soup-primary, #ffac1c); color: var(--soup-on-primary, #1f1300); font-weight: 600; cursor: pointer; }
  :focus-visible { outline: 2px solid var(--soup-focus, #0b5ed7); outline-offset: 2px; }
  .info { color: var(--soup-text-muted, #5c636a); font-size: 0.875rem; margin: 0; }
  .main > .info + .result, .main > h3 + .result { margin-top: var(--soup-space-3, 12px); }
  .failure { display: flex; flex-wrap: wrap; align-items: center; gap: var(--soup-space-3, 12px); padding: var(--soup-space-2, 8px) var(--soup-space-3, 12px); border-left: 3px solid var(--soup-danger-border, #b02a37); border-radius: var(--soup-radius-sm, 4px); background: var(--soup-danger-bg, #fdecee); color: var(--soup-danger-text, #842029); }
  .failure p { margin: 0; }
  .failure button { padding: 2px 12px; border: 1px solid var(--soup-danger-border, #b02a37); border-radius: var(--soup-radius-sm, 4px); background: #fff; color: inherit; cursor: pointer; }
  @media (max-width: 767.98px) {
    .layout { flex-direction: column; align-items: stretch; }
    nav { flex-basis: auto; max-height: 260px; }
  }
`;

/**
 * True when the form of `query` is valid with its defaults: no field, or
 * every field optional or with a default (e.g. a limit). Such a query runs
 * as soon as it is chosen; one with a required field without a default
 * waits for "Esegui".
 */
export function canRunAtOnce(query: QueryInfo): boolean {
  return query.fields.every((field) => !field.required || (field.default !== null && field.default !== undefined));
}

/** The key of a result in memory: the query and its values, in name order. */
export function resultKey(key: string, params: Record<string, unknown>): string {
  const ordered = Object.keys(params)
    .sort()
    .map((name) => [name, params[name]]);
  return `${key}\u0000${JSON.stringify(ordered)}`;
}

export class SoupPkgEkgQueries extends HTMLElement implements SoupVisualizerElement<QueriesData> {
  public data: QueriesData = { groups: [] };
  public context!: VisualizerContext;
  public selected: QueryInfo | null = null;
  public values: Record<string, unknown> = {};
  public result: SoupReportViewElement | null = null;

  private readonly root = this.attachShadow({ mode: 'open' });
  private nav: HTMLElement | null = null;
  private main: HTMLElement | null = null;
  private request = 0;
  // The blocks of every query already run in this page, by query and values (resultKey)
  private readonly results = new Map<string, Block[]>();

  public connectedCallback(): void {
    if (this.nav) return;
    this.nav = h('nav');
    this.main = h('div', { className: 'main' });
    this.root.replaceChildren(
      h('style', { text: CSS + NOTICE_CSS }),
      ...noticeBox(this.data.notice),
      h('div', { className: 'layout' }, this.nav, this.main)
    );
    const first = this.data.groups[0]?.queries[0];
    if (first) this.choose(first.key);
    else this.draw();
  }

  public queries(): QueryInfo[] {
    return this.data.groups.flatMap((group) => group.queries);
  }

  /**
   * Show the form of query `key`, with the defaults of its fields. Its
   * result for these values, if already run in this page, is shown at once;
   * otherwise a query whose form is valid as it is (canRunAtOnce) runs now.
   */
  public choose(key: string): void {
    this.selected = this.queries().find((query) => query.key === key) ?? null;
    this.values = {};
    for (const field of this.selected?.fields ?? []) {
      if (field.default !== null && field.default !== undefined) this.values[field.name] = field.default;
    }
    this.result = null;
    // A response still pending is for another query: it is discarded.
    this.request++;
    this.draw();
    const query = this.selected;
    if (!query) return;
    const cached = this.results.get(resultKey(query.key, this.values));
    if (cached) this.show(cached);
    else if (canRunAtOnce(query)) void this.run({ force: false });
  }

  /**
   * Run the selected query with `values` and draw its blocks ("Esegui":
   * force, always a new request; otherwise the result already in memory
   * for the same query and values, if any). Only the response of the last
   * request is drawn.
   */
  public async run({ force = true }: { force?: boolean } = {}): Promise<void> {
    const query = this.selected;
    if (!query) return;
    const params = { ...this.values };
    if (!force && this.showCached(query, params)) return;
    await this.fetchResult(query, params);
  }

  /** Show the result in memory for `query` with `params`; false when there is none. */
  private showCached(query: QueryInfo, params: Record<string, unknown>): boolean {
    const cached = this.results.get(resultKey(query.key, params));
    if (cached) this.show(cached);
    return cached !== undefined;
  }

  /** Ask the "query" action, keep its blocks in memory and draw them if still current. */
  private async fetchResult(query: QueryInfo, params: Record<string, unknown>): Promise<void> {
    const request = ++this.request;
    this.setLoading(true);
    try {
      const result = await this.context.action<QueryResult>('query', { key: query.key, params });
      const blocks = result?.blocks ?? [];
      this.results.set(resultKey(query.key, params), blocks);
      if (this.isCurrent(request, query)) this.show(blocks);
    } catch (error) {
      this.failed(request, query, error);
    }
  }

  /** True when `request` is the last one and `query` is still the selected one (else its response is discarded). */
  private isCurrent(request: number, query: QueryInfo): boolean {
    return request === this.request && this.selected === query;
  }

  /** The error of `request`, only if it is the last one: no wait, a notification. */
  private failed(request: number, query: QueryInfo, error: unknown): void {
    if (request !== this.request) return;
    this.setLoading(false);
    if (query.fields.length) this.context.notify(errorMessage(error), 'error');
    else this.showFailure(errorMessage(error));
  }

  /** A query without fields has no "Esegui": its error stays in the result area, with "Riprova". */
  private showFailure(message: string): void {
    const retry = h('button', { text: 'Riprova', attrs: { type: 'button' }, on: { click: () => void this.run() } });
    this.main
      ?.querySelector('.result')
      ?.replaceChildren(h('div', { className: 'failure', attrs: { role: 'alert' } }, h('p', { text: message }), retry));
  }

  private show(blocks: Block[]): void {
    const view = document.createElement('soup-report-view') as SoupReportViewElement;
    view.context = this.context;
    view.data = { blocks };
    this.result = view;
    const area = this.main?.querySelector('.result');
    area?.removeAttribute('aria-busy');
    area?.replaceChildren(view);
  }

  /** The waiting state of the result area (aria-busy and a message). */
  private setLoading(loading: boolean): void {
    const area = this.main?.querySelector('.result');
    if (!area) return;
    if (loading) {
      area.setAttribute('aria-busy', 'true');
      area.replaceChildren(h('p', { className: 'info loading', text: 'Esecuzione…', attrs: { role: 'status' } }));
    } else {
      area.removeAttribute('aria-busy');
      area.replaceChildren();
    }
  }

  private draw(): void {
    if (!this.nav || !this.main) return;
    this.nav.replaceChildren(
      ...this.data.groups.flatMap((group) => [
        h('h4', { text: group.group }),
        ...group.queries.map((query) =>
          h('button', {
            text: query.label,
            attrs: { type: 'button', 'data-query': query.key, 'aria-pressed': String(query.key === this.selected?.key) },
            on: { click: () => this.choose(query.key) }
          })
        )
      ])
    );

    const query = this.selected;
    if (!query) {
      this.main.replaceChildren(h('p', { className: 'info', text: 'Nessuna interrogazione disponibile.' }));
      return;
    }
    this.main.replaceChildren(
      h('h3', { text: query.label }),
      ...(query.description ? [h('p', { className: 'info', text: query.description })] : []),
      ...(query.fields.length ? [this.form(query)] : []),
      h('div', { className: 'result' })
    );
  }

  /** The fields of `query` and "Esegui" (runs again with the values typed); only for a query with fields. */
  private form(query: QueryInfo): HTMLFormElement {
    const form = h('form', {
      on: {
        submit: (event) => {
          event.preventDefault();
          void this.run();
        }
      }
    });
    form.append(...query.fields.map((field) => this.input(field)), h('button', { text: 'Esegui', attrs: { type: 'submit' } }));
    return form;
  }

  private input(field: Field): HTMLElement {
    const set = (value: unknown): void => {
      this.values[field.name] = value;
    };
    const current = this.values[field.name];
    let control: HTMLInputElement | HTMLSelectElement;
    if (field.type === 'select') {
      control = h('select', { on: { change: (event) => set((event.target as HTMLSelectElement).value) } });
      for (const choice of field.choices) {
        const option = h('option', { text: choice.label, attrs: { value: choice.value } });
        option.selected = choice.value === current;
        control.append(option);
      }
    } else if (field.type === 'bool') {
      control = h('input', { attrs: { type: 'checkbox' }, on: { change: (event) => set((event.target as HTMLInputElement).checked) } });
      control.checked = current === true;
    } else {
      const type = field.type === 'number' ? 'number' : 'text';
      control = h('input', {
        attrs: { type },
        on: {
          input: (event) => {
            const raw = (event.target as HTMLInputElement).value;
            set(type === 'number' && raw !== '' ? Number(raw) : raw);
          }
        }
      });
      control.value = current === undefined || current === null ? '' : String(current);
      if (field.required) control.required = true;
    }
    control.name = field.name;
    if (field.help) control.title = field.help;
    return h('label', {}, field.label + (field.required ? ' *' : ''), control);
  }
}
