import {
  Block,
  ConfigContext,
  defineSoupElement,
  errorMessage,
  h,
  SoupConfigElement,
  SoupVisualizerElement,
  VisualizerContext
} from '@soup/sdk';
import { inspect } from './api';
import { DEFAULTS, Source, tableState, TableState, TYPES, Workflow } from './workflow';

const STYLE = `
  :host { display: block; font: inherit; color: inherit; }
  section, details { margin: 12px 0; } label { display: block; margin: 6px 0; }
  select { padding: 6px; max-width: 100%; } .grid { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #d6dce5; padding: 5px; text-align: left; }
  .scroll { overflow: auto; max-height: 240px; } .hint { opacity: .75; } .error { color: #b42318; }
  progress { width: 100%; } h3 { font-size: 1rem; margin: 8px 0; }
`;

function select(label: string, choices: string[], value: string, change: (value: string) => void): HTMLLabelElement {
  const input = h(
    'select',
    { attrs: { 'aria-label': label } },
    h('option', { text: 'Choose…', attrs: { value: '' } }),
    ...choices.map((item) => h('option', { text: item, attrs: { value: item } }))
  );
  input.value = value;
  input.addEventListener('change', () => change(input.value));
  return h('label', { text: label + ' ' }, input);
}

function previewTable(columns: string[], rows: unknown[][]): HTMLElement {
  return h(
    'div',
    { className: 'scroll' },
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, ...columns.map((column) => h('th', { text: column })))),
      h(
        'tbody',
        {},
        ...rows.slice(0, 10).map((row) => h('tr', {}, ...row.map((value) => h('td', { text: String(value ?? '') }))))
      )
    )
  );
}

class OcedConfig extends HTMLElement implements SoupConfigElement {
  public context!: ConfigContext;
  private readonly root = this.attachShadow({ mode: 'open' });
  private readonly workflow = new Workflow();
  private review: Block[] = [];
  private generation = 0;
  private busy = false;
  private message = '';
  private failed = false;
  private replacementToken = '';
  private replacementConfirmed = false;

  public connectedCallback(): void {
    const source = this.context.fields.find((field) => field.name === 'source')?.default as Source | undefined;
    if (source) this.workflow.add(tableState(source));
    this.changed();
  }

  private changed(): void {
    this.generation++;
    this.review = [];
    this.replacementToken = '';
    this.replacementConfirmed = false;
    this.failed = false;
    this.message = this.workflow.validate();
    this.context.emit({
      ...this.workflow.options(),
      config_error: this.message || 'Preparing object tables; please wait.'
    });
    this.render();
    if (!this.message) void this.preview();
  }

  private render(): void {
    const firstRender = !this.root.childElementCount;
    const opened = new Set(
      [...this.root.querySelectorAll<HTMLDetailsElement>('details[data-table][open]')].map(
        (item) => item.dataset['table']
      )
    );
    const fields = h('fieldset');
    fields.style.cssText = 'border:0;padding:0;margin:0';
    fields.disabled = this.busy;
    const event = this.workflow.eventTable();
    if (event) {
      fields.append(this.roles(event));
      const objects = h('section', {}, h('h3', { text: 'Object-reference columns' }));
      for (const column of event.source.columns.filter((name) => !Object.values(this.workflow.roles).includes(name))) {
        objects.append(this.objectMapping(column));
      }
      fields.append(objects);
      for (const table of this.workflow.tables) {
        fields.append(
          h(
            'details',
            {
              attrs: {
                'data-table': table.source.filename,
                ...(opened.has(table.source.filename) || (firstRender && table === event) ? { open: '' } : {})
              }
            },
            h('summary', { text: `${table.source.filename} — preview and column types` }),
            previewTable(table.source.columns, table.source.rows),
            h('div', { className: 'grid' }, ...table.source.columns.map((column) => this.attribute(table, column)))
          )
        );
      }
    }
    this.root.replaceChildren(
      h('style', { text: STYLE }),
      h('p', {
        className: 'hint',
        text: 'Select object types below. Each may use an uploaded CSV or generated IDs. Review the tables, then use SOUP’s Import action below. Neo4j must be dedicated to this log. Replacing existing data requires explicit confirmation.'
      }),
      fields,
      h('p', {
        className: this.failed ? 'error' : 'hint',
        attrs: { role: this.failed ? 'alert' : 'status' },
        text: this.message
      }),
      h('section', { attrs: { 'data-review': '' } }, ...this.reviewElements()),
      ...this.replacementWarning()
    );
    if (this.busy) this.root.append(h('progress', { attrs: { 'aria-label': this.message } }));
  }

