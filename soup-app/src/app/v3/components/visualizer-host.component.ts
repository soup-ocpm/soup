import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  input,
  OnChanges,
  OnDestroy,
  output,
  signal,
  ViewChild
} from '@angular/core';
import { Router } from '@angular/router';
import {
  createVisualizerContext,
  isValidElementName,
  NotifyDetail,
  OpenObjectDetail,
  SOUP_EVENTS,
  SoupVisualizerElement,
  Theme,
  ThumbnailDetail
} from '@soup/sdk';
import { firstValueFrom } from 'rxjs';

import { PackageLoaderService } from '../../core/v3/package-loader.service';
import { ObjectRef, VisualizerInfo } from '../../core/v3/v3.models';
import { V3ApiService } from '../../core/v3/v3-api.service';
import { NotificationService } from '../../shared/components/s-toast/toast.service';
import { errorMessage, notify } from './notify';
import { ObjectFallbackComponent } from './object-fallback.component';
import { whenDefined } from './when-defined';

type HostState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * <soup-visualizer-host [object] [visualizer]> - shows an object with the
 * Web Component of a package: makes sure the package bundle is loaded,
 * creates the visualizer's element, sets its `data` (GET .../data) and
 * `context` and forwards its DOM events to the host (thumbnail, opening
 * another object, notifications). Without a visualizer it shows that none
 * is installed for the kind, with the object's meta as JSON.
 *
 * With [data], the element gets that data instead of GET .../data: used
 * to show something that is not (yet) an object, like the blocks of an
 * import preview. Then there is no object to save a thumbnail to nor
 * actions to call.
 */
@Component({
  selector: 'soup-visualizer-host',
  imports: [ObjectFallbackComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (!this.visualizer()) {
      <soup-object-fallback
        [kind]="this.object().kind"
        [data]="this.object().meta"></soup-object-fallback>
    }
    @if (this.state() === 'loading') {
      <div class="text-muted py-3">
        <span class="spinner-border spinner-border-sm"></span>
        Loading {{ this.visualizer()?.label }}...
      </div>
    }
    @if (this.state() === 'error') {
      <div
        class="alert alert-danger"
        role="alert">
        {{ this.error() }}
      </div>
    }
    <div
      #mount
      class="soup-visualizer-mount"></div>
  `
})
export class VisualizerHostComponent implements OnChanges, AfterViewInit, OnDestroy {
  // The object to show
  public object = input.required<ObjectRef>();

  // The visualizer chosen for it (null: none installed for its kind)
  public visualizer = input<VisualizerInfo | null>(null);

  // The theme given to the element
  public theme = input<Theme>('light');

  // The data given to the element instead of GET .../data (undefined: ask the visualizer)
  public data = input<unknown>(undefined);

  // A new SVG preview set by the element (already saved)
  public thumbnailChanged = output<string>();

  public readonly state = signal<HostState>('idle');
  public readonly error = signal<string>('');

  @ViewChild('mount', { static: true })
  private mountRef!: ElementRef<HTMLElement>;

  // Bumped at every (re)mount: an older, slower mount must not attach its element
  private generation = 0;

  // Inputs may change before the view exists: the first mount waits for it
  private viewReady = false;

  private readonly listeners: [string, EventListener][] = [
    [SOUP_EVENTS.thumbnail, (event) => this.onThumbnail((event as CustomEvent<ThumbnailDetail>).detail)],
    [SOUP_EVENTS.openObject, (event) => this.onOpenObject((event as CustomEvent<OpenObjectDetail>).detail)],
    [SOUP_EVENTS.notify, (event) => this.onNotify((event as CustomEvent<NotifyDetail>).detail)]
  ];

  /**
   * Constructor for VisualizerHostComponent component
   * @param api the V3ApiService service
   * @param loader the PackageLoaderService service
   * @param router the Router
   * @param notifications the NotificationService service
   */
  constructor(
    private api: V3ApiService,
    private loader: PackageLoaderService,
    private router: Router,
    private notifications: NotificationService
  ) {}

  public ngAfterViewInit(): void {
    for (const [name, listener] of this.listeners) {
      this.mountRef.nativeElement.addEventListener(name, listener);
    }
    this.viewReady = true;
    // Not during this change detection: mount() updates the state shown above.
    queueMicrotask(() => void this.mount());
  }

  public ngOnChanges(): void {
    if (this.viewReady) {
      void this.mount();
    }
  }

  public ngOnDestroy(): void {
    this.generation++;
    for (const [name, listener] of this.listeners) {
      this.mountRef.nativeElement.removeEventListener(name, listener);
    }
    this.mountRef.nativeElement.replaceChildren();
  }

  /** Remove the current element and mount the one of the current inputs. */
  public async mount(): Promise<void> {
    const generation = ++this.generation;
    const container = this.mountRef.nativeElement;
    container.replaceChildren();
    this.error.set('');

    const object = this.object();
    const visualizer = this.visualizer();
    if (!visualizer) {
      this.state.set('idle');
      return;
    }

    this.state.set('loading');
    try {
      const tag = visualizer.element;
      if (!isValidElementName(tag)) {
        throw new Error(`The visualizer '${visualizer.id}' declares an invalid element name '${tag}'`);
      }
      await this.loader.ensureLoaded(visualizer.package);
      await whenDefined(tag);
      const given = this.data();
      const data = given !== undefined ? given : await firstValueFrom(this.api.visualizerData(object.id, visualizer.id));
      if (generation !== this.generation) {
        return;
      }

      const element = document.createElement(tag) as SoupVisualizerElement;
      element.data = data;
      element.context = createVisualizerContext(element, {
        object,
        theme: this.theme(),
        action: (name, params) => this.action(object.id, visualizer.id, name, params)
      });
      container.appendChild(element);
      this.state.set('ready');
    } catch (error) {
      if (generation === this.generation) {
        this.state.set('error');
        this.error.set(`${visualizer.label}: ${errorMessage(error)}`);
      }
    }
  }

  private async action(objectId: string, visualizerId: string, name: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.data() !== undefined) {
      throw new Error(`No action '${name}' here: this view does not show an object`);
    }
    try {
      return await firstValueFrom(this.api.visualizerAction(objectId, visualizerId, name, params));
    } catch (error) {
      // Package code gets a real Error, not the host's ApiResponse.
      throw new Error(errorMessage(error), { cause: error });
    }
  }

  private onThumbnail(detail: ThumbnailDetail | undefined): void {
    // Data given by the page belongs to no object: nothing to save the thumbnail to.
    if (!detail || typeof detail.svg !== 'string' || this.data() !== undefined) {
      return;
    }
    const object = this.object();
    this.api.setThumbnail(object.id, detail.svg).subscribe({
      next: () => this.thumbnailChanged.emit(detail.svg),
      error: (error) => notify(this.notifications, `Preview not saved: ${errorMessage(error)}`, 'warning')
    });
  }

  private onOpenObject(detail: OpenObjectDetail | undefined): void {
    if (detail && typeof detail.id === 'string' && detail.id) {
      void this.router.navigate(['/o', detail.id]);
    }
  }

  private onNotify(detail: NotifyDetail | undefined): void {
    if (detail && typeof detail.message === 'string') {
      notify(this.notifications, detail.message, detail.level);
    }
  }
}
