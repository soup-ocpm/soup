import { h } from '@soup/sdk';
import { BlockElement, display } from '../dom';

interface KeyValueData {
  items: { key: string; value: unknown }[];
}

const CSS = `
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px; margin: 0; }
  dt { font-weight: 600; }
  dd { margin: 0; word-break: break-word; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--soup-space-3, 12px); margin: 0; }
  .tile { display: flex; flex-direction: column-reverse; justify-content: flex-end; gap: 2px; min-width: 0; padding: var(--soup-space-3, 12px); border: 1px solid var(--soup-border, #d0d7de); border-radius: var(--soup-radius-md, 8px); background: var(--soup-surface, #fff); box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06); }
  .tile dt { font-weight: 400; font-size: 0.8rem; color: var(--soup-text-muted, #5c636a); }
  .tile dd { font-size: 1.35rem; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .tile dd.long { font-size: 0.95rem; }
`;

// A value longer than this is drawn smaller in a tile (e.g. a date).
const SHORT_VALUE = 12;

/**
 * <soup-keyvalue>: `data` = {items: [{key, value}]}. Attribute
 * variant="tiles": every pair as a "stat tile" (the value large, the key
 * below it, in a grid), for the main numbers of a page.
 */
export class SoupKeyValue extends BlockElement<KeyValueData> {
  public static readonly observedAttributes = ['variant'];

  public attributeChangedCallback(): void {
    if (this.isConnected) this.redraw();
  }

  protected override css(): string {
    return CSS;
  }

  protected draw(data: KeyValueData | undefined): Node[] {
    if (this.getAttribute('variant') === 'tiles') {
      const tiles = h('dl', { className: 'tiles' });
      for (const item of data?.items ?? []) {
        const value = display(item.value);
        const dd = h('dd', { text: value });
        if (value.length > SHORT_VALUE) dd.className = 'long';
        // The value comes first in the tile, the key reads as its caption (flex column-reverse keeps dt before dd).
        tiles.append(h('div', { className: 'tile' }, h('dt', { text: display(item.key) }), dd));
      }
      return [tiles];
    }
    const list = h('dl');
    for (const item of data?.items ?? []) {
      list.append(h('dt', { text: display(item.key) }), h('dd', { text: display(item.value) }));
    }
    return [list];
  }
}
