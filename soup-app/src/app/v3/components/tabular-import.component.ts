import { Component, computed, ElementRef, input, signal, ViewChild } from '@angular/core';
import { TabularColumn, TabularConfiguration, TabularRole, TabularTable } from '@soup/sdk';

/** Shared presentation; importer callbacks own every option and its semantics. */
@Component({
  selector: 'soup-tabular-import',
  templateUrl: './tabular-import.component.html',
  styleUrl: './tabular-import.component.scss'
})
export class TabularImportComponent {
  public configuration = input<TabularConfiguration | null>(null);
  public readonly uid = `sti${Math.random().toString(36).slice(2, 8)}`;
  public readonly tableId = signal('');
  public readonly selectedColumns = signal<Record<string, string>>({});
  public readonly table = computed<TabularTable | undefined>(() => {
    const tables = this.configuration()?.tables ?? [];
    return tables.find((table) => table.id === this.tableId()) ?? tables[0];
  });
  public readonly column = computed<TabularColumn | undefined>(() => {
    const table = this.table();
    return table?.columns.find((column) => column.name === this.selectedColumns()[table.id]) ?? table?.columns[0];
  });
  public readonly disabled = computed(() => !!this.configuration()?.disabled || !!this.table()?.readOnly);

  @ViewChild('columnHeading') private columnHeading?: ElementRef<HTMLElement>;

  public selectColumn(name: string): void {
    const table = this.table();
    if (table) this.selectedColumns.update((columns) => ({ ...columns, [table.id]: name }));
    this.columnHeading?.nativeElement.focus();
  }

  public color(role?: string): string {
    const colors = ['#2563eb', '#9333ea', '#0f766e', '#c2410c', '#be123c', '#0369a1'];
    const index = this.table()?.roles?.findIndex((item) => item.key === role) ?? -1;
    return index < 0 ? 'var(--soup-primary, #2563eb)' : colors[index % colors.length];
  }

  public roles(column: TabularColumn): TabularRole[] {
    return (this.table()?.roles ?? []).filter((role) => column.roles?.includes(role.key));
  }

  public change(kind: 'property' | 'role' | 'type', value: string | boolean, role?: string): void {
    const table = this.table();
    const column = this.column();
    if (!table || !column || this.disabled()) return;
    this.configuration()?.onChange({ table: table.id, column: column.name, kind, value, role });
  }
}
