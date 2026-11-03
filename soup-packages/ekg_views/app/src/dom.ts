/**
 * The notice box of the ekg visualizers (h() and errorMessage() come from
 * @soup/sdk). Text coming from data is always set with textContent.
 */

import { h } from '@soup/sdk';

/**
 * The notice of an object (meta.notice, e.g. an analysis that changed
 * nothing), shown above the data: one element, or none.
 */
export function noticeBox(notice: string | null | undefined): HTMLElement[] {
  return notice ? [h('p', { className: 'notice', text: notice, attrs: { role: 'status' } })] : [];
}

/** The notice, as the host's .soup-notice (its design tokens, with fallbacks). */
export const NOTICE_CSS = `
  .notice { margin: 0 0 var(--soup-space-3, 12px); padding: var(--soup-space-2, 8px) var(--soup-space-3, 12px); border-left: 3px solid var(--soup-notice-border, #997404); border-radius: var(--soup-radius-sm, 4px); background: var(--soup-notice-bg, #fff8e1); color: var(--soup-notice-text, #664d03); font-size: 0.9rem; }
`;

/**
 * The bar of the graph visualizers: groups of controls separated by a
 * line, wrapping without overlapping, the summary at the right.
 */
export const GRAPH_BAR_CSS = `
  .bar { display: flex; flex-wrap: wrap; gap: var(--soup-space-2, 8px) var(--soup-space-3, 12px); align-items: center; margin-bottom: var(--soup-space-3, 12px); }
  .bar .group { display: flex; flex-wrap: wrap; gap: var(--soup-space-2, 8px) var(--soup-space-3, 12px); align-items: center; min-width: 0; }
  .bar .group + .group { padding-left: var(--soup-space-3, 12px); border-left: 1px solid var(--soup-border, #d0d7de); }
  .bar label { display: inline-flex; gap: var(--soup-space-1, 4px); align-items: center; white-space: nowrap; }
  .bar .info { margin-left: auto; color: var(--soup-text-muted, #5c636a); font-size: 0.85rem; }
  select, input, button { font: inherit; }
  button { cursor: pointer; padding: 2px 10px; border: 1px solid #adb5bd; border-radius: var(--soup-radius-sm, 4px); background: #fff; color: inherit; }
  button:hover { border-color: var(--soup-primary-strong, #b86e00); }
  button[aria-pressed='true'] { background: var(--soup-primary-soft, #fff4e0); border-color: var(--soup-primary-strong, #b86e00); }
  select, input[type='number'] { padding: 2px 6px; border: 1px solid #adb5bd; border-radius: var(--soup-radius-sm, 4px); background: #fff; }
  :focus-visible { outline: 2px solid var(--soup-focus, #0b5ed7); outline-offset: 2px; }
  details.relations { position: relative; }
  details.relations > summary { cursor: pointer; padding: 2px 8px; border: 1px solid #adb5bd; border-radius: var(--soup-radius-sm, 4px); background: #fff; list-style-position: inside; white-space: nowrap; }
  details.relations > .menu { position: absolute; z-index: 4; top: calc(100% + 4px); left: 0; display: flex; flex-direction: column; gap: 2px; min-width: 160px; max-height: 300px; overflow: auto; padding: var(--soup-space-2, 8px) var(--soup-space-3, 12px); background: #fff; border: 1px solid var(--soup-border, #d0d7de); border-radius: var(--soup-radius-md, 8px); box-shadow: 0 4px 12px rgba(16, 24, 40, 0.1); }
  @media (max-width: 575.98px) {
    .bar .group + .group { padding-left: 0; border-left: 0; }
    .bar .info { margin-left: 0; flex-basis: 100%; }
  }
`;


/**
 * The cards of the visualizers: a grid of cards with a title, each with a
 * chart or a table; .wide takes the whole row.
 */
export const CARDS_CSS = `
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: var(--soup-space-4, 16px); margin: var(--soup-space-4, 16px) 0 0; align-items: start; }
  .card { min-width: 0; padding: var(--soup-space-4, 16px); border: 1px solid var(--soup-border, #d0d7de); border-radius: var(--soup-radius-md, 8px); background: var(--soup-surface, #fff); box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06); }
  .card.wide { grid-column: 1 / -1; }
  .card > h3 { margin: 0 0 var(--soup-space-3, 12px); font-size: 1rem; font-weight: 600; color: var(--soup-text, #212529); }
  .info { color: var(--soup-text-muted, #5c636a); font-size: 0.875rem; margin: 0; }
`;

/** A card with its title and content. */
export function card(title: string, ...content: Node[]): HTMLElement {
  return h('section', { className: 'card' }, h('h3', { text: title }), ...content);
}