  private roles(event: TableState): HTMLElement {
    const row = h('div', { className: 'grid' });
    const labels: Record<string, string> = {
      event_id: 'Event ID',
      event_activity: 'Activity',
      event_timestamp: 'Timestamp → eventDatetime'
    };
    for (const role of Object.keys(DEFAULTS)) {
      row.append(
        select(labels[role], [...event.keep], this.workflow.roles[role], (value) => {
          this.workflow.roles[role] = value;
          this.workflow.mappings.delete(value);
          if (role === 'event_timestamp') event.types[value] = 'Datetime';
          this.changed();
        })
      );
    }
    return row;
  }

  private objectMapping(column: string): HTMLElement {
    const check = h('input', { attrs: { type: 'checkbox', 'aria-label': `Object type ${column}` } });
    check.checked = this.workflow.mappings.has(column);
    check.addEventListener('change', () => {
      this.workflow.selectObject(column, check.checked);
      this.changed();
    });
    const row = h('div', { className: 'grid' }, h('label', {}, check, ` ${column}`));
    const mapping = this.workflow.mappings.get(column);
    if (!mapping) return row;
    const files = h(
      'select',
      { attrs: { 'aria-label': `Table for ${column}` } },
      h('option', { text: 'Generate IDs from events', attrs: { value: '' } }),
      ...this.workflow
        .objectTables()
        .map((table) => h('option', { text: table.source.filename, attrs: { value: table.source.filename } }))
    );
    files.value = mapping.table;
    files.addEventListener('change', () => {
      this.workflow.mapObject(column, files.value);
      this.changed();
    });
    const upload = h('input', {
      attrs: { type: 'file', accept: '.csv,text/csv', 'aria-label': `Upload CSV for ${column}` }
    });
    upload.addEventListener('change', () => {
      const file = upload.files?.[0];
      if (file) void this.upload(column, file);
    });
    row.append(h('label', { text: 'Object table ' }, files), h('label', { text: 'Upload CSV (optional)' }, upload));
    const table = this.workflow.objectTables().find((item) => item.source.filename === mapping.table);
    if (table)
      row.append(
        select(`ID column for ${column}`, [...table.keep], mapping.id, (value) => {
          mapping.id = value;
          table.types[value] = 'String';
          this.changed();
        })
      );
    return row;
  }

  private attribute(table: TableState, column: string): HTMLElement {
    const keep = h('input', { attrs: { type: 'checkbox', 'aria-label': `Keep ${table.source.filename} ${column}` } });
    keep.checked = table.keep.has(column);
    keep.addEventListener('change', () => {
      if (keep.checked) table.keep.add(column);
      else table.keep.delete(column);
      this.changed();
    });
    return h(
      'div',
      {},
      h('label', {}, keep, ` Keep ${column}`),
      select(`Type ${column}`, [...TYPES], table.types[column], (value) => {
        table.types[column] = value;
        this.changed();
      })
    );
  }

  private reviewElements(): HTMLElement[] {
    return this.review.flatMap((block) =>
      block.type !== 'table'
        ? []
        : [
            h(
              'details',
              { attrs: { open: '' } },
              h('summary', { text: block.title }),
              previewTable(block.data.columns, block.data.rows)
            )
          ]
    );
  }

