import { Field, FieldType, FileValue, FormValues, ItemValue, LIST_FIELD_TYPES, PairValue, Variant } from '@soup/sdk';

/**
 * The values of a soup-dynamic-form, as plain functions: the initial
 * values of a form, what counts as empty, the required-field errors and
 * the one-line summary of an "items" element (its tile). The values have
 * the shapes soup/core/field_validation.py accepts.
 */

const REQUIRED_MESSAGE = 'Campo obbligatorio';

const SUMMARY_MAX = 120;

/** A deep copy, so a default or a value given by the parent is never mutated. */
function copy<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

// The value of an empty field, per type (a list for the list types, '' for the others).
const EMPTY_VALUES: Partial<Record<FieldType, () => unknown>> = {
  bool: () => false,
  number: () => null,
  file: () => null
};

function emptyValue(field: Field): unknown {
  if (LIST_FIELD_TYPES.includes(field.type)) {
    return [];
  }
  return (EMPTY_VALUES[field.type] ?? (() => ''))();
}

/** Every field's value: the one given, else its default, else its empty value. */
export function initialValues(fields: readonly Field[], given: FormValues | null | undefined): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    if (given && given[field.name] !== undefined) {
      values[field.name] = copy(given[field.name]);
    } else if (field.default !== null && field.default !== undefined) {
      values[field.name] = copy(field.default);
    } else {
      values[field.name] = emptyValue(field);
    }
  }
  return values;
}

function isEmpty(field: Field, value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return field.type === 'number' && typeof value === 'number' && Number.isNaN(value);
}

/** {field name: message} for the required fields without a value. */
export function requiredErrors(fields: readonly Field[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.required && field.type !== 'bool' && isEmpty(field, values[field.name])) {
      errors[field.name] = REQUIRED_MESSAGE;
    }
  }
  return errors;
}

/** The value of one field as short text. */
export function formatValue(field: Field, value: unknown): string {
  if (isEmpty(field, value)) {
    return '-';
  }
  return (FORMATTERS[field.type] ?? plainText)(field, value);
}

type Formatter = (field: Field, value: unknown) => string;

