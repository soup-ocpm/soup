/**
 * <soup-pkg-csv-profile>: the "Profilo colonne" visualizer of "table"
 * objects. A <soup-table> lists, for every column, the distinct values,
 * the empty cells and some examples; a <soup-chart> (both from soup_base)
 * shows the distribution of the column chosen in the list, asked with
 * context.action('distribution', {column, top}).
 */

import { errorMessage, h, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

import { ChartData, SoupChartElement, SoupTableElement } from './soup-base';

interface ColumnProfile {
  name: string;
  distinct: number;
  empty: number;
  examples: string[];
}

interface ProfileData {
  rows: number;
  columns: ColumnProfile[];
}

export interface Distribution {
  column: string;
  labels: string[];
  counts: number[];
  other: number;
  total: number;
}

const TOP_VALUES = 20;
const OTHER_LABEL = '(altri)';

const CSS = `
  :host { display: block; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 0.95rem; }
  :focus-visible { outline: 2px solid var(--soup-focus, #0b5ed7); outline-offset: 2px; }
  h4 { margin: 16px 0 6px; font-size: 0.95rem; }
  .info { color: var(--soup-text-muted, #5c636a); font-size: 0.875rem; }
  .choose { display: flex; gap: 8px; align-items: center; margin: 16px 0 6px; }
  select { font: inherit; padding: 2px 6px; border: 1px solid #adb5bd; border-radius: 4px; }
`;

/** The chart of a distribution, the other values as one bar. */
export function chartOf(distribution: Distribution): ChartData {
  const labels = [...distribution.labels];
  const counts = [...distribution.counts];
  if (distribution.other > 0) {
    labels.push(OTHER_LABEL);
    counts.push(distribution.other);
  }
  return { chart: 'bar', labels, datasets: [{ label: distribution.column, data: counts }] };
}

export class SoupPkgCsvProfile extends HTMLElement implements SoupVisualizerElement<ProfileData> {
  public data: ProfileData = { rows: 0, columns: [] };
  public context!: VisualizerContext;
  public chart: SoupChartElement | null = null;
  public selected = -1;

  private readonly root = this.attachShadow({ mode: 'open' });
  private request = 0;

  public connectedCallback(): void {
    if (this.chart) return;
    this.render();
    if (this.data.columns.length) void this.showDistribution(0);
  }

  /** Ask the distribution of column `index` and draw it. */
  public async showDistribution(index: number): Promise<void> {
    this.selected = index;
    const request = ++this.request;
    try {
      const distribution = await this.context.action<Distribution>('distribution', { column: index, top: TOP_VALUES });
      if (request !== this.request || !this.chart) return;
      this.chart.data = chartOf(distribution);
    } catch (error) {
      this.context.notify(errorMessage(error), 'error');
    }
  }

  private render(): void {
    const info = h('span', { className: 'info', text: `${this.data.rows} righe · ${this.data.columns.length} colonne` });

    const table = document.createElement('soup-table') as SoupTableElement;
    table.data = {
      columns: ['colonna', 'valori distinti', 'celle vuote', 'esempi'],
      rows: this.data.columns.map((column) => [column.name, column.distinct, column.empty, column.examples.join(', ')])
    };

    const select = h('select', {
      attrs: { 'aria-label': 'Colonna della distribuzione' },
      on: { change: (event) => void this.showDistribution(Number((event.target as HTMLSelectElement).value)) }
    });
    select.append(...this.data.columns.map((column, index) => h('option', { text: column.name, attrs: { value: String(index) } })));
    const choose = h('label', { className: 'choose' }, 'Distribuzione di', select);

    const chart = document.createElement('soup-chart') as SoupChartElement;
    this.chart = chart;

    this.root.replaceChildren(h('style', { text: CSS }), info, h('h4', { text: 'Colonne' }), table, choose, chart);
  }
}
