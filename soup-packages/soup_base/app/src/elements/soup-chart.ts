import { h } from '@soup/sdk';
import { Chart, ChartType, registerables } from 'chart.js';

import { BlockElement } from '../dom';

Chart.register(...registerables);

interface ChartData {
  chart: 'pie' | 'bar' | 'line';
  labels: string[];
  datasets: { label: string; data: number[] }[];
}

const KINDS: readonly string[] = ['pie', 'bar', 'line'];
const CSS = `.chart { position: relative; height: 320px; } .error { color: #b02a37; }`;

/** <soup-chart>: Chart.js pie, bar or line; `data` = {chart, labels, datasets}. */
export class SoupChart extends BlockElement<ChartData> {
  private chart: Chart | null = null;

  public disconnectedCallback(): void {
    this.destroyChart();
  }

  protected override css(): string {
    return CSS;
  }

  protected draw(data: ChartData | undefined): Node[] {
    this.destroyChart();
    if (!data) return [];
    if (!KINDS.includes(data.chart)) {
      return [h('div', { className: 'error', text: `Unsupported chart type: ${data.chart}` })];
    }
    const canvas = h('canvas');
    // Chart.js measures the canvas: create it once it is in the document.
    queueMicrotask(() => {
      if (!canvas.isConnected) return;
      this.chart = new Chart(canvas, {
        type: data.chart as ChartType,
        data: { labels: data.labels, datasets: data.datasets.map((set) => ({ label: set.label, data: set.data })) },
        options: { responsive: true, maintainAspectRatio: false, animation: false }
      });
    });
    return [h('div', { className: 'chart' }, canvas)];
  }

  private destroyChart(): void {
    this.chart?.destroy();
    this.chart = null;
  }
}
