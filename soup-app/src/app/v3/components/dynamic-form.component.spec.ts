import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Field, FormValues, ItemValue, Variant } from '@soup/sdk';

import { DynamicFormComponent } from './dynamic-form.component';
import { applicationOrder, initialValues, readableSummary, requiredErrors, summarize, withoutIndex } from './form-values';

function field(name: string, type: Field['type'], extra: Partial<Field> = {}): Field {
  return { name, label: name, type, required: false, default: null, choices: [], help: '', variants: [], ...extra };
}

function choices(...values: string[]) {
  return values.map((value) => ({ value, label: value.toUpperCase() }));
}

const FILTER: Variant = {
  key: 'filter',
  label: 'Filter',
  description: 'Keep only some activities',
  fields: [field('activity', 'text', { required: true }), field('keep', 'bool', { default: true })]
};

const AGGREGATE: Variant = {
  key: 'aggregate',
  label: 'Aggregate',
  description: '',
  fields: [field('by', 'column')]
};

const STEPS = field('steps', 'items', { variants: [FILTER, AGGREGATE] });

// The shapes of the filters of "Nuova analisi" (ekg_analysis/server/filters.py)
const PERFORMANCE: Variant = {
  key: 'performance',
  label: 'Durata delle tracce',
  description: '',
  fields: [
    field('entity', 'select', { label: 'Tipo di entità', choices: [{ value: 'order', label: 'order' }] }),
    field('operator', 'select', { label: 'Operatore', choices: [{ value: '>', label: '>' }] }),
    field('seconds', 'number', { label: 'Secondi' })
  ]
};

const FREQUENCE: Variant = {
  key: 'frequence',
  label: 'Frequenza delle attività',
  description: '',
  fields: [field('entity', 'select'), field('operator', 'select'), field('frequency', 'number', { label: 'Occorrenze' })]
};

const TIMESTAMP: Variant = {
  key: 'timestamp',
  label: 'Intervallo temporale',
  description: '',
  fields: [field('startDate', 'datetime', { label: 'Dal' }), field('endDate', 'datetime', { label: 'Al' })]
};

const ACTIVITIES: Variant = {
  key: 'includeActivities',
  label: 'Solo queste attività',
  description: '',
  fields: [field('activities', 'multiselect', { choices: choices('a', 'b', 'c', 'd', 'e', 'f') })]
};

const FILTERS = field('filters', 'items', {
  label: 'Filtri',
  help: "Si applicano nell'ordine dei filtri, non in quello della lista.",
  variants: [TIMESTAMP, PERFORMANCE, FREQUENCE]
});

