import { Block, h, isValidElementName, ReportData, SoupVisualizerElement, VisualizerContext } from '@soup/sdk';

import { BASE_CSS, json, style } from '../dom';

/** The element drawing each block type of report.py; all are defined by soup_base. */
const BLOCK_ELEMENTS: Readonly<Record<string, string>> = {
  text: 'soup-text',
  markdown: 'soup-markdown',
  image: 'soup-image',
  table: 'soup-table',
  graph: 'soup-graph-view',
  chart: 'soup-chart',
  keyvalue: 'soup-keyvalue',
  file: 'soup-file-link',
  error: 'soup-error'
};

/** Block type -> tag: the ones above and those registered by other packages (registerBlock). */
const blockElements = new Map<string, string>(Object.entries(BLOCK_ELEMENTS));

const CSS = `
  .block { margin-bottom: 16px; }
  .block > h4 { margin: 0 0 6px; font-size: 1rem; }
  .unknown { padding: 8px 12px; border: 1px solid #ffe69c; border-radius: 6px; background: #fff3cd; }
  .unknown pre { margin: 6px 0 0; max-height: 320px; overflow: auto; font-size: 0.8rem; white-space: pre-wrap; }
  .empty { color: #6c757d; }
`;

interface BlockHost extends HTMLElement {
  data: unknown;
  context?: VisualizerContext | null;
}

/**
 * <soup-report-view> - the visualizer of "report" objects: draws
 * data.blocks one under the other with the elements above. A block of an
 * unknown type shows a warning with its data as JSON. The host also uses
 * it (through the visualizers of "report") for the blocks of an import
 * preview, with the same `data`.
 *
 * Other block types are drawn by the elements other packages register,
 * without importing this code (packages share only the SDK): the class is
 * found by tag, customElements.get('soup-report-view').registerBlock(type,
 * tag). The element of tag receives the block's `data` and, if it has a
 * `context` property, the report's context.
 */
export class SoupReportView extends HTMLElement implements SoupVisualizerElement<ReportData> {
  public context!: VisualizerContext;

  /**
   * Draw the blocks of `type` with the element `tag` (defined by the
   * registering package). A built-in type cannot be replaced.
   * @throws Error for an empty type, an invalid tag or a built-in type
   */
  public static registerBlock(type: string, tag: string): void {
    if (!type) throw new Error('A block type cannot be empty');
    if (!isValidElementName(tag)) throw new Error(`Invalid custom element name '${tag}'`);
    if (type in BLOCK_ELEMENTS) throw new Error(`Block type '${type}' is drawn by soup_base and cannot be replaced`);
    blockElements.set(type, tag);
  }

  /** The tag drawing the blocks of `type`, if any. */
  public static blockElement(type: string): string | undefined {
    return blockElements.get(type);
  }

  private readonly root = this.attachShadow({ mode: 'open' });
  private value: ReportData = { blocks: [] };

  public get data(): ReportData {
    return this.value;
  }

  public set data(value: ReportData) {
    this.value = value ?? { blocks: [] };
    if (this.isConnected) this.draw();
  }

  public connectedCallback(): void {
    this.draw();
  }

  private draw(): void {
    const blocks = Array.isArray(this.value.blocks) ? this.value.blocks : [];
    this.root.replaceChildren(
      style(BASE_CSS + CSS),
      ...(blocks.length ? blocks.map((block) => this.block(block)) : [h('p', { className: 'empty', text: 'The report contains no blocks.' })])
    );
  }

  private block(block: Block): HTMLElement {
    const section = h('section', { className: 'block', attrs: { 'data-block': String(block?.type) } });
    if (block?.title) section.append(h('h4', { text: block.title }));
    const tag = blockElements.get(block?.type);
    section.append(tag ? this.blockElement(tag, block) : unknownBlock(block));
    return section;
  }

  private blockElement(tag: string, block: Block): HTMLElement {
    const element = document.createElement(tag) as BlockHost;
    element.data = block.data;
    if (this.context && 'context' in element) element.context = this.context;
    return element;
  }
}

function unknownBlock(block: Block): HTMLElement {
  return h(
    'div',
    { className: 'unknown', attrs: { role: 'note' } },
    `Unknown block type: ${String(block?.type)}`,
    h('pre', { text: json(block?.data ?? block) })
  );
}
