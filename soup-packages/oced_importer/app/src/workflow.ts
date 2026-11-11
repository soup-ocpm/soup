import type { FileValue, FormValues } from '@soup/sdk';

export const TYPES = ['String', 'Integer', 'Float', 'Boolean', 'Datetime'] as const;
export interface Source {
  filename: string;
  size: number;
  columns: string[];
  rows: string[][];
  attr_types: Record<string, string>;
  file: FileValue;
}
export interface TableState {
  source: Source;
  keep: Set<string>;
  types: Record<string, string>;
}
interface Mapping {
  table: string;
  id: string;
}
export const DEFAULTS: Record<string, string> = {
  event_id: 'id',
  event_activity: 'eventName',
  event_timestamp: 'eventDatetime'
};

export function tableState(source: Source): TableState {
  return { source, keep: new Set(source.columns), types: { ...source.attr_types } };
}

function attributes(table: TableState): FormValues {
  const attr = table.source.columns.filter((column) => table.keep.has(column));
  return {
    attr,
    attr_types: Object.fromEntries(attr.map((column) => [column, table.types[column]]))
  };
}

export class Workflow {
  public tables: TableState[] = [];
  public event = '';
  public roles: Record<string, string> = {};
  public entityId = 'wyId';
  public mappings = new Map<string, Mapping>();

  public eventTable(): TableState | undefined {
    return this.tables.find((table) => table.source.filename === this.event);
  }
  public objectTables(): TableState[] {
    return this.tables.filter((table) => table.source.filename !== this.event);
  }

  public add(table: TableState, objectColumn?: string): void {
    this.tables = [...this.tables.filter((item) => item.source.filename !== table.source.filename), table];
    if (objectColumn) {
      this.mapObject(objectColumn, table.source.filename);
      return;
    }
    this.event = table.source.filename;
    this.roles = Object.fromEntries(
      Object.entries(DEFAULTS).map(([key, value]) => [key, table.keep.has(value) ? value : ''])
    );
    if (table.keep.has('eventDatetime')) table.types['eventDatetime'] = 'Datetime';
  }

  public selectObject(column: string, enabled: boolean): void {
    if (!enabled) {
      this.mappings.delete(column);
      return;
    }
    const match = this.objectTables().find(
      (table) => table.source.filename.replace(/\.csv$/i, '').toLowerCase() === column.toLowerCase()
    );
    this.mappings.set(column, { table: '', id: this.entityId });
    this.mapObject(column, match?.source.filename ?? '');
    const event = this.eventTable();
    if (event) event.types[column] = 'String';
  }

  public mapObject(column: string, filename: string): void {
    const table = this.tables.find((item) => item.source.filename === filename);
    const id =
      [this.entityId, 'wyId', 'id', ...(table?.source.columns ?? [])].find((value) => table?.keep.has(value)) ??
      this.entityId;
    this.mappings.set(column, { table: filename, id });
    if (table) table.types[id] = 'String';
  }

  public validate(): string {
    const event = this.eventTable();
    if (!event) return 'Upload at least one CSV and choose the event table.';
    if (!this.entityId) return 'Choose the entity ID property.';
    if (Object.values(this.roles).length !== 3 || Object.values(this.roles).some((column) => !event.keep.has(column))) {
      return 'Choose and keep the event ID, activity and timestamp attributes.';
    }
    if (new Set(Object.values(this.roles)).size !== 3) return 'Event ID, activity and timestamp must be distinct.';
    const timestamp = this.roles['event_timestamp'];
    if (timestamp !== 'eventDatetime' && event.keep.has('eventDatetime'))
      return 'Discard the other eventDatetime column before mapping the selected timestamp.';
    if (event.types[timestamp] !== 'Datetime') return 'The selected timestamp must have type Datetime.';
    if (!this.mappings.size)
      return 'Select at least one event column representing an object type. Object CSVs are optional.';
    return this.validateMappings(event);
  }

  private validateMappings(event: TableState): string {
    for (const [column, mapping] of this.mappings) {
      if (!event.keep.has(column) || Object.values(this.roles).includes(column))
        return `Keep ${column} and use a separate attribute for its object references.`;
      if (event.types[column] !== 'String') return `Object references in ${column} must have type String.`;
      if (!mapping.table) continue;
      const table = this.objectTables().find((item) => item.source.filename === mapping.table);
      if (!table?.keep.has(mapping.id)) return `Choose and keep the ID column for ${column}.`;
      if (table.types[mapping.id] !== 'String') return `The object ID column for ${column} must have type String.`;
    }
    return '';
  }

  public options(): FormValues {
    const event = this.eventTable();
    const entities: Record<string, unknown> = {};
    for (const [column, mapping] of this.mappings) {
      const table = this.tables.find((item) => item.source.filename === mapping.table);
      entities[column] = table
        ? {
            ...attributes(table),
            file: table.source.file,
            id_column: mapping.id
          }
        : {};
    }
    return {
      ...this.roles,
      entity_id: this.entityId,
      events: event ? attributes(event) : {},
      entities
    };
  }
}
