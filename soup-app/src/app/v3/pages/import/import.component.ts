import { Component, computed, signal, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Block, columnsOf, FormValues, TabularChange, TabularConfiguration } from '@soup/sdk';

import { ImporterInfo, Inspection } from '../../../core/v3/v3.models';
import { V3ApiService } from '../../../core/v3/v3-api.service';
import { NotificationService } from '../../../shared/components/s-toast/toast.service';
import { BlocksPreviewComponent } from '../../components/blocks-preview.component';
import { ConfigElementHostComponent } from '../../components/config-element-host.component';
import { DynamicFormComponent } from '../../components/dynamic-form.component';
import { initialValues, requiredErrors } from '../../components/form-values';
import { errorMessage, notify } from '../../components/notify';
import { TabularImportComponent } from '../../components/tabular-import.component';

/**
 * /import - file -> the importers able to read it (several may: the user
 * picks one) -> inspect (preview and form, or the importer's own
 * configuration element) -> "Aggiorna anteprima" -> name and description
 * -> import -> the page of the new object. Preview blocks are drawn by a
 * visualizer of "report" (soup_base's <soup-report-view>); without one,
 * as JSON.
 */
@Component({
  selector: 'app-import',
  imports: [RouterLink, DynamicFormComponent, ConfigElementHostComponent, BlocksPreviewComponent, TabularImportComponent],
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss'
})
export class ImportComponent {
  public readonly file = signal<File | null>(null);
  // A file is being dragged over the drop zone (its border becomes solid)
  public readonly dragging = signal(false);
  public readonly importers = signal<ImporterInfo[] | null>(null);
  public readonly importer = signal<ImporterInfo | null>(null);
  public readonly inspection = signal<Inspection | null>(null);
  public readonly columns = signal<string[]>([]);
  public readonly blocks = signal<Block[]>([]);
  public readonly options = signal<FormValues>({});
  public readonly packageTabular = signal<TabularConfiguration | null>(null);
  public readonly roleFields = computed(() =>
    (this.inspection()?.fields ?? []).filter((field) => field.type === 'column' || field.type === 'columns')
  );
  public readonly sourceTable = computed(() => {
    if (this.importer()?.config_element) return undefined;
    const isCsv = /\.(csv|tsv)$/i.test(this.file()?.name ?? '');
    if (!isCsv && !this.roleFields().length) return undefined;
    return this.blocks().find((block) => block.type === 'table');
  });
  public readonly genericTabular = computed(() => !!this.sourceTable());
  public readonly configurationFields = computed(() => {
    const fields = this.inspection()?.fields ?? [];
    return this.genericTabular() ? fields.filter((field) => field.type !== 'column' && field.type !== 'columns') : fields;
  });
  public readonly remainingBlocks = computed(() =>
    this.packageTabular() ? [] : this.blocks().filter((block) => block !== this.sourceTable())
  );
  public readonly tabular = computed<TabularConfiguration | null>(() => {
    if (this.packageTabular()) return this.packageTabular();
    const source = this.sourceTable();
    if (source?.type !== 'table') return null;
    const fields = this.roleFields();
    return {
      disabled: !!this.busy(),
      tables: [
        {
          id: 'source',
          label: this.file()?.name ?? 'CSV',
          rows: source.data.rows,
          roles: fields.length
            ? [
                ...fields.map((field) => ({
                  key: field.name,
                  label:
                    field.name === 'values' || field.name === 'columns'
                      ? 'Property'
                      : field.name === 'entities'
                        ? 'Entity / Object reference'
                        : field.label,
                  help: field.help
                })),
                { key: '__ignore', label: 'Ignore' }
              ]
            : [],
          columns: source.data.columns.map((name) => {
            const roles = fields
              .filter((field) => {
                const value = this.options()[field.name];
                return Array.isArray(value) ? value.includes(name) : value === name;
              })
              .map((field) => field.name);
            return {
              name,
              roles: roles.length
                ? [roles.find((role) => role !== 'values' && role !== 'columns') ?? roles[0]]
                : fields.length
                  ? ['__ignore']
                  : [],
              property: !fields.length || !!roles.length,
              type: fields.length ? undefined : 'String',
              disabledRoles: fields
                .filter((field) => field.choices.length && !field.choices.some((choice) => choice.value === name))
                .map((field) => field.name)
            };
          })
        }
      ],
      onChange: (change) => this.onColumnChange(change)
    };
  });

  public readonly name = signal('');
  public readonly description = signal('');
  public readonly nameTaken = signal(false);

  public readonly busy = signal('');
  public readonly error = signal('');

  @ViewChild(DynamicFormComponent)
  private form?: DynamicFormComponent;

  /**
   * Constructor for ImportComponent component
   * @param api the V3ApiService service
   * @param router the Router
   * @param notifications the NotificationService service
   */
  constructor(
    private api: V3ApiService,
    private router: Router,
    private notifications: NotificationService
  ) {}

