import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, OnInit, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { download, FormValues } from '@soup/sdk';

import { ExporterInfo, Field, ObjectRef, OperationInfo, VisualizerInfo } from '../../../core/v3/v3.models';
import { V3ApiService } from '../../../core/v3/v3-api.service';
import { NotificationService } from '../../../shared/components/s-toast/toast.service';
import { DynamicFormComponent } from '../../components/dynamic-form.component';
import { errorMessage, notify } from '../../components/notify';
import { SidePanelComponent } from '../../components/side-panel.component';
import { VisualizerHostComponent } from '../../components/visualizer-host.component';
import { groupIcon } from './operation-icons';
import { FirstAccessHintService } from './services/first-access-hint.service';
import { ObjectProvenanceService } from './services/object-provenance.service';
import { VisualizerChoiceService } from './services/visualizer-choice.service';

const FIRST_ACCESS_HINT_DELAY_MS = 200;

// The operation or exporter whose form is open
interface OpenForm<T> {
  item: T;
  fields: Field[];
  values: FormValues;
}

interface OperationGroup {
  name: string;
  items: OperationInfo[];
}

/** The operations by group, in the order of their first appearance ("Altro" without one). */
function groupOperations(operations: readonly OperationInfo[]): OperationGroup[] {
  const groups = new Map<string, OperationInfo[]>();
  for (const operation of operations) {
    const group = operation.group || 'Other';
    groups.set(group, [...(groups.get(group) ?? []), operation]);
  }
  return Array.from(groups, ([name, items]) => ({ name, items }));
}

/**
 * /o/:id - one object: header and provenance (parents and derived
 * objects), the visualizer selector as in ProM (the first one is the
 * default, the choice is remembered per kind in the preferences), the
 * "Azioni" panel with the operations applicable to the object (one card
 * each, by group; the form opens in a <soup-side-panel>, then the new
 * object's page) and the "Esporta" menu in the header. The first object
 * ever opened also shows the first-access hint. The choice of the
 * visualizer, the provenance and the hint are services
 * (VisualizerChoiceService, ObjectProvenanceService,
 * FirstAccessHintService): this component keeps the state of the page.
 */
@Component({
  selector: 'app-object',
  imports: [RouterLink, DatePipe, VisualizerHostComponent, DynamicFormComponent, SidePanelComponent],
  templateUrl: './object.component.html',
  styleUrl: './object.component.scss'
})
export class ObjectComponent implements OnInit {
  public readonly object = signal<ObjectRef | null>(null);
  public readonly loadError = signal('');

  public readonly parents = signal<ObjectRef[]>([]);
  public readonly children = signal<ObjectRef[]>([]);

  public readonly visualizers = signal<VisualizerInfo[]>([]);
  public readonly visualizerId = signal<string | null>(null);
  public readonly visualizersLoaded = signal(false);
  public readonly visualizer = computed(() => this.visualizers().find((item) => item.id === this.visualizerId()) ?? null);

  public readonly operations = signal<OperationInfo[]>([]);
  public readonly groups = computed(() => groupOperations(this.operations()));
  public readonly operationForm = signal<OpenForm<OperationInfo> | null>(null);
  // The operation whose fields are being loaded (its card shows a spinner)
  public readonly opening = signal<string | null>(null);
  public readonly groupIcon = groupIcon;

  public readonly exporters = signal<ExporterInfo[]>([]);
  public readonly exportForm = signal<OpenForm<ExporterInfo> | null>(null);
  public readonly exportOpen = signal(false);

  public readonly busy = signal('');
  public readonly actionError = signal('');

  @ViewChild('operationFields')
  private operationFields?: DynamicFormComponent;

  @ViewChild('exportFields')
  private exportFields?: DynamicFormComponent;

  /**
   * Constructor for ObjectComponent component
   * @param api the V3ApiService service
   * @param route the ActivatedRoute
   * @param router the Router
   * @param notifications the NotificationService service
   * @param destroyRef the DestroyRef
   * @param choice the VisualizerChoiceService service
   * @param provenance the ObjectProvenanceService service
   * @param hint the FirstAccessHintService service
   */
  constructor(
    private api: V3ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private notifications: NotificationService,
    private destroyRef: DestroyRef,
    private choice: VisualizerChoiceService,
    private provenance: ObjectProvenanceService,
    private hint: FirstAccessHintService
  ) {}

