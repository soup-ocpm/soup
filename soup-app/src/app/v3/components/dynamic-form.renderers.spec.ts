import { TestBed } from '@angular/core/testing';
import { Field, FIELD_TYPES, FieldType } from '@soup/sdk';

import { DynamicFormComponent } from './dynamic-form.component';
import { formatValue } from './form-values';

function field(name: string, type: FieldType): Field {
  const choices = [{ value: 'a', label: 'A' }];
  return { name, label: name, type, required: false, default: null, choices, help: '', variants: [] };
}

// The element (or class) each renderer draws first: one per Field type, the generic text input only for "text".
const DRAWN: Record<FieldType, string> = {
  text: 'input[type="text"]',
  textarea: 'textarea',
  number: 'input[type="number"]',
  bool: 'input[type="checkbox"]',
  select: 'select',
  multiselect: 'input[type="checkbox"]',
  column: 'select',
  columns: 'input[type="checkbox"]',
  pairs: '.soup-pairs',
  date: 'input[type="date"]',
  datetime: 'input[type="datetime-local"]',
  file: 'input[type="file"]',
  items: '.soup-items'
};

describe('DynamicFormComponent renderers', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [DynamicFormComponent] }));

  it('draws every Field type with its own renderer', () => {
    const fixture = TestBed.createComponent(DynamicFormComponent);
    fixture.componentRef.setInput(
      'fields',
      FIELD_TYPES.map((type) => field(`f_${type}`, type))
    );
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    for (const type of FIELD_TYPES) {
      const container = root.querySelector(`[data-field="f_${type}"]`);
      expect(container?.getAttribute('data-type'), type).toBe(type);
      expect(container?.querySelector(DRAWN[type]), type).not.toBeNull();
    }
  });

  it('draws an unknown type as text', () => {
    const fixture = TestBed.createComponent(DynamicFormComponent);
    fixture.componentRef.setInput('fields', [field('future', 'hologram' as FieldType)]);
    fixture.detectChanges();

    const container = (fixture.nativeElement as HTMLElement).querySelector('[data-field="future"]');
    expect(container?.querySelector('input[type="text"]')).not.toBeNull();
  });

  it('formats every type of value with its own formatter', () => {
    expect(formatValue(field('b', 'bool'), true)).toBe('yes');
    expect(formatValue(field('s', 'select'), 'a')).toBe('A');
    expect(formatValue(field('m', 'multiselect'), ['a', 'x'])).toBe('A, x');
    expect(formatValue(field('p', 'pairs'), [['a', 'b']])).toBe('a → b');
    expect(formatValue(field('f', 'file'), { filename: 'x.csv', base64: '' })).toBe('x.csv');
    expect(formatValue(field('i', 'items'), [{ variant: 'v', values: {} }])).toBe('1 items');
    expect(formatValue(field('c', 'columns'), ['a', 'b'])).toBe('a, b');
    expect(formatValue(field('t', 'text'), '')).toBe('-');
  });
});
