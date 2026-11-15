/** Package-local editor using SOUP's visualizer context and operation API. */
export interface Context {
  object: { id: string; name: string };
  action<T>(name: string, params?: Record<string, unknown>): Promise<T>;
  openObject(id: string): void;
  notify(message: string, level: 'error' | 'success'): void;
}
interface Schema { backend?: string; event_properties: string[]; entity_types: string[]; functions: string[]; }
export interface Condition { property: string; operator: string; value_type: string; value: string; }
export interface Attribute { name: string; function: string; }
export interface Step {
  type: 'EVENTS' | 'ENTITIES'; entity: string; group: string[];
  filters: Condition[]; attributes: Attribute[]; properties: string[];
  loading: boolean; request: number;
}
const OPERATORS = ['=', '<>', '>', '>=', '<', '<=', 'CONTAINS', 'STARTS WITH', 'ENDS WITH', 'IS NULL', 'IS NOT NULL'];
const MODULE_URL = import.meta.url;

export function statement(step: Step): string {
  let text = `AGGREGATE ${step.type}${step.type === 'ENTITIES' ? ` OF ${step.entity}` : ''} BY ${step.group.join(', ')}`;
  if (step.filters.length) text += ` WHERE ${step.filters.map((filter) => {
    const value = filter.value_type === 'string' ? JSON.stringify(filter.value) : filter.value;
    return `${filter.property} ${filter.operator}${filter.operator.includes('NULL') ? '' : ` ${value}`}`;
  }).join(' AND ')}`;
  if (step.attributes.length) text += ` WITH (${step.attributes.map((attr) => `${attr.name} AGGREGATED BY ${attr.function}`).join(', ')})`;
  return text;
}

export function specification(steps: Step[]): Record<string, unknown> {
  return { steps: steps.map((step) => ({ variant: step.type, values: {
    ...(step.type === 'ENTITIES' ? { ent_type: step.entity } : {}), group_by: [...step.group],
    filters: step.filters.map((values) => ({ variant: 'condition', values: { ...values } })),
    attr_aggrs: step.attributes.map((values) => ({ variant: 'attribute', values: { ...values } }))
  } })) };
}

export function retainProperties(step: Step, properties: string[]): void {
  step.properties = properties;
  step.group = step.group.filter((name) => properties.includes(name));
  step.filters = step.filters.filter((item) => properties.includes(item.property));
  step.attributes = step.attributes.filter((item) => properties.includes(item.name));
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; return node;
}
function button(text: string, action: () => void): HTMLButtonElement {
  const node = element('button', text); node.type = 'button'; node.addEventListener('click', action); return node;
}
function select(label: string, choices: string[], value: string, change: (value: string) => void): HTMLLabelElement {
  const node = element('label', label); const input = element('select'); input.setAttribute('aria-label', label);
  for (const choice of ['', ...choices]) { const option = element('option', choice || 'Select…'); option.value = choice; input.append(option); }
  input.value = value; input.addEventListener('change', () => change(input.value)); node.append(input); return node;
}
function incomplete(step: Step): boolean {
  return step.loading || !step.group.length || (step.type === 'ENTITIES' && !step.entity) ||
    step.filters.some((filter) => !filter.property || !filter.operator || (!filter.operator.includes('NULL') && filter.value_type !== 'string' && !filter.value)) ||
    step.attributes.some((attr) => !attr.name || !attr.function);
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
async function runAggregation(sourceId: string, params: Record<string, unknown>): Promise<{ id: string }> {
  const response = await fetch(new URL('/api/v3/operations/ocean_aggregation.aggregate/run', MODULE_URL), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Soup-Client': '1' },
    body: JSON.stringify({ objects: [sourceId], params })
  });
  const envelope = await response.json() as { message: string; response_data: { id: string }[] };
  if (!response.ok) throw new Error(envelope.message || `Aggregation failed (${response.status}).`);
  const result = envelope.response_data?.[0]; if (!result?.id) throw new Error('Aggregation returned no result object.');
  return result;
}

const STYLE = `
:host{display:block;font:inherit;color:inherit} *{box-sizing:border-box}
.workspace{display:grid;grid-template-columns:minmax(0,7fr) minmax(300px,3fr);gap:20px}
aside{position:sticky;top:0;align-self:start;max-height:85dvh;overflow:auto}
section,aside{padding:16px;border:1px solid var(--soup-border,#8a8f982f);border-radius:8px}
h3,h4{margin:0 0 12px} label{display:block;margin:10px 0} select,input{display:block;width:100%;padding:6px;font:inherit;color:inherit;background:var(--soup-bg,transparent);border:1px solid #8888;border-radius:4px}
input[type=checkbox]{display:inline;width:auto;margin-right:8px} button{font:inherit;padding:6px 10px;margin:4px;cursor:pointer;color:inherit;background:transparent;border:1px solid #8888;border-radius:4px}
button:disabled{opacity:.5;cursor:default} .active{outline:2px solid #4a7bd0} pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.85rem}
fieldset{border:0;padding:0;margin:0;min-width:0} .error{color:var(--soup-error,#ba1a1a)} .muted{opacity:.75} .item{padding:8px 0;border-bottom:1px solid #8884}
@media(max-width:850px){.workspace{grid-template-columns:1fr}aside{position:static;max-height:none}}
`;

