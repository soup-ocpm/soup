import {
  Block,
  ConfigContext,
  defineSoupElement,
  errorMessage,
  h,
  SoupConfigElement,
  SoupVisualizerElement,
  TabularChange,
  TabularTable,
  VisualizerContext
} from '@soup/sdk';
import { inspect } from './api';
import { DEFAULTS, Source, tableState, TableState, TYPES, Workflow } from './workflow';

const STYLE = `
  :host { display: block; min-width: 0; font: inherit; color: inherit; }
  section { margin: 12px 0; } label { display: block; margin: 6px 0; }
  select { padding: 6px; max-width: 100%; } .grid { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .hint { opacity: .75; } .error { color: #b42318; white-space: pre-line; }
  .grid > * { min-width: 0; max-width: 100%; } input[type=file] { max-width: 100%; }
  progress { width: 100%; } h3 { font-size: 1rem; margin: 8px 0; }
`;

const PHASE_LABELS: Record<string, string> = {
  csv_preparation: 'CSV preparation', database_creation: 'Database creation',
  database_validation: 'Database validation', query_validation: 'Query validation',
  index: 'Indexes', http_transfer: 'HTTP serving (included in loading)',
  event: 'Events', entity: 'Entities', corr: 'CORR', df: 'DF', commit: 'Commit', total: 'Total construction'
};

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

class OcedConfig extends HTMLElement implements SoupConfigElement {
  public context!: ConfigContext;
  private readonly root = this.attachShadow({ mode: 'open' });
  private readonly workflow = new Workflow();
  private review: Block[] = [];
  private generation = 0;
  private busy = false;
  private message = '';
  private failed = false;

  public connectedCallback(): void {
    if (!this.context.tabular) {
      const message = 'Update SOUP to use the shared tabular import editor.';
      this.root.textContent = message;
      this.context.emit({ config_error: message });
      return;
    }
    const source = this.context.fields.find((field) => field.name === 'source')?.default as Source | undefined;
    if (source) this.workflow.add(tableState(source));
    this.changed();
  }

  private changed(): void {
    this.generation++;
    this.review = [];
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
    this.publishTables();
    const fields = h('fieldset');
    fields.style.cssText = 'border:0;padding:0;margin:0';
    fields.disabled = this.busy;
    const event = this.workflow.eventTable();
    if (event) {
      const objects = h('section', {}, h('h3', { text: 'Object tables (optional)' }));
      for (const column of this.workflow.mappings.keys()) objects.append(this.objectMapping(column));
      fields.append(objects);
    }
    this.root.replaceChildren(
      h('style', { text: STYLE }),
      h('p', {
        className: 'hint',
        text: 'Click a preview header to configure its role and data type. Object tables may be uploaded or generated. Review the tables, then use SOUP’s Import action.'
      }),
      fields,
      h('p', {
        className: this.failed ? 'error' : 'hint',
        attrs: { role: this.failed ? 'alert' : 'status' },
        text: this.message
      })
    );
    if (this.busy) this.root.append(h('progress', { attrs: { 'aria-label': this.message } }));
  }

  private publishTables(): void {
    const event = this.workflow.eventTable();
    const labels: Record<string, string> = {
      event_id: 'Event ID', event_activity: 'Activity', event_timestamp: 'Timestamp'
    };
    const tables: TabularTable[] = this.workflow.tables.map((table) => {
      const mappings = [...this.workflow.mappings].filter(([, mapping]) => mapping.table === table.source.filename);
      const roles = table === event
        ? [...Object.keys(DEFAULTS).map((key) => ({ key, label: labels[key] })), { key: 'object', label: 'Object reference' }]
        : mappings.map(([column]) => ({ key: `id:${column}`, label: `ID (${column})` }));
      return {
        id: table.source.filename, label: table.source.filename, rows: table.source.rows,
        propertiesEditable: true, types: [...TYPES], roles: [{ key: '__property', label: 'Property' }, ...roles, { key: '__ignore', label: 'Ignore' }],
        columns: table.source.columns.map((name) => ({
          name, property: table.keep.has(name), type: table.types[name],
          disabledRoles: [],
          roles: !table.keep.has(name) ? ['__ignore'] : table === event
            ? [...Object.keys(DEFAULTS).filter((key) => this.workflow.roles[key] === name),
              ...(this.workflow.mappings.has(name) ? ['object'] : [])].concat(Object.values(this.workflow.roles).includes(name) || this.workflow.mappings.has(name) ? [] : ['__property'])
            : [mappings.find(([, mapping]) => mapping.id === name)?.[0]].map((column) => column ? `id:${column}` : '__property')
        }))
      };
    });
    for (const block of this.review) {
      if (block.type !== 'table') continue;
      tables.push({
        id: `review:${block.title}`, label: block.title ?? 'Prepared table', readOnly: true,
        columns: block.data.columns.map((name) => ({ name, property: true })), rows: block.data.rows
      });
    }
    this.context.tabular?.({ tables, disabled: this.busy, onChange: (change) => this.columnChanged(change) });
  }