describe('form values', () => {
  it('fills in the given values, then the defaults, then empty values', () => {
    const fields = [field('a', 'text', { default: 'x' }), field('b', 'number'), field('c', 'columns'), field('d', 'bool')];

    expect(initialValues(fields, { b: 3 })).toEqual({ a: 'x', b: 3, c: [], d: false });
  });

  it('reports the required fields without a value', () => {
    const fields = [
      field('a', 'text', { required: true }),
      field('b', 'pairs', { required: true }),
      field('c', 'bool', { required: true })
    ];

    expect(Object.keys(requiredErrors(fields, { a: ' ', b: [], c: false }))).toEqual(['a', 'b']);
  });

  it('summarizes an items element and removes by index', () => {
    const item: ItemValue = { variant: 'filter', values: { activity: 'Ship', keep: false } };

    expect(summarize(FILTER, item)).toBe('activity: Ship; keep: no');
    expect(withoutIndex(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('writes the summary of the known shapes of elements as a sentence', () => {
    const performance: ItemValue = { variant: 'performance', values: { entity: 'order', operator: '>', seconds: 3600 } };
    const frequence: ItemValue = { variant: 'frequence', values: { entity: 'item', operator: '>=', frequency: 2 } };
    const timestamp: ItemValue = {
      variant: 'timestamp',
      values: { startDate: '2021-05-01T09:05:00.000000', endDate: '2021-05-09T15:00:00' }
    };
    const activities: ItemValue = { variant: 'includeActivities', values: { activities: ['a', 'b', 'c', 'd', 'e', 'f'] } };

    expect(readableSummary(PERFORMANCE, performance)).toBe('Durata delle tracce di order > 3600 s');
    expect(readableSummary(FREQUENCE, frequence)).toBe('Frequenza delle attività di item >= 2 occorrenze');
    expect(readableSummary(TIMESTAMP, timestamp)).toBe('Intervallo temporale: dal 2021-05-01 09:05 al 2021-05-09 15:00');
    expect(readableSummary(ACTIVITIES, activities)).toBe('Solo queste attività: A, B, C, D e altri 2');
    expect(readableSummary(PERFORMANCE, { variant: 'performance', values: { entity: 'order', operator: '>', seconds: null } })).toBe(
      'Durata delle tracce di order > ? s'
    );
  });

  it('falls back to "field: value" for the other shapes and an unknown variant', () => {
    const item: ItemValue = { variant: 'filter', values: { activity: 'Ship', keep: true } };

    expect(readableSummary(FILTER, item)).toBe('activity: Ship; keep: sì');
    expect(readableSummary(undefined, { variant: 'gone', values: {} })).toBe("Variante sconosciuta 'gone'");
  });

  it('gives the order of application only when the help declares it and it differs', () => {
    const performance: ItemValue = { variant: 'performance', values: {} };
    const timestamp: ItemValue = { variant: 'timestamp', values: {} };
    const unknown: ItemValue = { variant: 'gone', values: {} };

    expect(applicationOrder(FILTERS, [timestamp, performance])).toBeNull();
    expect(applicationOrder(FILTERS, [performance, timestamp])?.map((entry) => entry.index)).toEqual([1, 0]);
    // Unknown variants last, the same variant in the order added.
    expect(applicationOrder(FILTERS, [unknown, performance, timestamp, performance])?.map((entry) => entry.index)).toEqual([2, 1, 3, 0]);
    expect(applicationOrder({ ...FILTERS, help: '' }, [performance, timestamp])).toBeNull();
    expect(applicationOrder(FILTERS, [performance])).toBeNull();
  });
});

describe('DynamicFormComponent', () => {
  let fixture: ComponentFixture<DynamicFormComponent>;
  let emitted: FormValues[];

  async function render(fields: Field[], columns: string[] = [], value: FormValues | null = null): Promise<void> {
    fixture = TestBed.createComponent(DynamicFormComponent);
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((values) => emitted.push(values));
    fixture.componentRef.setInput('fields', fields);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const last = () => emitted[emitted.length - 1];
  const host = () => fixture.nativeElement as HTMLElement;
  const inside = (name: string) => host().querySelector(`[data-field="${name}"]`) as HTMLElement;

  function type(element: HTMLInputElement | HTMLTextAreaElement, value: string, event = 'input'): void {
    element.value = value;
    element.dispatchEvent(new Event(event));
    fixture.detectChanges();
  }

  function click(element: Element | null): void {
    (element as HTMLElement).click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DynamicFormComponent] }).compileComponents();
  });

  it('emits the initial values, defaults included', async () => {
    await render([field('name', 'text', { default: 'log' }), field('limit', 'number', { default: 10 })]);

    expect(emitted.length).toBe(1);
    expect(last()).toEqual({ name: 'log', limit: 10 });
  });

  it('handles text, textarea, number, bool, date and datetime', async () => {
    await render([
      field('t', 'text'),
      field('ta', 'textarea'),
      field('n', 'number'),
      field('b', 'bool'),
      field('d', 'date'),
      field('dt', 'datetime')
    ]);

    type(inside('t').querySelector('input')!, 'hello');
    type(inside('ta').querySelector('textarea')!, 'many\nlines');
    type(inside('n').querySelector('input')!, '2.5');
    click(inside('b').querySelector('input'));
    type(inside('d').querySelector('input')!, '2025-01-31', 'change');
    type(inside('dt').querySelector('input')!, '2025-01-31T10:30', 'change');

    expect(last()).toEqual({ t: 'hello', ta: 'many\nlines', n: 2.5, b: true, d: '2025-01-31', dt: '2025-01-31T10:30' });

    type(inside('n').querySelector('input')!, '');
    expect(last()['n']).toBeNull();
  });

  it('handles select and multiselect with their choices', async () => {
    await render([field('s', 'select', { choices: choices('a', 'b') }), field('m', 'multiselect', { choices: choices('x', 'y', 'z') })]);

    const select = inside('s').querySelector('select') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual(['-', 'A', 'B']);
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    const boxes = inside('m').querySelectorAll('input');
    click(boxes[2]);
    click(boxes[0]);
    click(boxes[2]);

    expect(last()).toEqual({ s: 'b', m: ['x'] });
  });

  it('offers the preview columns to column, columns and pairs fields', async () => {
    await render([field('c', 'column'), field('cs', 'columns'), field('p', 'pairs')], ['case', 'activity', 'time']);

    const select = inside('c').querySelector('select') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', 'case', 'activity', 'time']);
    select.value = 'activity';
    select.dispatchEvent(new Event('change'));
    click(inside('cs').querySelectorAll('input')[2]);

    click(inside('p').querySelector('.soup-add-pair'));
    click(inside('p').querySelector('.soup-add-pair'));
    const second = inside('p').querySelectorAll('.soup-pair')[1].querySelectorAll('select');
    second[1].value = 'time';
    second[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(last()).toEqual({
      c: 'activity',
      cs: ['time'],
      p: [
        ['case', 'case'],
        ['case', 'time']
      ]
    });

    click(inside('p').querySelectorAll('.soup-remove-pair')[0]);
    expect(last()['p']).toEqual([['case', 'time']]);
  });

  it('uses free text for columns without choices nor preview columns', async () => {
    await render([field('c', 'column'), field('cs', 'columns')]);

    type(inside('c').querySelector('input')!, 'case');
    type(inside('cs').querySelector('input')!, 'a, b ,, c', 'change');

    expect(last()).toEqual({ c: 'case', cs: ['a', 'b', 'c'] });
  });

  it('reads a chosen file as base64', async () => {
    await render([field('f', 'file')]);
    const input = inside('f').querySelector('input') as HTMLInputElement;
    // jsdom has no DataTransfer to build a FileList: the chosen file as the input's `files`.
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['hi!'], 'notes.txt', { type: 'text/plain' })] });

    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    fixture.detectChanges();

    expect(last()['f']).toEqual({ filename: 'notes.txt', base64: btoa('hi!'), content_type: 'text/plain' });
    expect(inside('f').textContent).toContain('notes.txt');
    click(inside('f').querySelector('button'));
    expect(last()['f']).toBeNull();
  });

  it('adds items as tiles with a summary, through the form of their variant', async () => {
    await render([STEPS], ['case', 'activity']);

    click(inside('steps').querySelector('.soup-add-item-button'));
    // The menu of the variants, with their description
    const menu = inside('steps').querySelector('[role="menu"]') as HTMLElement;
    expect(Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) => item.getAttribute('data-variant'))).toEqual([
      'filter',
      'aggregate'
    ]);
    expect(menu.textContent).toContain('Keep only some activities');
    click(menu.querySelector('[data-variant="filter"]'));
    expect(inside('steps').querySelector('[role="menu"]')).toBeNull();
    const editor = inside('steps').querySelector('.soup-item-editor') as HTMLElement;
    expect(editor.textContent).toContain('Keep only some activities');
    // A required field of the variant is checked before saving.
    click(editor.querySelector('.soup-save-item'));
    expect(inside('steps').querySelector('.soup-item-editor')).not.toBeNull();
    expect(last()['steps']).toEqual([]);

    type(editor.querySelector('[data-field="activity"] input')!, 'Ship');
    click(editor.querySelector('.soup-save-item'));

    expect(last()['steps']).toEqual([{ variant: 'filter', values: { activity: 'Ship', keep: true } }]);
    expect(inside('steps').querySelectorAll('.soup-tile').length).toBe(1);
    expect(inside('steps').querySelector('.soup-tile-summary')?.textContent).toContain('activity: Ship; keep: sì');
  });

  it('deleting a tile removes the element from the value (C28)', async () => {
    const items: ItemValue[] = [
      { variant: 'filter', values: { activity: 'Create', keep: true } },
      { variant: 'aggregate', values: { by: 'case' } },
      { variant: 'filter', values: { activity: 'Pay', keep: false } }
    ];
    await render([STEPS], [], { steps: items });

    click(inside('steps').querySelectorAll('.soup-remove-item')[1]);

    expect(last()['steps']).toEqual([items[0], items[2]]);
    expect(inside('steps').querySelectorAll('.soup-tile').length).toBe(2);

    click(inside('steps').querySelectorAll('.soup-remove-item')[0]);
    click(inside('steps').querySelectorAll('.soup-remove-item')[0]);
    expect(last()['steps']).toEqual([]);
    expect(inside('steps').querySelectorAll('.soup-tile').length).toBe(0);
  });

  it('edits a tile in place', async () => {
    await render([STEPS], [], { steps: [{ variant: 'filter', values: { activity: 'Create', keep: true } }] });

    click(inside('steps').querySelector('.soup-edit-item'));
    const editor = inside('steps').querySelector('.soup-item-editor') as HTMLElement;
    type(editor.querySelector('[data-field="activity"] input')!, 'Ship');
    click(editor.querySelector('.soup-save-item'));

    expect(last()['steps']).toEqual([{ variant: 'filter', values: { activity: 'Ship', keep: true } }]);
  });

  it('numbers the cards, names their buttons and closes the menu with Esc', async () => {
    await render([STEPS], [], { steps: [{ variant: 'filter', values: { activity: 'Create', keep: true } }] });

    expect(inside('steps').querySelector('.soup-tile-number')?.textContent?.trim()).toBe('1');
    expect(inside('steps').querySelector('.soup-edit-item')?.getAttribute('aria-label')).toBe('Modifica elemento 1 di steps');
    expect(inside('steps').querySelector('.soup-remove-item')?.getAttribute('aria-label')).toBe('Elimina elemento 1 di steps');

    click(inside('steps').querySelector('.soup-add-item-button'));
    const menu = inside('steps').querySelector('[role="menu"]') as HTMLElement;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(inside('steps').querySelector('[role="menu"]')).toBeNull();
  });

  it('warns when the filters are applied in another order than the one added', async () => {
    const performance: ItemValue = { variant: 'performance', values: { entity: 'order', operator: '>', seconds: 3600 } };
    const timestamp: ItemValue = { variant: 'timestamp', values: { startDate: '2021-05-01T09:05', endDate: '2021-05-02T09:05' } };
    await render([FILTERS], [], { filters: [timestamp, performance] });

    expect(inside('filters').querySelector('.soup-order-notice')).toBeNull();
    expect(inside('filters').textContent).toContain('Durata delle tracce di order > 3600 s');
    expect(inside('filters').querySelector('.soup-add-item-button')?.textContent).toContain('Aggiungi filtro');

    await render([FILTERS], [], { filters: [performance, timestamp] });

    const notice = inside('filters').querySelector('.soup-order-notice') as HTMLElement;
    expect(notice.textContent).toContain('Ordine di applicazione diverso da quello di inserimento');
    expect(Array.from(notice.querySelectorAll('li')).map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Intervallo temporale (n. 2)',
      'Durata delle tracce (n. 1)'
    ]);
  });

  it('validate() shows the errors of the required fields', async () => {
    await render([field('name', 'text', { required: true }), field('steps', 'items', { required: true, variants: [FILTER] })]);

    expect(fixture.componentInstance.validate()).toBe(false);
    fixture.detectChanges();
    expect(host().querySelectorAll('.soup-field-error').length).toBe(2);

    type(inside('name').querySelector('input')!, 'log');
    expect(host().querySelectorAll('.soup-field-error').length).toBe(1);
  });
});