export class OceanStudio extends HTMLElement {
  public data: Schema = { event_properties: [], entity_types: [], functions: [] };
  public context!: Context;
  private readonly root = this.attachShadow({ mode: 'open' });
  private readonly steps: Step[] = [];
  private selected = 0;
  private busy = false;
  private status = '';
  private failed = false;
  private preview: HTMLElement | null = null;
  private sourceId = '';
  private generation = 0;

  public connectedCallback(): void { this.sourceId = this.context.object.id; this.render(); }
  public disconnectedCallback(): void { this.generation++; }

  private add(type: Step['type']): void {
    if (this.steps.length >= 30) return;
    this.steps.push({ type, entity: '', group: [], filters: [], attributes: [],
      properties: type === 'EVENTS' ? [...this.data.event_properties] : [], loading: false, request: 0 });
    this.selected = this.steps.length - 1; this.render();
  }

  private refreshPreview(): void {
    if (this.preview) this.preview.textContent = this.steps.map(statement).join(';\n\n');
  }

  private async entityChanged(step: Step, entity: string): Promise<void> {
    step.entity = entity;
    const request = ++step.request; const generation = this.generation;
    step.loading = true; this.render();
    try {
      const schema = entity ? await this.context.action<{ properties: string[] }>('schema', { entity_type: entity }) : { properties: [] };
      if (request !== step.request || generation !== this.generation) return;
      retainProperties(step, schema.properties);
    } catch (error) {
      if (request !== step.request || generation !== this.generation) return;
      retainProperties(step, []); this.status = message(error); this.failed = true;
    } finally {
      if (request === step.request && generation === this.generation) { step.loading = false; this.render(); }
    }
  }

  private move(index: number, offset: number): void {
    const target = index + offset;
    if (target < 0 || target >= this.steps.length) return;
    [this.steps[index], this.steps[target]] = [this.steps[target], this.steps[index]];
    this.selected = target; this.render();
  }

  private render(): void {
    const main = element('section'); main.append(element('h3', 'Ordered aggregation steps'));
    main.append(element('p', 'Steps execute in this order on the selected dataset. Configure each step in the property panel.'));
    const controls = element('fieldset'); controls.disabled = this.busy;
    controls.append(button('Add entity aggregation', () => this.add('ENTITIES')), button('Add event aggregation', () => this.add('EVENTS')));
    this.steps.forEach((step, index) => {
      const row = element('div'); row.className = 'item';
      const choose = button(`${index + 1}. ${step.type === 'ENTITIES' ? `Entities: ${step.entity || 'select type'}` : 'Events'}`, () => { this.selected = index; this.render(); });
      if (index === this.selected) choose.className = 'active';
      const up = button('↑', () => this.move(index, -1)); up.disabled = index === 0; up.setAttribute('aria-label', `Move step ${index + 1} up`);
      const down = button('↓', () => this.move(index, 1)); down.disabled = index === this.steps.length - 1; down.setAttribute('aria-label', `Move step ${index + 1} down`);
      row.append(choose, up, down, button('Remove', () => { step.request++; this.steps.splice(index, 1); this.selected = Math.max(0, this.steps.length - 1); this.render(); }));
      controls.append(row);
    });
    const load = button(this.busy ? 'Aggregating…' : 'Run aggregation and open graph', () => void this.execute());
    load.disabled = !this.steps.length || this.steps.some((step) => step.loading);
    controls.append(load); main.append(controls);
    if (this.busy) main.append(element('p', 'Creating Class nodes and attributes, then DF_C and CORR_C relationships. Keep this view open.'));
    const status = element('p', this.status); status.setAttribute('role', this.failed ? 'alert' : 'status');
    if (this.failed) status.className = 'error'; main.append(status);
    const aside = element('aside'); aside.append(element('h3', 'Properties'));
    const editor = element('fieldset'); editor.disabled = this.busy;
    const step = this.steps[this.selected];
    if (step) this.editor(editor, step); else editor.append(element('p', 'Add an aggregation step to begin.'));
    aside.append(editor, element('h4', 'OCEAN syntax preview'));
    this.preview = element('pre'); this.preview.setAttribute('aria-live', 'polite'); aside.append(this.preview);
    aside.append(element('p', 'Statements are a readable preview; the original OCEAN specification is sent to the operation.'));
    const layout = element('div'); layout.className = 'workspace'; layout.append(main, aside);
    const style = element('style', STYLE); this.root.replaceChildren(style, layout); this.refreshPreview();
  }

