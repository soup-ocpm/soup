/**
 * Frontend of the template package: <soup-template-text>, the visualizer
 * of "template.text" objects. The host sets `data` (what TextVisualizer.data
 * returns) and `context` before attaching the element. Text from the file is
 * always inserted with textContent, never as markup.
 */

import { defineSoupElement, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

interface TextData {
  filename: string;
  total_lines: number;
  lines: string[];
}

interface TextStats {
  lines: number;
  words: number;
  characters: number;
}

const STYLE = `
  :host { display: block; font-family: system-ui, sans-serif; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  h3 { margin: 0; font-size: 1rem; }
  pre { margin: 0; padding: 8px; max-height: 480px; overflow: auto; background: #f6f8fa; border-radius: 6px; }
  .stats { color: #555; font-size: 0.9rem; }
`;

/** A small bar chart of the line lengths; built only from numbers. */
function thumbnailFor(lines: string[]): string {
  const bars = lines
    .slice(0, 12)
    .map((line, index) => {
      const width = Math.max(4, Math.min(100, line.length * 2));
      return `<rect x="10" y="${10 + index * 8}" width="${width}" height="5" rx="2" fill="#4a7bd0"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#ffffff"/>${bars}</svg>`;
}

export class SoupTemplateText extends HTMLElement implements SoupVisualizerElement<TextData> {
  public data: TextData = { filename: '', total_lines: 0, lines: [] };
  public context!: VisualizerContext;

  private readonly root = this.attachShadow({ mode: 'open' });

  public connectedCallback(): void {
    this.render();
    if (this.context) {
      this.context.setThumbnail(thumbnailFor(this.data.lines));
    }
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = STYLE;

    const title = document.createElement('h3');
    title.textContent = `${this.data.filename || this.context?.object.name || ''} - ${this.data.lines.length} / ${this.data.total_lines} lines`;

    const stats = document.createElement('span');
    stats.className = 'stats';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Statistics';
    button.addEventListener('click', () => void this.showStats(stats));

    const header = document.createElement('header');
    header.append(title, button, stats);

    const text = document.createElement('pre');
    text.textContent = this.data.lines.join('\n');

    this.root.replaceChildren(style, header, text);
  }

  private async showStats(target: HTMLElement): Promise<void> {
    try {
      const stats = await this.context.action<TextStats>('stats');
      target.textContent = `${stats.lines} lines, ${stats.words} words, ${stats.characters} characters`;
    } catch (error) {
      this.context.notify(error instanceof Error ? error.message : String(error), 'error');
    }
  }
}

defineSoupElement('soup-template-text', SoupTemplateText);
