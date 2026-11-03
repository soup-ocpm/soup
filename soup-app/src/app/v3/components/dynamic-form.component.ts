import { KeyValuePipe, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnChanges,
  OnInit,
  output,
  signal,
  SimpleChanges,
  TemplateRef,
  ViewChild
} from '@angular/core';
import { Field, FieldType, FileValue, FormValues, ItemValue, PairValue, Variant } from '@soup/sdk';

import {
  applicationOrder,
  formatValue,
  initialValues,
  optionsFor,
  readableSummary,
  readFileValue,
  requiredErrors,
  withoutIndex
} from './form-values';

// What the renderer of a field receives
interface FieldContext {
  $implicit: Field;
}

// The element of an "items" field being added (index null) or edited
interface ItemEditor {
  index: number | null;
  variant: string;
  values: FormValues;
  errors: Record<string, string>;
}

/**
 * <soup-dynamic-form [fields] [columns] [value] (valueChange)> - the
 * generic form of an importer, operation or exporter, for every Field
 * type. "column", "columns" and "pairs" offer the field's choices, else
 * the preview's `columns`, else free text. "items" elements are numbered
 * cards with a readable summary; deleting a card removes the element from
 * the value (C28), editing one or adding one (from the menu of the
 * variants, with their description) opens the form of its variant (this
 * same component). When the field's help declares an order of application
 * (the order of the variants) and the cards are in another one, a notice
 * shows it. Every change emits the whole value. Each Field type has its
 * own renderer, an ng-template of the template, found in a map (open/closed:
 * a new type is one more template, not one more branch).
 */
@Component({
  selector: 'soup-dynamic-form',
  imports: [KeyValuePipe, NgTemplateOutlet],
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.scss'
})
export class DynamicFormComponent implements OnChanges, OnInit {
  // The fields of the form
  public fields = input.required<readonly Field[]>();

  // The columns of the preview, offered by column/columns/pairs fields
  public columns = input<readonly string[]>([]);

  // The initial values (missing ones: the field's default)
  public value = input<FormValues | null>(null);

  // The whole value, at every change (and once with the initial values)
  public valueChange = output<FormValues>();

  public readonly values = signal<FormValues>({});
  public readonly errors = signal<Record<string, string>>({});
  public readonly editors = signal<Record<string, ItemEditor>>({});

  // The items field whose menu of variants is open
  public readonly addMenu = signal<string | null>(null);

  // Unique prefix for the ids of the inputs (several forms per page)
  public readonly uid = `sdf${Math.random().toString(36).slice(2, 8)}`;

  public readonly formatValue = formatValue;

  // The renderers of the template, resolved before the first change detection (static queries)
  @ViewChild('textareaField', { static: true }) private textareaField!: TemplateRef<FieldContext>;
  @ViewChild('numberField', { static: true }) private numberField!: TemplateRef<FieldContext>;
  @ViewChild('boolField', { static: true }) private boolField!: TemplateRef<FieldContext>;
  @ViewChild('selectField', { static: true }) private selectField!: TemplateRef<FieldContext>;
  @ViewChild('columnField', { static: true }) private columnField!: TemplateRef<FieldContext>;
  @ViewChild('multiselectField', { static: true }) private multiselectField!: TemplateRef<FieldContext>;
  @ViewChild('columnsField', { static: true }) private columnsField!: TemplateRef<FieldContext>;
  @ViewChild('pairsField', { static: true }) private pairsField!: TemplateRef<FieldContext>;
  @ViewChild('dateField', { static: true }) private dateField!: TemplateRef<FieldContext>;
  @ViewChild('datetimeField', { static: true }) private datetimeField!: TemplateRef<FieldContext>;
  @ViewChild('fileField', { static: true }) private fileField!: TemplateRef<FieldContext>;
  @ViewChild('itemsField', { static: true }) private itemsField!: TemplateRef<FieldContext>;
  @ViewChild('textField', { static: true }) private textField!: TemplateRef<FieldContext>;

  private renderers: Partial<Record<FieldType, TemplateRef<FieldContext>>> = {};

