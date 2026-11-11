/**
 * Shared types: the JSON the /api/v3 routes exchange with the browser, as
 * declared by soup/core/contracts on the server (objects.py, fields.py,
 * report.py). Used by the host and by the app/ part of every package.
 */

/** Who created an object: an importer or an operation, of a package. */
export interface CreatedBy {
  type: 'importer' | 'operation' | string;
  /** The full contribution key, "<package>.<id>". */
  contributor_id: string;
  package: string;
}

/** One object of the workspace. */
export interface ObjectRef {
  id: string;
  name: string;
  kind: string;
  created_by: CreatedBy;
  /** Ids of the objects an operation consumed to produce this one. */
  parents: string[];
  created_at: string;
  description: string;
  meta: Record<string, unknown>;
}

/** The closed set of form field types (soup/core/contracts/fields.py). */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'bool'
  | 'select'
  | 'multiselect'
  | 'column'
  | 'columns'
  | 'pairs'
  | 'date'
  | 'datetime'
  | 'file'
  | 'items';

export const FIELD_TYPES: readonly FieldType[] = [
  'text',
  'textarea',
  'number',
  'bool',
  'select',
  'multiselect',
  'column',
  'columns',
  'pairs',
  'date',
  'datetime',
  'file',
  'items'
];

/** Field types whose value is a list. */
export const LIST_FIELD_TYPES: readonly FieldType[] = ['multiselect', 'columns', 'pairs', 'items'];

export interface Choice {
  value: string;
  label: string;
}

/** One kind of element of an "items" field, with its own fields. */
export interface Variant {
  key: string;
  label: string;
  description: string;
  fields: Field[];
}

/** One input of a form declared by an importer, an operation or an exporter. */
export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  default: unknown;
  choices: Choice[];
  help: string;
  variants: Variant[];
}

/** The value of a "file" field when sent as JSON. */
export interface FileValue {
  filename: string;
  base64: string;
  content_type?: string;
}

/** One element of an "items" field. */
export interface ItemValue {
  variant: string;
  values: Record<string, unknown>;
}

/** The value of a "pairs" field: a list of [first, second]. */
export type PairValue = [string, string];

/** The values of a form, keyed by field name. */
export type FormValues = Record<string, unknown>;

// --- blocks (soup/core/contracts/report.py) -------------------------------- //
export interface GraphNode {
  id: string;
  label?: string;
  group?: string;
  props?: Record<string, unknown>;
}

export interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  group?: string;
  props?: Record<string, unknown>;
}

interface BlockOf<T extends string, D> {
  type: T;
  title: string;
  data: D;
}

export type TextBlock = BlockOf<'text', { text: string }>;
export type MarkdownBlock = BlockOf<'markdown', { markdown: string }>;
export type ImageBlock = BlockOf<'image', { mime: string; base64: string } | { svg: string }>;
export type TableBlock = BlockOf<'table', { columns: string[]; rows: unknown[][]; total?: number }>;
export type GraphBlock = BlockOf<'graph', { nodes: GraphNode[]; edges: GraphEdge[]; directed: boolean }>;
export type ChartBlock = BlockOf<
  'chart',
  { chart: 'pie' | 'bar' | 'line'; labels: string[]; datasets: { label: string; data: number[] }[] }
>;
export type KeyValueBlock = BlockOf<'keyvalue', { items: { key: string; value: unknown }[] }>;
export type FileBlock = BlockOf<'file', { filename: string; mime: string; base64: string }>;
export type ErrorBlock = BlockOf<'error', { message: string }>;

/** One block of a report or of an import preview. */
export type Block =
  | TextBlock
  | MarkdownBlock
  | ImageBlock
  | TableBlock
  | GraphBlock
  | ChartBlock
  | KeyValueBlock
  | FileBlock
  | ErrorBlock;

export type BlockType = Block['type'];

/** The kind of the objects whose meta.blocks is a list of blocks. */
export const REPORT_KIND = 'report';

/**
 * The `data` of a visualizer of "report" objects. The host gives a
 * visualizer of "report" the same shape to draw the blocks of an import
 * preview (without an object).
 */
export interface ReportData {
  blocks: Block[];
  name?: string;
  description?: string;
}

export type NotifyLevel = 'info' | 'success' | 'warning' | 'error';

export type Theme = 'light' | 'dark';

/** Any JSON value, as answered by a visualizer action. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** The column names of the first table block, if any (what "column" fields offer). */
export function columnsOf(blocks: readonly Block[]): string[] {
  const table = blocks.find((block): block is TableBlock => block.type === 'table');
  return table ? [...table.data.columns] : [];
}

/** Presentation only: packages retain ownership of their options and validation. */
export interface TabularColumn {
  name: string;
  property?: boolean;
  roles?: string[];
  disabledRoles?: string[];
  type?: string;
}

export interface TabularRole {
  key: string;
  label: string;
  help?: string;
}

export interface TabularTable {
  id: string;
  label: string;
  columns: TabularColumn[];
  rows: unknown[][];
  roles?: TabularRole[];
  types?: string[];
  propertiesEditable?: boolean;
  readOnly?: boolean;
}

export interface TabularChange {
  table: string;
  column: string;
  kind: 'property' | 'role' | 'type';
  value: string | boolean;
  role?: string;
}

export interface TabularConfiguration {
  tables: TabularTable[];
  disabled?: boolean;
  onChange(change: TabularChange): void;
}
