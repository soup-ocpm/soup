import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiResponse } from '../../../core/models/api_response.model';
import { WorkspaceNode } from '../../../core/v3/v3.models';
import { V3ApiService } from '../../../core/v3/v3-api.service';
import { NotificationService } from '../../../shared/components/s-toast/toast.service';
import { errorMessage, notify } from '../../components/notify';
import { countDescendants, distinct, filterTree, flatten } from './workspace-tree';

// The deletion being confirmed
interface PendingDelete {
  node: WorkspaceNode;
  descendants: number;
  cascade: boolean;
  confirmDatabaseDrop: boolean;
  // The packages that must be active to delete the data (409)
  missingPackages: string[];
  error: string;
  busy: boolean;
}

/**
 * /workspace - every object as a tree of provenance (derived objects under
 * the objects they come from), with kind, package and creator; filters by
 * kind and package, search by name (also from ?search=, where the old
 * dataset addresses land when no object matches); rename, edit the
 * description and delete (optionally with the derived objects). Thumbnails are images loaded from .../thumbnail: the
 * SVG is never inserted in the page.
 */
@Component({
  selector: 'app-workspace',
  imports: [NgTemplateOutlet, RouterLink, DatePipe],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss'
})
export class WorkspaceComponent implements OnInit {
  public readonly nodes = signal<WorkspaceNode[]>([]);
  public readonly loading = signal(true);
  public readonly loadError = signal('');

  public readonly search = signal('');
  public readonly kind = signal('');
  public readonly package = signal('');

  public readonly kinds = computed(() => distinct(flatten(this.nodes()).map((node) => node.object.kind)));
  public readonly packages = computed(() => distinct(flatten(this.nodes()).map((node) => node.package)));
  public readonly visible = computed(() => filterTree(this.nodes(), { search: this.search(), kind: this.kind(), package: this.package() }));
  public readonly total = computed(() => new Set(flatten(this.nodes()).map((node) => node.object.id)).size);

  // Rename (and description edit) in progress
  public readonly renaming = signal<{ id: string; name: string; description: string } | null>(null);

  public readonly pendingDelete = signal<PendingDelete | null>(null);

  // Objects without a thumbnail (the image answered 404)
  public readonly noThumbnail = signal<ReadonlySet<string>>(new Set());

  // Changes the thumbnail URLs after a reload, so new previews are shown
  public readonly thumbnailVersion = signal(Date.now());

  /**
   * Constructor for WorkspaceComponent component
   * @param api the V3ApiService service
   * @param notifications the NotificationService service
   * @param route the ActivatedRoute
   */
  constructor(
    public api: V3ApiService,
    private notifications: NotificationService,
    private route: ActivatedRoute
  ) {}

  public ngOnInit(): void {
    this.search.set(this.route.snapshot.queryParamMap.get('search') ?? '');
    this.refresh();
  }

  public refresh(): void {
    this.loading.set(true);
    this.api.objects().subscribe({
      next: (nodes) => {
        this.nodes.set(nodes);
        this.loadError.set('');
        this.noThumbnail.set(new Set());
        this.thumbnailVersion.set(Date.now());
        this.loading.set(false);
      },
      error: (error) => {
        this.loadError.set(errorMessage(error));
        this.loading.set(false);
      }
    });
  }

  public onFilter(target: 'search' | 'kind' | 'package', event: Event): void {
    this[target].set((event.target as HTMLInputElement | HTMLSelectElement).value);
  }

  public hideThumbnail(id: string): void {
    this.noThumbnail.update((ids) => new Set([...ids, id]));
  }

  // --- rename -------------------------------------------------------------- //
  public startRename(node: WorkspaceNode): void {
    this.renaming.set({ id: node.object.id, name: node.object.name, description: node.object.description });
  }

  public onRenameInput(event: Event, field: 'name' | 'description' = 'name'): void {
    const current = this.renaming();
    if (current) {
      this.renaming.set({ ...current, [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
    }
  }

  public saveRename(): void {
    const current = this.renaming();
    if (!current) {
      return;
    }
    this.api.updateObject(current.id, { name: current.name.trim(), description: current.description.trim() }).subscribe({
      next: (updated) => {
        this.renaming.set(null);
        notify(this.notifications, `Saved '${updated.name}'`, 'success');
        this.refresh();
      },
      error: (error) => notify(this.notifications, errorMessage(error), 'error')
    });
  }

  public cancelRename(): void {
    this.renaming.set(null);
  }

  // --- delete -------------------------------------------------------------- //
  public askDelete(node: WorkspaceNode): void {
    this.pendingDelete.set({
      node,
      descendants: countDescendants(node),
      cascade: false,
      confirmDatabaseDrop: false,
      missingPackages: [],
      error: '',
      busy: false
    });
  }

  public setCascade(event: Event): void {
    this.updateDelete({ cascade: (event.target as HTMLInputElement).checked, confirmDatabaseDrop: false });
  }

  public databaseNames(): string[] {
    const pending = this.pendingDelete();
    if (!pending) return [];
    const nodes = pending.cascade ? flatten([pending.node]) : [pending.node];
    return nodes.filter((node) => node.object.meta['neo4j_managed'] === true).map((node) => String(node.object.meta['neo4j_database']));
  }

  public confirmDatabaseDrop(event: Event): void {
    this.updateDelete({ confirmDatabaseDrop: (event.target as HTMLInputElement).checked });
  }

  public cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** @param force only remove from the catalog (offered when a package is not active) */
  public confirmDelete(force = false): void {
    const pending = this.pendingDelete();
    if (!pending) {
      return;
    }
    this.updateDelete({ busy: true, error: '' });
    this.api.deleteObject(pending.node.object.id, pending.cascade, force, pending.confirmDatabaseDrop).subscribe({
      next: (deleted) => {
        this.pendingDelete.set(null);
        notify(this.notifications, `${deleted.length} object(s) deleted`, 'success');
        this.refresh();
      },
      error: (error: ApiResponse<{ packages?: string[] }>) => {
        this.updateDelete({
          busy: false,
          error: errorMessage(error),
          missingPackages: error?.statusCode === 409 ? (error.responseData?.packages ?? []) : []
        });
      }
    });
  }

  private updateDelete(changes: Partial<PendingDelete>): void {
    const pending = this.pendingDelete();
    if (pending) {
      this.pendingDelete.set({ ...pending, ...changes });
    }
  }
}