  private columnChanged(change: TabularChange): void {
    const table = this.workflow.tables.find((item) => item.source.filename === change.table);
    if (!table || this.busy) return;
    if (change.kind === 'property') {
      if (change.value) table.keep.add(change.column);
      else table.keep.delete(change.column);
    } else if (change.kind === 'type') {
      table.types[change.column] = String(change.value);
    } else {
      this.roleChanged(table, change);
    }
    this.changed();
  }

  // eslint-disable-next-line complexity -- Update inclusion and exclusive role mappings atomically.
  private roleChanged(table: TableState, change: TabularChange): void {
    const role = String(change.role);
    if (role === '__ignore') table.keep.delete(change.column);
    else table.keep.add(change.column);
    if (table === this.workflow.eventTable()) {
      for (const key of Object.keys(DEFAULTS)) {
        if (this.workflow.roles[key] === change.column) this.workflow.roles[key] = '';
      }
      if (role !== 'object') this.workflow.mappings.delete(change.column);
      if (role === 'object' && !this.workflow.mappings.has(change.column)) this.workflow.selectObject(change.column, true);
      if (role in DEFAULTS) {
        this.workflow.roles[role] = change.column;
        if (role === 'event_timestamp') table.types[change.column] = 'Datetime';
      }
    } else {
      for (const mapping of this.workflow.mappings.values()) {
        if (mapping.table === table.source.filename && mapping.id === change.column) mapping.id = '';
      }
      const mapping = role.startsWith('id:') ? this.workflow.mappings.get(role.slice(3)) : undefined;
      if (mapping) {
        mapping.id = change.column;
        table.types[change.column] = 'String';
      }
    }
  }

  private objectMapping(column: string): HTMLElement {
    const row = h('div', { className: 'grid' }, h('strong', { text: column }));
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

  private reviewOptions(): void {
    this.message = 'Ready to import into a dedicated Neo4j database. Queries commit separately to limit memory use; live phase progress appears in the backend logs.';
    this.context.emit(this.workflow.options());
  }

  private async preview(): Promise<void> {
    const generation = ++this.generation;
    this.busy = true;
    this.message = 'Validating mappings and preparing object tables…';
    this.context.emit({ ...this.workflow.options(), config_error: this.message });
    this.render();
    try {
      const review = await this.context.preview(this.workflow.options());
      if (generation !== this.generation) return;
      this.review = review;
      this.reviewOptions();
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
    const incomplete = String(this.data['import_status'] ?? 'complete') !== 'complete';
    const counts = this.data['counts'] as { events?: number; entities?: Record<string, number> } | undefined;
    const times = (this.data['process_info'] as { duration_seconds?: Record<string, number> } | undefined)?.duration_seconds ?? {};
    this.replaceChildren(
      h('p', { text: `Neo4j database: ${String(this.data['neo4j_database'] ?? 'No dataset database mapping')}` }),
      ...(incomplete
        ? [h('p', { attrs: { role: 'alert' }, text: 'This import did not complete. Earlier steps may remain committed. Review the phase timings, then explicitly delete this dataset through the workspace before retrying.' })]
        : [h('p', { text: `${counts?.events ?? 0} events imported into Neo4j.` })]),
      ...Object.entries(times).map(([phase, seconds]) => h('p', { text: `${PHASE_LABELS[phase] ?? phase} time: ${seconds.toFixed(3)} s` })),
      ...Object.entries(counts?.entities ?? {}).map(([type, count]) => h('p', { text: `${type}: ${count} objects` }))
    );
  }
}

defineSoupElement('soup-oced-importer-config', OcedConfig);
defineSoupElement('soup-oced-importer-summary', OcedSummary);