  // The initial value is emitted after the change detection that set it, if still alive
  private destroyed = false;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  public ngOnInit(): void {
    this.renderers = {
      textarea: this.textareaField,
      number: this.numberField,
      bool: this.boolField,
      select: this.selectField,
      column: this.columnField,
      multiselect: this.multiselectField,
      columns: this.columnsField,
      pairs: this.pairsField,
      date: this.dateField,
      datetime: this.datetimeField,
      file: this.fileField,
      items: this.itemsField,
      text: this.textField
    };
  }

  /** The renderer of a Field type; an unknown type is drawn as text. */
  public renderer(type: string): TemplateRef<FieldContext> {
    return this.renderers[type as FieldType] ?? this.textField;
  }

  public ngOnChanges(changes: SimpleChanges): void {
    // A parent binding [value] to what this form emitted gives it back: not a reset.
    const newValue = changes['value'] && changes['value'].currentValue !== this.values();
    if (!changes['fields'] && !newValue) {
      return;
    }
    this.values.set(initialValues(this.fields(), this.value()));
    this.errors.set({});
    this.editors.set({});
    queueMicrotask(() => {
      if (!this.destroyed) {
        this.valueChange.emit(this.values());
      }
    });
  }

  /** True when every required field has a value (errors are then shown). */
  public validate(): boolean {
    const errors = requiredErrors(this.fields(), this.values());
    this.errors.set(errors);
    return Object.keys(errors).length === 0;
  }

  /** The current value of the form. */
  public currentValue(): FormValues {
    return this.values();
  }

  // --- reading values in the template -------------------------------------- //
  public text(field: Field): string {
    const value = this.values()[field.name];
    return value === null || value === undefined ? '' : String(value);
  }

  public list(field: Field): string[] {
    const value = this.values()[field.name];
    return Array.isArray(value) ? (value as string[]) : [];
  }

  public pairs(field: Field): PairValue[] {
    const value = this.values()[field.name];
    return Array.isArray(value) ? (value as PairValue[]) : [];
  }

  public items(field: Field): ItemValue[] {
    const value = this.values()[field.name];
    return Array.isArray(value) ? (value as ItemValue[]) : [];
  }

  public file(field: Field): FileValue | null {
    return (this.values()[field.name] as FileValue | null) ?? null;
  }

  public options(field: Field): { value: string; label: string }[] {
    return optionsFor(field, this.columns());
  }

  public variantOf(field: Field, key: string): Variant | undefined {
    return field.variants.find((variant) => variant.key === key);
  }

  public readable(field: Field, item: ItemValue): string {
    return readableSummary(this.variantOf(field, item.variant), item);
  }

  /** The order of application of the elements, when it differs from theirs (see applicationOrder). */
  public order(field: Field): { index: number; item: ItemValue }[] | null {
    return applicationOrder(field, this.items(field));
  }

  /** The label of a field of a variant (the name when unknown), for its error. */
  public fieldLabel(field: Field, variantKey: string, name: string): string {
    return this.variantOf(field, variantKey)?.fields.find((item) => item.name === name)?.label ?? name;
  }

  public id(field: Field, suffix = ''): string {
    return `${this.uid}-${field.name}${suffix}`;
  }

  // --- changing values ----------------------------------------------------- //
  public set(field: Field, value: unknown): void {
    this.values.update((values) => ({ ...values, [field.name]: value }));
    if (this.errors()[field.name]) {
      this.errors.update((errors) => {
        const next = { ...errors };
        delete next[field.name];
        return next;
      });
    }
    this.valueChange.emit(this.values());
  }

  public onText(field: Field, event: Event): void {
    this.set(field, (event.target as HTMLInputElement).value);
  }

  public onNumber(field: Field, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const parsed = raw.trim() === '' ? null : Number(raw);
    this.set(field, parsed === null || Number.isNaN(parsed) ? null : parsed);
  }

  public onBool(field: Field, event: Event): void {
    this.set(field, (event.target as HTMLInputElement).checked);
  }

  public onToggle(field: Field, choice: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.list(field).filter((item) => item !== choice);
    this.set(field, checked ? [...current, choice] : current);
  }

