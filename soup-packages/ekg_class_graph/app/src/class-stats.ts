/**
 * <soup-pkg-ekg-class-stats>: the "Statistiche del grafo aggregato"
 * visualizer of "ekg_class" objects, like the aggregate part of the old
 * detail page: the counts and the entity types (<soup-keyvalue>) and two
 * pies (<soup-chart>): the composition (createAggregateDataPieChart:
 * Class nodes, OBS, DF_C) and the seconds of the phases of the build
 * (createAggregateProcessPieChart), when meta.process_info has them.
 * Everything is in `data`: no action.
 */

import { h, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

import { card, CARDS_CSS, NOTICE_CSS, noticeBox } from './dom';
import { ChartData, SoupChartElement, SoupKeyValueElement } from './soup-base';

export interface ClassStatsData {
  counts: { class_nodes: number; obs_rel: number; dfc_rel: number };
  entity_types: string[];
  charts: { data: ChartData; process: ChartData | null };
  notice?: string | null;
}

const CSS = `
  :host { display: block; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 0.95rem; }
`;

export class SoupPkgEkgClassStats extends HTMLElement implements SoupVisualizerElement<ClassStatsData> {
  public data!: ClassStatsData;
  public context!: VisualizerContext;

  private readonly root = this.attachShadow({ mode: 'open' });
  private drawn = false;

  public connectedCallback(): void {
    if (this.drawn) return;
    this.drawn = true;
    const { counts } = this.data;

    // The main numbers, as stat tiles at the top
    const summary = document.createElement('soup-keyvalue') as SoupKeyValueElement;
    summary.setAttribute('variant', 'tiles');
    summary.data = {
      items: [
        { key: 'Class nodes', value: counts.class_nodes },
        { key: 'OBSERVED relationships', value: counts.obs_rel },
        { key: 'DF_C relationships', value: counts.dfc_rel },
        { key: 'Entity types', value: this.data.entity_types.join(', ') || '—' }
      ]
    };

    const charts = h('div', { className: 'cards charts' }, this.chart('Aggregate data', this.data.charts.data));
    if (this.data.charts.process) charts.append(this.chart('Build times (seconds)', this.data.charts.process));
    else charts.append(card('Build times', h('p', { className: 'info', text: 'Build times are not available for this graph.' })));

    this.root.replaceChildren(h('style', { text: CSS + CARDS_CSS + NOTICE_CSS }), ...noticeBox(this.data.notice), summary, charts);
  }

  private chart(title: string, data: ChartData): HTMLElement {
    const chart = document.createElement('soup-chart') as SoupChartElement;
    chart.data = data;
    return card(title, chart);
  }
}