  private editor(editor: HTMLElement, step: Step): void {
    if (step.type === 'ENTITIES') editor.append(select('Entity type', this.data.entity_types, step.entity, (value) => void this.entityChanged(step, value)));
    if (step.loading) { editor.append(element('p', 'Loading properties…')); return; }
    const grouping = element('fieldset'); grouping.append(element('legend', 'Group by properties'));
    for (const property of step.properties) {
      const label = element('label'); const input = element('input'); input.type = 'checkbox'; input.checked = step.group.includes(property);
      input.addEventListener('change', () => { step.group = input.checked ? [...step.group, property] : step.group.filter((name) => name !== property); this.refreshPreview(); });
      label.append(input, property); grouping.append(label);
    }
    editor.append(grouping, element('h4', 'Conditions (AND)'));
    step.filters.forEach((filter, index) => this.condition(editor, step, filter, index));
    const addFilter = button('Add condition', () => { step.filters.push({ property: '', operator: '=', value_type: 'string', value: '' }); this.render(); });
    addFilter.disabled = !step.properties.length || step.filters.length >= 12; editor.append(addFilter, element('h4', 'Aggregated attributes'));
    step.attributes.forEach((attr, index) => {
      editor.append(select('Attribute', step.properties, attr.name, (value) => { attr.name = value; this.refreshPreview(); }),
        select('Function', this.data.functions, attr.function, (value) => { attr.function = value; this.refreshPreview(); }),
        button('Remove attribute', () => { step.attributes.splice(index, 1); this.render(); }));
    });
    const addAttribute = button('Add attribute aggregation', () => { step.attributes.push({ name: '', function: '' }); this.render(); });
    addAttribute.disabled = !step.properties.length; editor.append(addAttribute);
  }

  private condition(editor: HTMLElement, step: Step, filter: Condition, index: number): void {
    editor.append(select('Condition property', step.properties, filter.property, (value) => { filter.property = value; this.refreshPreview(); }),
      select('Operator', OPERATORS, filter.operator, (value) => { filter.operator = value; this.render(); }));
    if (!filter.operator.includes('NULL')) {
      editor.append(select('Value type', ['string', 'number', 'boolean'], filter.value_type, (value) => { filter.value_type = value; filter.value = ''; this.render(); }));
      if (filter.value_type === 'boolean') editor.append(select('Value', ['true', 'false'], filter.value, (value) => { filter.value = value; this.refreshPreview(); }));
      else {
        const label = element('label', 'Value'); const input = element('input'); input.type = filter.value_type === 'number' ? 'number' : 'text';
        if (input.type === 'number') input.step = 'any'; input.value = filter.value;
        input.addEventListener('input', () => { filter.value = input.value; this.refreshPreview(); }); label.append(input); editor.append(label);
      }
    }
    editor.append(button('Remove condition', () => { step.filters.splice(index, 1); this.render(); }));
  }

  private async runOptions(context: Context, generation: number): Promise<Record<string, unknown> | null> {
    const name = window.prompt('Aggregation name:');
    if (name === null) return null;
    if (!name.trim()) throw new Error('Enter an aggregation name.');
    const existing = await context.action<{ classes: number }>('replacement');
    if (generation !== this.generation) return null;
    const replace = existing.classes > 0;
    if (replace && this.data.backend === 'memgraph') throw new Error('This Memgraph state already contains Class nodes. Select its original, unaggregated EKG dataset.');
    if (replace && !window.confirm(
      `This dataset contains ${existing.classes} Class nodes. Delete them and run "${name.trim()}"?\n\n` +
      'This is irreversible. All Class nodes and their attached relationships will be deleted from this dataset. ' +
      'Event and Entity nodes remain. Previous saved settings remain, but their graph will be replaced.'
    )) return null;
    return { aggregation_name: name.trim(), ...(this.data.backend === 'memgraph' ? {} : { replace_classes: replace }) };
  }

  private async execute(): Promise<void> {
    if (this.busy) return;
    const invalid = this.steps.findIndex(incomplete);
    if (invalid !== -1 || !this.steps.length) { this.status = `Complete the properties for step ${invalid + 1}.`; this.failed = true; this.render(); return; }
    const context = this.context; const generation = this.generation;
    this.busy = true; this.failed = false; this.status = ''; this.render();
    try {
      const options = await this.runOptions(context, generation);
      if (!options) return;
      const result = await runAggregation(this.sourceId, { ...specification(this.steps), ...options });
      if (generation === this.generation) { this.status = 'Aggregation complete.'; context.openObject(result.id); }
    } catch (error) {
      if (generation === this.generation) { this.failed = true; this.status = message(error); context.notify(this.status, 'error'); }
    } finally {
      this.busy = false; if (generation === this.generation) this.render();
    }
  }
}