  /** columns without options: a comma-separated list. */
  public onList(field: Field, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.set(
      field,
      raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item)
    );
  }

  public addPair(field: Field): void {
    const first = this.options(field)[0]?.value ?? '';
    this.set(field, [...this.pairs(field), [first, first] as PairValue]);
  }

  public setPair(field: Field, index: number, position: 0 | 1, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.set(
      field,
      this.pairs(field).map((pair, i) => (i === index ? ((position === 0 ? [value, pair[1]] : [pair[0], value]) as PairValue) : pair))
    );
  }

  public removePair(field: Field, index: number): void {
    this.set(field, withoutIndex(this.pairs(field), index));
  }

  public async onFile(field: Field, event: Event): Promise<void> {
    const chosen = (event.target as HTMLInputElement).files?.[0];
    if (!chosen) {
      return;
    }
    this.set(field, await readFileValue(chosen));
  }

  public clearFile(field: Field): void {
    this.set(field, null);
  }

  // --- items --------------------------------------------------------------- //
  public toggleAddMenu(field: Field): void {
    const open = this.addMenu() !== field.name;
    this.addMenu.set(open ? field.name : null);
    if (open) {
      this.focusLater(`#${this.id(field, '-variants')} [role="menuitem"]`);
    }
  }

  public closeAddMenu(): void {
    this.addMenu.set(null);
  }

  /** Arrows move between the variants, Esc closes the menu (focus back on its button). */
  public onMenuKey(field: Field, event: KeyboardEvent): void {
    const items = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(`#${this.id(field, '-variants')} [role="menuitem"]`));
    const current = items.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves && items.length) {
      event.preventDefault();
      items[(current + moves[event.key] + items.length) % items.length].focus();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeAddMenu();
      this.focusLater(`#${this.id(field)} .soup-add-item-button`);
    }
  }

  public startAdd(field: Field, key: string): void {
    const variant = this.variantOf(field, key);
    this.closeAddMenu();
    if (variant) {
      this.openEditor(field, { index: null, variant: variant.key, values: initialValues(variant.fields, null), errors: {} });
      this.focusLater(
        `#${this.id(field)} .soup-item-editor input, #${this.id(field)} .soup-item-editor select, #${this.id(field)} .soup-item-editor textarea`
      );
    }
  }

  public startEdit(field: Field, index: number): void {
    const item = this.items(field)[index];
    const variant = item && this.variantOf(field, item.variant);
    if (variant) {
      this.openEditor(field, { index, variant: variant.key, values: initialValues(variant.fields, item.values), errors: {} });
    }
  }

  public editor(field: Field): ItemEditor | undefined {
    return this.editors()[field.name];
  }

  public onEditorChange(field: Field, values: FormValues): void {
    const editor = this.editor(field);
    if (editor) {
      this.openEditor(field, { ...editor, values });
    }
  }

  public saveEditor(field: Field): void {
    const editor = this.editor(field);
    const variant = editor && this.variantOf(field, editor.variant);
    if (!editor || !variant) {
      return;
    }
    const errors = requiredErrors(variant.fields, editor.values);
    if (Object.keys(errors).length) {
      this.openEditor(field, { ...editor, errors });
      return;
    }
    const item: ItemValue = { variant: variant.key, values: editor.values };
    const items = this.items(field);
    this.set(field, editor.index === null ? [...items, item] : items.map((current, i) => (i === editor.index ? item : current)));
    this.closeEditor(field);
  }

  public closeEditor(field: Field): void {
    this.editors.update((editors) => {
      const next = { ...editors };
      delete next[field.name];
      return next;
    });
    this.focusLater(`#${this.id(field)} .soup-add-item-button`);
  }

  /** Focus the first element matching `selector` once the view shows it. */
  private focusLater(selector: string): void {
    setTimeout(() => {
      if (!this.destroyed) {
        this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
      }
    });
  }

  /** Delete a tile: the element leaves the value, not only the view (C28). */
  public removeItem(field: Field, index: number): void {
    const editor = this.editor(field);
    if (editor?.index === index) {
      this.closeEditor(field);
    } else if (editor && editor.index !== null && editor.index > index) {
      this.openEditor(field, { ...editor, index: editor.index - 1 });
    }
    this.set(field, withoutIndex(this.items(field), index));
  }

  private openEditor(field: Field, editor: ItemEditor): void {
    this.editors.update((editors) => ({ ...editors, [field.name]: editor }));
  }
}
