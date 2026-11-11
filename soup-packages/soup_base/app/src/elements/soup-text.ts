import { h } from '@soup/sdk';
import { BlockElement } from '../dom';

interface TextData {
  text: string;
}

const CSS = `
  .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; }
  pre { margin: 0; padding: 8px; max-height: 480px; overflow: auto; background: #f6f8fa; border-radius: 6px;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.85rem;
        white-space: pre-wrap; word-break: break-word; }
  .line { display: block; }
  .number { display: inline-block; min-width: 3em; padding-right: 8px; color: #8c959f; text-align: right; user-select: none; }
  mark { background: #ffe58f; }
`;

/** The text of a line with <mark> around every match of `query` (lowercase). */
function highlight(line: string, query: string): (Node | string)[] {
  if (!query) return [line];
  const parts: (Node | string)[] = [];
  const lower = line.toLowerCase();
  let start = 0;
  for (let found = lower.indexOf(query); found !== -1; found = lower.indexOf(query, start)) {
    parts.push(line.slice(start, found), h('mark', { text: line.slice(found, found + query.length) }));
    start = found + query.length;
  }
  parts.push(line.slice(start));
  return parts;
}

/**
 * <soup-text>: monospace text that wraps, with optional line numbers
 * (attribute `line-numbers`) and a search that highlights the matches.
 * `data`: {text}, or set the `text` property.
 */
export class SoupText extends BlockElement<TextData> {
  public static readonly observedAttributes = ['line-numbers'];

  private query = '';

  public get text(): string {
    return this.data?.text ?? '';
  }

  public set text(value: string) {
    this.data = { text: value };
  }

  public attributeChangedCallback(): void {
    if (this.isConnected) this.redraw();
  }

  /** The number of matches of the current search. */
  public get matchCount(): number {
    return this.root.querySelectorAll('mark').length;
  }

  public search(query: string): void {
    this.query = query;
    this.drawText();
  }

  protected override css(): string {
    return CSS;
  }

  protected draw(): Node[] {
    const input = h('input', {
      attrs: { type: 'search', placeholder: 'Search in text', 'aria-label': 'Search in text' },
      on: { input: (event) => this.search((event.target as HTMLInputElement).value) }
    });
    input.value = this.query;
    return [h('div', { className: 'toolbar' }, input, h('span', { className: 'muted count' })), h('pre')];
  }

  protected override redraw(): void {
    super.redraw();
    this.drawText();
  }

  private drawText(): void {
    const pre = this.root.querySelector('pre');
    const count = this.root.querySelector('.count');
    if (!pre || !count) return;
    const numbers = this.hasAttribute('line-numbers');
    const query = this.query.toLowerCase();
    pre.replaceChildren(
      ...this.text.split('\n').map((line, index) => {
        const row = h('span', { className: 'line' });
        if (numbers) row.append(h('span', { className: 'number', text: String(index + 1) }));
        // Each line is a block: an empty one keeps its height with a space.
        row.append(...(line ? highlight(line, query) : [' ']));
        return row;
      })
    );
    count.textContent = query ? `${this.matchCount} results` : '';
  }
}
