import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { SoupKeyValue } from '../src/elements/soup-keyvalue';
import { SoupTable } from '../src/elements/soup-table';

beforeAll(() => {
  if (!customElements.get('soup-keyvalue')) customElements.define('soup-keyvalue', SoupKeyValue);
  if (!customElements.get('soup-table')) customElements.define('soup-table', SoupTable);
});

afterEach(() => document.body.replaceChildren());

const ITEMS = { items: [{ key: 'Eventi', value: 42 }, { key: 'Primo evento', value: '2021-05-01T09:05:00' }] };

describe('<soup-keyvalue>', () => {
  it('draws a list of pairs by default', () => {
    const element = document.createElement('soup-keyvalue') as SoupKeyValue;
    element.data = ITEMS;
    document.body.append(element);
    expect([...element.shadowRoot!.querySelectorAll('dl > dt')].map((item) => item.textContent)).toEqual(['Eventi', 'Primo evento']);
    expect(element.shadowRoot!.querySelector('.tiles')).toBeNull();
  });

  it('variant="tiles" draws every pair as a stat tile, a long value smaller', () => {
    const element = document.createElement('soup-keyvalue') as SoupKeyValue;
    element.setAttribute('variant', 'tiles');
    element.data = ITEMS;
    document.body.append(element);
    const tiles = [...element.shadowRoot!.querySelectorAll('.tiles > .tile')];
    expect(tiles.map((tile) => [tile.querySelector('dt')!.textContent, tile.querySelector('dd')!.textContent])).toEqual([
      ['Eventi', '42'],
      ['Primo evento', '2021-05-01T09:05:00']
    ]);
    expect(tiles.map((tile) => tile.querySelector('dd')!.className)).toEqual(['', 'long']);

    // The attribute changed later redraws.
    element.removeAttribute('variant');
    expect(element.shadowRoot!.querySelector('.tiles')).toBeNull();
  });
});

describe('<soup-table> cells', () => {
  it('aligns the numbers to the right and sorts from the keyboard', async () => {
    const table = document.createElement('soup-table') as SoupTable;
    table.data = { columns: ['attività', 'eventi'], rows: [['Ship', 2], ['Create', 10]] };
    document.body.append(table);
    const first = table.shadowRoot!.querySelector('tbody tr')!;
    expect([...first.children].map((cell) => cell.classList.contains('num'))).toEqual([false, true]);

    const header = table.shadowRoot!.querySelectorAll('th')[1] as HTMLElement;
    expect(header.getAttribute('tabindex')).toBe('0');
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((done) => setTimeout(done, 0));
    expect(table.shadowRoot!.querySelectorAll('th')[1].getAttribute('aria-sort')).toBe('ascending');
  });
});
