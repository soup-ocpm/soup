/**
 * <soup-pkg-ekg-stats>: the "Statistics" visualizer of "ekg" objects,
 * like the old detail page of a dataset: the counts and the time range
 * (<soup-keyvalue>), the distinct activities, the entity types with the
 * warning of the ones with null values, the columns of the dataset with
 * the role the import gave them (<soup-table>) and two pies
 * (<soup-chart>): the composition of the graph and the times of the build
 * phases (only when meta.process_info has them). Everything is in `data`:
 * no action.
 */

import { h, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

import { card, CARDS_CSS, NOTICE_CSS, noticeBox } from './dom';
import { ChartData, SoupChartElement, SoupKeyValueElement, SoupTableElement } from './soup-base';

export interface EntityStat {
  name: string;
  nan_nodes: number;
  warning: string | null;
}

type ColumnRole = 'event_id' | 'timestamp' | 'activity' | 'entity' | 'value' | '';

export interface DatasetColumn {
  name: string;
  role: ColumnRole;
}

const ROLE_LABELS: Record<ColumnRole, string> = {
  event_id: 'Event ID',
  timestamp: 'timestamp',
  activity: 'Activity',
  entity: 'Entity',
  value: 'Property',
  '': 'Ignored'
};

export interface StatsData {
  construction_seconds?: number | null;
  counts: { event_nodes: number; entity_nodes: number; corr_rel: number; df_rel: number };
  timestamps: { min: string | null; max: string | null };
  activities: string[];
  entities: EntityStat[];
  // Absent for data of an older ekg_views
  columns?: DatasetColumn[];
  charts: { data: ChartData; process: ChartData | null };
  notice?: string | null;
}

const CSS = `
  :host { display: block; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 0.95rem; }
  .warning { margin: 0 0 var(--soup-space-3, 12px); padding: var(--soup-space-2, 8px) var(--soup-space-3, 12px) var(--soup-space-2, 8px) var(--soup-space-6, 32px); border-left: 3px solid var(--soup-notice-border, #997404); border-radius: var(--soup-radius-sm, 4px); background: var(--soup-notice-bg, #fff8e1); color: var(--soup-notice-text, #664d03); font-size: 0.9rem; }
`;

export class SoupPkgEkgStats extends HTMLElement implements SoupVisualizerElement<StatsData> {
  public data!: StatsData;
  public context!: VisualizerContext;

  private readonly root = this.attachShadow({ mode: 'open' });
  private drawn = false;

  public connectedCallback(): void {
    if (this.drawn) return;
    this.drawn = true;
    const { counts, timestamps } = this.data;

    // The main numbers, as stat tiles at the top
    const summary = document.createElement('soup-keyvalue') as SoupKeyValueElement;
    summary.setAttribute('variant', 'tiles');
    summary.data = {
      items: [
        ...(this.data.construction_seconds != null ? [{ key: "Total construction time (seconds)", value: this.data.construction_seconds }] : []),
        { key: 'Event nodes', value: counts.event_nodes },
        { key: 'Entity nodes', value: counts.entity_nodes },
        { key: 'CORR relationships', value: counts.corr_rel },
        { key: 'DF relationships', value: counts.df_rel },
        { key: 'First event', value: timestamps.min ?? '—' },
        { key: 'Last event', value: timestamps.max ?? '—' },
        { key: 'Distinct activities', value: this.data.activities.length }
      ]
    };

    const entities = document.createElement('soup-table') as SoupTableElement;
    entities.data = {
      columns: ['Entity type', 'Events with null values', 'Warning'],
      rows: this.data.entities.map((entity) => [entity.name, entity.nan_nodes, entity.warning ?? ''])
    };
    const warnings = this.data.entities.filter((entity) => entity.warning);
    const warningList = h('ul', { className: 'warning' }, ...warnings.map((entity) => h('li', { text: `${entity.name}: ${entity.warning}` })));

    const activities = document.createElement('soup-table') as SoupTableElement;
    activities.data = { columns: ['Activity'], rows: this.data.activities.map((name) => [name]) };

    const columns = this.data.columns ?? [];
    const columnTable = document.createElement('soup-table') as SoupTableElement;
    columnTable.data = { columns: ['Column', 'Role'], rows: columns.map((column) => [column.name, ROLE_LABELS[column.role] ?? column.role]) };

    const charts = h('div', { className: 'cards charts' }, this.chart('Graph composition', this.data.charts.data));
    if (this.data.charts.process) charts.append(this.chart('Construction times (seconds)', this.data.charts.process));
    else charts.append(card('Construction times', h('p', { className: 'info', text: 'Construction times are unavailable for this older graph.' })));

    const tables = h(
      'div',
      { className: 'cards' },
      card('Entities', ...(warnings.length ? [warningList] : []), entities),
      card('Activity', activities),
      ...(columns.length ? [card('Dataset columns', columnTable)] : [])
    );

    this.root.replaceChildren(h('style', { text: CSS + CARDS_CSS + NOTICE_CSS }), ...noticeBox(this.data.notice), summary, charts, tables);
  }

  private chart(title: string, data: ChartData): HTMLElement {
    const chart = document.createElement('soup-chart') as SoupChartElement;
    chart.data = data;
    return card(title, chart);
  }
}
