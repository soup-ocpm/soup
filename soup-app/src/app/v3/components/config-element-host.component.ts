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
  SimpleChanges,
  ViewChild
} from '@angular/core';
import {
  ConfigChangeDetail,
  createConfigContext,
  Field,
  FormValues,
  isValidElementName,
  SOUP_EVENTS,
  SoupConfigElement,
  TabularConfiguration
} from '@soup/sdk';
import { firstValueFrom } from 'rxjs';

import { PackageLoaderService } from '../../core/v3/package-loader.service';
import { ImporterInfo } from '../../core/v3/v3.models';
import { V3ApiService } from '../../core/v3/v3-api.service';
import { errorMessage } from './notify';
import { whenDefined } from './when-defined';

/**
 * <soup-config-element-host [importer] [file] [fields] [columns] [value]> -
 * mounts the importer's config_element (a Web Component of its package) in
 * place of the generic import form, with a ConfigContext: the element asks
 * previews through it and emits the options, forwarded as valueChange.
 */
@Component({
  selector: 'soup-config-element-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @if (this.error()) {
      <div
        class="alert alert-danger"
        role="alert">
        {{ this.error() }}
      </div>
    }
    <div #mount></div>
  `
})
export class ConfigElementHostComponent implements OnChanges, AfterViewInit, OnDestroy {
  // The importer whose config_element is mounted
  public importer = input.required<ImporterInfo>();

  // The file being imported (previews are asked for it)
  public file = input.required<File>();

  // The fields declared by inspect()
  public fields = input<readonly Field[]>([]);

  // The columns of the preview
  public columns = input<readonly string[]>([]);

  // The initial options
  public value = input<FormValues>({});

  // The options emitted by the element
  public valueChange = output<FormValues>();
  public tabularChange = output<TabularConfiguration>();

  public readonly error = signal('');

  @ViewChild('mount', { static: true })
  private mountRef!: ElementRef<HTMLElement>;

  private generation = 0;
  private viewReady = false;

  private readonly onConfigChange: EventListener = (event) => {
    const detail = (event as CustomEvent<ConfigChangeDetail>).detail;
    if (detail && detail.value && typeof detail.value === 'object') {
      this.valueChange.emit({ ...detail.value });
    }
  };

  /**
   * Constructor for ConfigElementHostComponent component
   * @param api the V3ApiService service
   * @param loader the PackageLoaderService service
   */
  constructor(
    private api: V3ApiService,
    private loader: PackageLoaderService
  ) {}

  public ngAfterViewInit(): void {
    this.mountRef.nativeElement.addEventListener(SOUP_EVENTS.configChange, this.onConfigChange);
    this.viewReady = true;
    queueMicrotask(() => void this.mount());
  }

  public ngOnChanges(changes: SimpleChanges): void {
    // The options going back and forth do not remount the element.
    if (this.viewReady && (changes['importer'] || changes['file'])) {
      void this.mount();
    }
  }

  public ngOnDestroy(): void {
    this.generation++;
    this.mountRef.nativeElement.removeEventListener(SOUP_EVENTS.configChange, this.onConfigChange);
    this.mountRef.nativeElement.replaceChildren();
  }

  private async mount(): Promise<void> {
    const generation = ++this.generation;
    const container = this.mountRef.nativeElement;
    container.replaceChildren();
    this.error.set('');

    const importer = this.importer();
    const file = this.file();
    const tag = importer.config_element ?? '';
    try {
      if (!isValidElementName(tag)) {
        throw new Error(`The importer '${importer.id}' declares an invalid configuration element '${tag}'`);
      }
      await this.loader.ensureLoaded(importer.package);
      await whenDefined(tag);
      if (generation !== this.generation) {
        return;
      }
      const element = document.createElement(tag) as SoupConfigElement;
      element.context = createConfigContext(element, {
        importer: importer.id,
        fields: this.fields(),
        columns: this.columns(),
        value: this.value(),
        tabular: (configuration) => {
          if (generation === this.generation) this.tabularChange.emit(configuration);
        },
        preview: async (options) => {
          try {
            return await firstValueFrom(this.api.preview(importer.id, file, options));
          } catch (error) {
            throw new Error(errorMessage(error), { cause: error });
          }
        }
      });
      container.appendChild(element);
    } catch (error) {
      if (generation === this.generation) {
        this.error.set(`${importer.label}: ${errorMessage(error)}`);
      }
    }
  }
}