  // --- 1. file ------------------------------------------------------------- //
  public onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(true);
  }

  public onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragging.set(false);
    this.onSelectFile({ addedFiles: firstFile(event.dataTransfer?.files) });
  }

  public onInputChange(input: HTMLInputElement): void {
    this.onSelectFile({ addedFiles: firstFile(input.files) });
    // Reset, so that choosing the same file again is a change too.
    input.value = '';
  }

  public onSelectFile(event: { addedFiles: File[] }): void {
    const [chosen] = event.addedFiles ?? [];
    if (!chosen || event.addedFiles.length !== 1) {
      notify(this.notifications, 'Choose one file', 'error');
      return;
    }
    this.reset();
    this.file.set(chosen);
    this.name.set(chosen.name.replace(/\.[^.]+$/, ''));
    this.run('Finding importers...', () =>
      this.api.importers(chosen.name).subscribe({
        next: (importers) => {
          this.importers.set(importers);
          this.done();
          if (importers.length === 1) {
            this.chooseImporter(importers[0]);
          }
        },
        error: (error) => this.fail(error)
      })
    );
  }

  public removeFile(): void {
    this.reset();
  }

  // --- 2. importer --------------------------------------------------------- //
  public chooseImporter(importer: ImporterInfo): void {
    const file = this.file();
    if (!file) {
      return;
    }
    this.packageTabular.set(null);
    this.importer.set(importer);
    this.inspection.set(null);
    this.options.set({});
    this.run(`Inspecting ${file.name}...`, () =>
      this.api.inspect(importer.id, file).subscribe({
        next: (inspection) => {
          this.inspection.set(inspection);
          if (!importer.config_element) this.options.set(initialValues(inspection.fields, null));
          this.columns.set(columnsOf(inspection.preview));
          this.blocks.set(inspection.preview);
          this.done();
        },
        error: (error) => this.fail(error)
      })
    );
  }

  public changeImporter(): void {
    this.packageTabular.set(null);
    this.importer.set(null);
    this.inspection.set(null);
    this.blocks.set([]);
    this.error.set('');
  }

  // --- 3. options and preview ---------------------------------------------- //
  public onOptions(options: FormValues): void {
    this.options.set(this.importer()?.config_element ? options : { ...this.options(), ...options });
  }

  public onColumnChange(change: TabularChange): void {
    if (change.kind !== 'role') return;
    this.options.update((current) => {
      const options = { ...current };
      for (const field of this.roleFields()) {
        const value = options[field.name];
        if (field.type === 'column') {
          if (value === change.column) options[field.name] = '';
          if (field.name === change.role) options[field.name] = change.column;
        } else {
          const selected = (Array.isArray(value) ? (value as string[]) : []).filter((name) => name !== change.column);
          options[field.name] = field.name === change.role ? [...selected, change.column] : selected;
        }
      }
      return options;
    });
  }

  private validOptions(): boolean {
    if (this.form && !this.form.validate()) return false;
    if (this.importer()?.config_element) return true;
    const errors = requiredErrors(this.inspection()?.fields ?? [], this.options());
    const missing = Object.keys(errors);
    if (!missing.length) return true;
    const labels = this.inspection()
      ?.fields.filter((field) => missing.includes(field.name))
      .map((field) => field.label);
    this.error.set(`Configure the required fields: ${labels?.join(', ')}`);
    return false;
  }

  public refreshPreview(): void {
    const file = this.file();
    const importer = this.importer();
    if (!file || !importer || !this.validOptions()) {
      return;
    }
    this.run('Updating preview...', () =>
      this.api.preview(importer.id, file, this.options()).subscribe({
        next: (blocks) => {
          if (blocks.length) {
            this.blocks.set(blocks);
            this.columns.set(columnsOf(blocks));
          } else {
            notify(this.notifications, 'This importer does not provide an updated preview.', 'info');
          }
          this.done();
        },
        error: (error) => this.fail(error)
      })
    );
  }

  // --- 4. name and import -------------------------------------------------- //
  public onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
    this.nameTaken.set(false);
  }

  public onDescription(event: Event): void {
    this.description.set((event.target as HTMLTextAreaElement).value);
  }

  public checkName(): void {
    const name = this.name().trim();
    if (name) {
      this.api.objectExists(name).subscribe({ next: (exists) => this.nameTaken.set(exists), error: () => this.nameTaken.set(false) });
    }
  }

  public importFile(): void {
    const file = this.file();
    const importer = this.importer();
    if (!file || !importer || !this.validOptions()) {
      return;
    }
    if (!this.name().trim()) {
      this.error.set('Enter an object name');
      return;
    }
    this.run(`Importing ${file.name}...`, () =>
      this.api
        .import({ importerId: importer.id, file, name: this.name().trim(), description: this.description(), options: this.options() })
        .subscribe({
          next: (object) => {
            this.done();
            notify(this.notifications, `Imported '${object.name}'`, 'success');
            void this.router.navigate(['/o', object.id]);
          },
          error: (error) => this.fail(error)
        })
    );
  }

  // --- helpers ------------------------------------------------------------- //
  private reset(): void {
    this.file.set(null);
    this.importers.set(null);
    this.packageTabular.set(null);
    this.importer.set(null);
    this.inspection.set(null);
    this.columns.set([]);
    this.blocks.set([]);
    this.options.set({});
    this.name.set('');
    this.description.set('');
    this.nameTaken.set(false);
    this.error.set('');
  }

  private run(message: string, start: () => void): void {
    this.busy.set(message);
    this.error.set('');
    start();
  }

  private done(): void {
    this.busy.set('');
  }

  private fail(error: unknown): void {
    this.busy.set('');
    this.error.set(errorMessage(error));
  }
}

/** One file only, like the drop zone always did: the others are ignored. */
function firstFile(files: FileList | null | undefined): File[] {
  return files && files.length > 0 ? [files[0]] : [];
}