  private replacementWarning(): HTMLElement[] {
    if (!this.replacementToken) return [];
    const cancel = h('button', { text: 'Cancel', attrs: { type: 'button' } });
    cancel.disabled = this.busy;
    cancel.addEventListener('click', () => {
      this.replacementConfirmed = false;
      this.message = 'Replacement cancelled. No further deletion is authorized.';
      this.context.emit({ ...this.workflow.options(), config_error: this.message });
      this.render();
    });
    const confirm = h('button', {
      text: 'Delete existing dataset to import new one', attrs: { type: 'button' }
    });
    confirm.disabled = this.busy;
    confirm.addEventListener('click', () => { void this.preview(true); });
    return [h('section', { attrs: { role: 'alert' } },
      h('h3', { text: 'Neo4j already contains data' }),
      h('p', { text: 'Replacement irreversibly deletes ALL nodes and relationships in the selected Neo4j database. This cannot be undone, even if the new import fails.' }),
      h('p', { text: 'Choose Cancel to keep the data, or explicitly confirm replacement below. Then use SOUP’s Import action to execute the deletion and import.' }),
      ...(this.replacementConfirmed ? [h('p', { text: 'Replacement confirmed for these CSVs. A failed attempt requires a new confirmation.' })] : []),
      h('div', { className: 'grid' }, cancel, confirm)
    )];
  }

  private async upload(column: string, file: File): Promise<void> {
    if (this.busy) return;
    this.generation++;
    this.busy = true;
    this.message = `Reading ${file.name}…`;
    this.context.emit({ ...this.workflow.options(), upload_pending: true });
    this.render();
    try {
      if (
        file.name === this.workflow.event ||
        [...this.workflow.mappings].some(([other, mapping]) => other !== column && mapping.table === file.name)
      ) {
        throw new Error('Choose a distinct filename to preserve the other table mappings.');
      }
      this.workflow.add(tableState(await inspect(file)), column);
      this.busy = false;
      this.changed();
    } catch (error) {
      this.busy = false;
      this.failed = true;
      this.message = errorMessage(error);
      this.context.emit({ ...this.workflow.options(), config_error: this.message });
      this.render();
    }
  }

  private reviewOptions(confirmReplacement: boolean): void {
    const confirmation = this.review.find((block) => block.title === 'Neo4j replacement confirmation');
    const item = confirmation?.type === 'keyvalue' ? confirmation.data.items[0] : undefined;
    this.replacementToken = String(item?.value ?? '');
    this.replacementConfirmed = Boolean(this.replacementToken && confirmReplacement);
    this.message = this.replacementToken && !this.replacementConfirmed
      ? 'Neo4j contains data. Choose Cancel or explicitly confirm replacement.'
      : 'Ready to import. Object IDs and timestamp mappings validated.';
    this.context.emit({
      ...this.workflow.options(),
      ...(this.replacementConfirmed
        ? { replace_existing: true, replacement_token: this.replacementToken }
        : this.replacementToken ? { config_error: this.message } : {})
    });
  }

  private async preview(confirmReplacement = false): Promise<void> {
    const generation = ++this.generation;
    this.busy = true;
    this.message = 'Validating mappings and preparing object tables…';
    this.replacementConfirmed = false;
    this.context.emit({ ...this.workflow.options(), config_error: this.message });
    this.render();
    try {
      const review = await this.context.preview(this.workflow.options());
      if (generation !== this.generation) return;
      this.review = review;
      this.reviewOptions(confirmReplacement);
    } catch (error) {
      if (generation !== this.generation) return;
      this.failed = true;
      this.message = errorMessage(error);
      this.context.emit({ ...this.workflow.options(), config_error: this.message });
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.render();
      }
    }
  }
}

class OcedSummary extends HTMLElement implements SoupVisualizerElement<Record<string, unknown>> {
  public context!: VisualizerContext;
  public data: Record<string, unknown> = {};
  public connectedCallback(): void {
    const counts = this.data['counts'] as { events?: number; entities?: Record<string, number> } | undefined;
    this.replaceChildren(
      h('p', { text: `${counts?.events ?? 0} events imported into Neo4j.` }),
      ...Object.entries(counts?.entities ?? {}).map(([type, count]) => h('p', { text: `${type}: ${count} objects` }))
    );
  }
}

defineSoupElement('soup-oced-importer-config', OcedConfig);
defineSoupElement('soup-oced-importer-summary', OcedSummary);
