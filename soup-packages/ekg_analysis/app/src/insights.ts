/**
 * <soup-pkg-ekg-insights>: the "Indicatori di processo" visualizer of
 * "ekg" objects - what the old filter dialogs and the graph page computed
 * before choosing a filter. A select chooses the entity type (action
 * "entity"): the average duration of its traces (<soup-keyvalue>), the
 * occurrences of its activities (<soup-table> and a bar <soup-chart>) and
 * its variants with their average duration (<soup-table>). A threshold
 * recomputes the frequency of the activities (action "frequency"). The
 * notice of the object (e.g. an analysis that changed nothing) is shown
 * above.
 */

import { errorMessage, h, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

import { card, CARDS_CSS, NOTICE_CSS, noticeBox } from './dom';
import { ChartData, SoupChartElement, SoupKeyValueElement, SoupTableElement, TableData } from './soup-base';

export interface Average {
  average_seconds: number;
  formatted: string;
  count: number;
}

export interface Indicators {
  entity: string;
  duration: Average | null;
  activities: { activity: string; occurrences: number }[];
  variants: { variant: string[]; occurrences: number; average_seconds: number | null; formatted: string | null }[];
}

export interface Frequency {
  activity: string;
  frequency: number;
}

export interface InsightsData {
  entity_types: string[];
  frequency: Frequency[];
  indicators: Indicators | null;
  notice?: string | null;
}

const CSS = `
  :host { display: block; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 0.95rem; }
  .bar { display: flex; flex-wrap: wrap; gap: var(--soup-space-3, 12px); align-items: center; margin-bottom: var(--soup-space-3, 12px); }
  .bar label { display: inline-flex; gap: var(--soup-space-1, 4px); align-items: center; }
  input[type='number'] { width: 6em; }
  select, input, button { font: inherit; }
  select, input[type='number'] { padding: 2px 6px; border: 1px solid #adb5bd; border-radius: var(--soup-radius-sm, 4px); background: #fff; }
  :focus-visible { outline: 2px solid var(--soup-focus, #0b5ed7); outline-offset: 2px; }
`;

function table(data: TableData): SoupTableElement {
  const element = document.createElement('soup-table') as SoupTableElement;
  element.data = data;
  return element;
}

function chart(data: ChartData): SoupChartElement {
  const element = document.createElement('soup-chart') as SoupChartElement;
  element.data = data;
  return element;
}

export class SoupPkgEkgInsights extends HTMLElement implements SoupVisualizerElement<InsightsData> {
  public data!: InsightsData;
  public context!: VisualizerContext;

  public entity = '';
  public minimum = 1;
  public indicators: Indicators | null = null;
  public frequency: Frequency[] = [];

  private readonly root = this.attachShadow({ mode: 'open' });
  private entitySection: HTMLElement | null = null;
  private frequencySection: HTMLElement | null = null;
  private request = 0;

  public connectedCallback(): void {
    if (this.entitySection) return;
    this.indicators = this.data.indicators;
    this.entity = this.indicators?.entity ?? this.data.entity_types[0] ?? '';
    this.frequency = [...this.data.frequency];
    this.entitySection = h('section');
    this.frequencySection = h('section');
    this.root.replaceChildren(
      h('style', { text: CSS + CARDS_CSS + NOTICE_CSS }),
      ...noticeBox(this.data.notice),
      this.entitySection,
      this.frequencySection
    );
    this.drawEntity();
    this.drawFrequency();
  }

  /** The indicators of another entity type (action "entity"). */
  public async chooseEntity(entity: string): Promise<void> {
    this.entity = entity;
    const request = ++this.request;
    try {
      const result = await this.context.action<Indicators>('entity', { entity });
      if (request !== this.request) return;
      this.indicators = result;
    } catch (error) {
      this.context.notify(errorMessage(error), 'error');
    }
    this.drawEntity();
  }

  /** The activities with at least `minimum` events (action "frequency"). */
  public async setMinimum(minimum: number): Promise<void> {
    if (!Number.isFinite(minimum)) return;
    this.minimum = Math.max(Math.trunc(minimum), 1);
    try {
      const result = await this.context.action<{ min: number; frequency: Frequency[] }>('frequency', { min: this.minimum });
      this.minimum = result.min;
      this.frequency = result.frequency;
    } catch (error) {
      this.context.notify(errorMessage(error), 'error');
    }
    this.drawFrequency();
  }

  private drawEntity(): void {
    if (!this.entitySection) return;
    if (!this.data.entity_types.length) {
      this.entitySection.replaceChildren(h('p', { className: 'info', text: 'Il grafo non ha tipi di entità.' }));
      return;
    }
    const parts: (Node | string)[] = [h('div', { className: 'bar' }, h('label', {}, 'Tipo di entità', this.entitySelect()))];
    const indicators = this.indicators;
    if (indicators && indicators.entity === this.entity) parts.push(...indicatorParts(indicators));
    this.entitySection.replaceChildren(...parts);
  }

  /** The select of the entity types, the current one selected. */
  private entitySelect(): HTMLSelectElement {
    const select = h('select', {
      attrs: { 'aria-label': 'Tipo di entità' },
      on: { change: (event) => void this.chooseEntity((event.target as HTMLSelectElement).value) }
    });
    for (const name of this.data.entity_types) {
      const option = h('option', { text: name, attrs: { value: name } });
      option.selected = name === this.entity;
      select.append(option);
    }
    return select;
  }

  private drawFrequency(): void {
    if (!this.frequencySection) return;
    const minimum = h('input', {
      attrs: { type: 'number', min: '1', 'aria-label': 'Occorrenze minime' },
      on: { change: (event) => void this.setMinimum(Number((event.target as HTMLInputElement).value)) }
    });
    minimum.value = String(this.minimum);
    const frequency = card(
      'Frequenza delle attività',
      h('div', { className: 'bar' }, h('label', {}, 'Almeno', minimum, 'eventi')),
      this.frequency.length
        ? table({ columns: ['attività', 'eventi'], rows: this.frequency.map((item) => [item.activity, item.frequency]) })
        : h('p', { className: 'info', text: 'Nessuna attività con questa frequenza.' })
    );
    frequency.classList.add('wide');
    this.frequencySection.replaceChildren(h('div', { className: 'cards' }, frequency));
  }
}

/** The indicators of one entity type: the summary, the activities and the variants. */
function indicatorParts(indicators: Indicators): Node[] {
  // The main numbers, as stat tiles at the top
  const summary = document.createElement('soup-keyvalue') as SoupKeyValueElement;
  summary.setAttribute('variant', 'tiles');
  summary.data = {
    items: [
      { key: 'Durata media delle tracce', value: indicators.duration?.formatted ?? '—' },
      { key: 'Durata media (secondi)', value: indicators.duration?.average_seconds ?? '—' },
      { key: 'Tracce con una durata', value: indicators.duration?.count ?? 0 },
      { key: 'Varianti', value: indicators.variants.length }
    ]
  };
  const variants = card(
    'Varianti',
    table({
      columns: ['variante', 'occorrenze', 'durata media', 'secondi'],
      rows: indicators.variants.map((item) => [item.variant.join(' → '), item.occurrences, item.formatted ?? '—', item.average_seconds ?? '—'])
    })
  );
  variants.classList.add('wide');
  return [
    summary,
    h(
      'div',
      { className: 'cards' },
      card(
        'Occorrenze delle attività',
        chart({
          chart: 'bar',
          labels: indicators.activities.map((item) => item.activity),
          datasets: [{ label: 'occorrenze', data: indicators.activities.map((item) => item.occurrences) }]
        })
      ),
      card('Attività', table({ columns: ['attività', 'occorrenze'], rows: indicators.activities.map((item) => [item.activity, item.occurrences]) })),
      variants
    )
  ];
}