  public ngOnInit(): void {
    // The same component shows the next object after an operation or a link.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.load(params.get('id') ?? ''));
    // As on the old dataset page: shortly after the page opens.
    const timer = setTimeout(
      () => this.hint.showIfFirstTime().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(),
      FIRST_ACCESS_HINT_DELAY_MS
    );
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  public load(id: string): void {
    this.object.set(null);
    this.loadError.set('');
    this.operationForm.set(null);
    this.exportForm.set(null);
    this.exportOpen.set(false);
    this.actionError.set('');

    this.api.object(id).subscribe({
      next: (object) => {
        this.object.set(object);
        this.loadVisualizers(object);
        this.loadProvenance(object);
        this.api.operations([object.id]).subscribe({ next: (items) => this.operations.set(items), error: () => this.operations.set([]) });
        this.api.exporters(object.id).subscribe({ next: (items) => this.exporters.set(items), error: () => this.exporters.set([]) });
      },
      error: (error) => this.loadError.set(errorMessage(error))
    });
  }

  // --- visualizers --------------------------------------------------------- //
  public chooseVisualizer(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const object = this.object();
    this.visualizerId.set(id);
    if (object) {
      this.choice.remember(object.kind, id);
    }
  }

  private loadVisualizers(object: ObjectRef): void {
    this.visualizersLoaded.set(false);
    this.choice.load(object).subscribe(({ visualizers, chosen }) => {
      this.visualizers.set(visualizers);
      this.visualizerId.set(chosen);
      this.visualizersLoaded.set(true);
    });
  }

  private loadProvenance(object: ObjectRef): void {
    this.provenance.of(object).subscribe({
      next: ({ parents, children }) => {
        this.parents.set(parents);
        this.children.set(children);
      },
      error: () => undefined
    });
  }

  // --- operations ---------------------------------------------------------- //
  public openOperation(operation: OperationInfo): void {
    const object = this.object();
    // Not disabled while loading: the card keeps the focus, given back when the form closes.
    if (!object || this.opening()) {
      return;
    }
    this.actionError.set('');
    this.opening.set(operation.id);
    this.api.operationFields(operation.id, [object.id]).subscribe({
      next: (fields) => {
        this.opening.set(null);
        this.operationForm.set({ item: operation, fields, values: {} });
      },
      error: (error) => {
        this.opening.set(null);
        this.actionError.set(errorMessage(error));
      }
    });
  }

  public onOperationValues(values: FormValues): void {
    const form = this.operationForm();
    if (form) {
      this.operationForm.set({ ...form, values });
    }
  }

  public closeOperation(): void {
    this.operationForm.set(null);
    this.actionError.set('');
  }

  public runOperation(): void {
    const form = this.operationForm();
    const object = this.object();
    if (!form || !object || (this.operationFields && !this.operationFields.validate())) {
      return;
    }
    this.busy.set(`${form.item.label}...`);
    this.actionError.set('');
    this.api.runOperation(form.item.id, [object.id], form.values).subscribe({
      next: (created) => {
        this.busy.set('');
        notify(this.notifications, `${form.item.label}: ${created.length} object(s) created`, 'success');
        if (created.length) {
          void this.router.navigate(['/o', created[0].id]);
        }
      },
      error: (error) => {
        this.busy.set('');
        this.actionError.set(errorMessage(error));
      }
    });
  }

  // --- export -------------------------------------------------------------- //
  public toggleExport(): void {
    this.exportOpen.update((open) => !open);
  }

  public closeExportMenu(): void {
    this.exportOpen.set(false);
  }

  public chooseExporter(exporter: ExporterInfo): void {
    this.exportOpen.set(false);
    if (exporter.fields.length) {
      this.exportForm.set({ item: exporter, fields: exporter.fields, values: {} });
    } else {
      this.export(exporter, {});
    }
  }

  public onExportValues(values: FormValues): void {
    const form = this.exportForm();
    if (form) {
      this.exportForm.set({ ...form, values });
    }
  }

  public confirmExport(): void {
    const form = this.exportForm();
    if (form && (!this.exportFields || this.exportFields.validate())) {
      this.export(form.item, form.values);
    }
  }

  public closeExport(): void {
    this.exportForm.set(null);
    this.actionError.set('');
  }

  private export(exporter: ExporterInfo, values: FormValues): void {
    const object = this.object();
    if (!object) {
      return;
    }
    this.busy.set(`Exporting ${exporter.label}...`);
    this.api.export(object.id, exporter, values).subscribe({
      next: (file) => {
        this.busy.set('');
        this.exportForm.set(null);
        download(file.filename, exporter.mime, file.blob);
      },
      error: (error) => {
        this.busy.set('');
        this.actionError.set(errorMessage(error));
      }
    });
  }
}