function plainText(_field: Field, value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function choiceLabel(field: Field, value: unknown): string {
  return field.choices.find((choice) => choice.value === value)?.label ?? String(value);
}

// The short text of a value, per type (plainText for the others).
const FORMATTERS: Partial<Record<FieldType, Formatter>> = {
  bool: (_field, value) => (value ? 'sì' : 'no'),
  pairs: (_field, value) => (value as PairValue[]).map(([first, second]) => `${first} → ${second}`).join(', '),
  file: (_field, value) => (value as FileValue).filename,
  items: (_field, value) => `${(value as ItemValue[]).length} elementi`,
  select: choiceLabel,
  multiselect: (field, value) => (value as string[]).map((item) => choiceLabel(field, item)).join(', ')
};

/** The text of the tile of an "items" element: "field: value; ...". */
export function summarize(variant: Variant | undefined, item: ItemValue): string {
  if (!variant) {
    return `Variante sconosciuta '${item.variant}'`;
  }
  const parts = variant.fields.map((field) => `${field.label}: ${formatValue(field, item.values[field.name])}`);
  const text = parts.join('; ') || variant.description || variant.label;
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
}

// --- readable summaries of "items" elements ------------------------------ //
const LIST_SHOWN = 4;
const SELECT_TYPES: readonly FieldType[] = ['select', 'column'];
const DATE_TYPES: readonly FieldType[] = ['date', 'datetime'];

/** A date or date-time as "2021-05-01 09:05" (no seconds, no fraction). */
function shortDate(value: unknown): string {
  const text = String(value ?? '');
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(text);
  return match ? [match[1], match[2]].filter(Boolean).join(' ') : text;
}

/** A list as "a, b, c, d e altri 3". */
function shortList(labels: readonly string[]): string {
  if (labels.length <= LIST_SHOWN) {
    return labels.join(', ');
  }
  return `${labels.slice(0, LIST_SHOWN).join(', ')} e altri ${labels.length - LIST_SHOWN}`;
}

/** The unit after a number: "s" for seconds, else the field's label in lower case. */
function unitOf(field: Field): string {
  return /second|secondi/i.test(`${field.name} ${field.label}`) ? 's' : field.label.toLowerCase();
}

type Phrase = (variant: Variant, values: FormValues) => string | null;

// The phrases tried in order; the first one that fits the variant's fields wins.
const PHRASES: readonly Phrase[] = [
  // "<label> di <choice> <operator> <number> <unit>": Durata delle tracce di order > 3600 s
  (variant, values) => {
    const operator = variant.fields.find((field) => field.name === 'operator');
    const subject = variant.fields.find((field) => SELECT_TYPES.includes(field.type) && field !== operator);
    const amount = variant.fields.find((field) => field.type === 'number');
    if (!operator || !subject || !amount || variant.fields.length !== 3) {
      return null;
    }
    const value = values[amount.name];
    const number = value === null || value === undefined || value === '' ? '?' : String(value);
    return `${variant.label} di ${formatValue(subject, values[subject.name])} ${formatValue(operator, values[operator.name])} ${number} ${unitOf(amount)}`;
  },
  // "<label>: dal <date> al <date>" (the labels of the two date fields)
  (variant, values) => {
    if (variant.fields.length !== 2 || !variant.fields.every((field) => DATE_TYPES.includes(field.type))) {
      return null;
    }
    const [from, to] = variant.fields;
    return `${variant.label}: ${from.label.toLowerCase()} ${shortDate(values[from.name])} ${to.label.toLowerCase()} ${shortDate(values[to.name])}`;
  },
  // "<label>: a, b, c" (a single list field)
  (variant, values) => {
    const [only] = variant.fields;
    if (variant.fields.length !== 1 || !LIST_FIELD_TYPES.includes(only.type) || only.type === 'items') {
      return null;
    }
    const value = values[only.name];
    const list = Array.isArray(value)
      ? (value as unknown[]).map((item) => (only.type === 'multiselect' ? formatValue(only, [item]) : String(item)))
      : [];
    return `${variant.label}: ${list.length ? shortList(list) : '-'}`;
  }
];

/**
 * The text of an "items" element as a sentence when its variant has a
 * known shape ("Durata delle tracce di order > 3600 s", "Intervallo
 * temporale: dal ... al ..."), else the "field: value; ..." of summarize().
 */
export function readableSummary(variant: Variant | undefined, item: ItemValue): string {
  if (!variant) {
    return summarize(variant, item);
  }
  for (const phrase of PHRASES) {
    const text = phrase(variant, item.values ?? {});
    if (text !== null) {
      return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1)}…` : text;
    }
  }
  return summarize(variant, item);
}

/**
 * The order the elements of an "items" field are applied in, when it is
 * not the order they were added in: the order of the variants in
 * field.variants (the server declares them in that order; the field's help
 * says so). Null when the field has no help (no such rule declared) or the
 * two orders are the same. Elements of an unknown variant go last.
 */
export function applicationOrder(field: Field, items: readonly ItemValue[]): { index: number; item: ItemValue }[] | null {
  if (!field.help || items.length < 2) {
    return null;
  }
  const rank = (item: ItemValue): number => {
    const position = field.variants.findIndex((variant) => variant.key === item.variant);
    return position === -1 ? field.variants.length : position;
  };
  const ordered = items.map((item, index) => ({ index, item })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index);
  return ordered.some((entry, position) => entry.index !== position) ? ordered : null;
}

/** The new list without the element at `index` (the value itself changes, not only the view). */
export function withoutIndex<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, position) => position !== index);
}

/** The options of a column/columns/pairs field: its choices, else the preview's columns. */
export function optionsFor(field: Field, columns: readonly string[]): { value: string; label: string }[] {
  if (field.choices.length) {
    return field.choices;
  }
  return columns.map((column) => ({ value: column, label: column }));
}

/** A file chosen by the user as the JSON value of a "file" field. */
export function readFileValue(file: File): Promise<FileValue> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`Cannot read ${file.name}`));
    reader.onload = () => {
      const url = String(reader.result ?? '');
      resolve({ filename: file.name, base64: url.slice(url.indexOf(',') + 1), content_type: file.type || undefined });
    };
    reader.readAsDataURL(file);
  });
}
