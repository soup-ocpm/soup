/**
 * <soup-pkg-text-viewer>: the visualizer of "text" objects. Shows the file
 * with <soup-text> (line numbers, search in the loaded lines) or, for a
 * markdown file, with <soup-markdown>; both come from soup_base. A long
 * file arrives in blocks: "Carica altre righe" asks the next one with
 * context.action('lines', {from, count}). "Cerca nel file" searches the
 * whole file on the server (action 'search'); choosing a result loads the
 * lines up to it and highlights the query.
 */

import { errorMessage, h, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

import { formatSize } from './dom';
import { SoupMarkdownElement, SoupTextElement } from './soup-base';

export interface TextViewerData {
  filename: string;
  format: 'text' | 'markdown';
  encoding: string;
  size: number;
  total_lines: number;
  /** Lines per block. */
  chunk: number;
  /** The first block of lines. */
  lines: string[];
  /** The whole text of a markdown file small enough to be rendered. */
  markdown?: string;
}

export interface LinesBlock {
  from: number;
  lines: string[];
  total: number;
}

export interface SearchResult {
  matches: { line: number; text: string }[];
  total: number;
}

const CSS = `
  :host { display: block; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 0.95rem; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  h3 { margin: 0; font-size: 1rem; }
  .info, .loaded { color: #6c757d; font-size: 0.875rem; }
  .more { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .search { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
  .results { list-style: none; margin: 6px 0 0; padding: 0; max-height: 220px; overflow: auto; font-size: 0.875rem; }
  .results li { display: flex; gap: 8px; padding: 2px 0; }
  .results .text { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
  button, input { font: inherit; }
  button { cursor: pointer; padding: 2px 10px; border: 1px solid #adb5bd; border-radius: 4px; background: #fff; }
  input[type='search'] { padding: 2px 6px; border: 1px solid #adb5bd; border-radius: 4px; }
`;

const EMPTY: TextViewerData = { filename: '', format: 'text', encoding: '', size: 0, total_lines: 0, chunk: 500, lines: [] };

/** Bars of the line lengths, built only from numbers. */
function thumbnailFor(lines: readonly string[]): string {
  const bars = lines
    .slice(0, 12)
    .map((line, index) => {
      const width = Math.max(4, Math.min(100, line.length * 2));
      return `<rect x="10" y="${10 + index * 8}" width="${width}" height="5" rx="2" fill="#6c8ebf"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="#ffffff"/>${bars}</svg>`;
}

export class SoupPkgTextViewer extends HTMLElement implements SoupVisualizerElement<TextViewerData> {
  public data: TextViewerData = EMPTY;
  public context!: VisualizerContext;

  /** The lines loaded so far (the first ones of the file). */
  public lines: string[] = [];
  public total = 0;

  private readonly root = this.attachShadow({ mode: 'open' });
  private textElement: SoupTextElement | null = null;
  private moreButton: HTMLButtonElement | null = null;
  private loadedNote: HTMLElement | null = null;
  private results: HTMLUListElement | null = null;
  private resultsNote: HTMLElement | null = null;
  private rendered = false;

  public connectedCallback(): void {
    if (this.rendered) return;
    this.rendered = true;
    this.lines = [...(this.data.lines ?? [])];
    this.total = this.data.total_lines ?? this.lines.length;
    this.render();
    this.context?.setThumbnail(thumbnailFor(this.lines));
  }

  /** Load the next block of lines. */
  public async loadMore(): Promise<void> {
    await this.loadLines(this.lines.length, this.data.chunk || 500);
  }

  /** Search the whole file on the server and list the matching lines. */
  public async searchFile(query: string): Promise<void> {
    if (!this.results || !this.resultsNote) return;
    if (!query.trim()) {
      this.results.replaceChildren();
      this.resultsNote.textContent = '';
      return;
    }
    try {
      const result = await this.context.action<SearchResult>('search', { query });
      this.results.replaceChildren(
        ...result.matches.map((match) =>
          h(
            'li',
            {},
            h('button', {
              text: `line ${match.line}`,
              attrs: { type: 'button' },
              on: { click: () => void this.reveal(match.line, query) }
            }),
            h('span', { className: 'text', text: match.text })
          )
        )
      );
      const shown = result.matches.length;
      this.resultsNote.textContent =
        result.total > shown ? `${result.total} lines found (showing ${shown})` : `${result.total} lines found`;
    } catch (error) {
      this.context.notify(errorMessage(error), 'error');
    }
  }

  /** Load the lines up to `line` (1-based) and highlight `query` in the text. */
  public async reveal(line: number, query: string): Promise<void> {
    if (line > this.lines.length) await this.loadLines(this.lines.length, line - this.lines.length);
    this.textElement?.search(query);
  }

  private async loadLines(from: number, count: number): Promise<void> {
    try {
      const block = await this.context.action<LinesBlock>('lines', { from, count });
      // Ignore a block that no longer follows the loaded lines.
      if (block.from !== this.lines.length) return;
      this.lines.push(...block.lines);
      this.total = block.total;
      if (this.textElement) this.textElement.text = this.lines.join('\n');
      this.updateMore();
    } catch (error) {
      this.context.notify(errorMessage(error), 'error');
    }
  }

  private render(): void {
    const name = this.data.filename || this.context?.object.name || '';
    const info = [`${this.total} lines`, formatSize(this.data.size ?? 0), this.data.encoding].filter(Boolean).join(' · ');
    const header = h('header', {}, h('h3', { text: name }), h('span', { className: 'info', text: info }));

    let body: HTMLElement;
    let more: HTMLElement | null = null;
    if (typeof this.data.markdown === 'string') {
      const markdown = document.createElement('soup-markdown') as SoupMarkdownElement;
      markdown.data = { markdown: this.data.markdown };
      body = markdown;
    } else {
      const text = document.createElement('soup-text') as SoupTextElement;
      text.setAttribute('line-numbers', '');
      text.text = this.lines.join('\n');
      this.textElement = text;
      body = text;
      this.moreButton = h('button', {
        className: 'load-more',
        text: 'Load more lines',
        attrs: { type: 'button' },
        on: { click: () => void this.loadMore() }
      });
      this.loadedNote = h('span', { className: 'loaded' });
      more = h('div', { className: 'more' }, this.moreButton, this.loadedNote);
    }

    const input = h('input', { attrs: { type: 'search', placeholder: 'Search in file', 'aria-label': 'Search in file' } });
    const searchButton = h('button', {
      className: 'search-file',
      text: 'Search in file',
      attrs: { type: 'button' },
      on: { click: () => void this.searchFile(input.value) }
    });
    input.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Enter') void this.searchFile(input.value);
    });
    this.resultsNote = h('span', { className: 'info results-note' });
    this.results = h('ul', { className: 'results' });
    const search = h('div', { className: 'search' }, input, searchButton, this.resultsNote);

    const style = h('style', { text: CSS });
    this.root.replaceChildren(style, header, body, ...(more ? [more] : []), search, this.results);
    this.updateMore();
  }

  private updateMore(): void {
    if (!this.moreButton || !this.loadedNote) return;
    const complete = this.lines.length >= this.total;
    this.moreButton.hidden = complete;
    this.loadedNote.textContent = complete ? '' : `${this.lines.length} of ${this.total} lines loaded`;
  }
}
