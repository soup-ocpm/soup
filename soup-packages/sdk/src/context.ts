/**
 * The contexts the host hands to a package element, as its `context`
 * property. A visualizer element also receives `data` (the JSON of its
 * visualizer's /data); a configuration element of an importer replaces the
 * generic import form. The host builds the contexts with the factories
 * below, so the methods that talk to the host only dispatch the standard
 * DOM events (events.ts): an element may use either.
 */

import { dispatchSoupEvent, SOUP_EVENTS } from './events';
import { Block, Field, FormValues, Json, NotifyLevel, ObjectRef, TabularConfiguration, Theme } from './types';

export type DownloadData = string | Blob | ArrayBuffer | Uint8Array;

/*
 * The parts of a VisualizerContext, one capability each (interface
 * segregation): a helper or an element that only notifies, or only
 * downloads, declares the part it uses. VisualizerContext is all of them.
 */
export interface ObjectContext {
  /** The object being shown. */
  readonly object: ObjectRef;
  readonly theme: Theme;
}

export interface ActionContext {
  /**
   * Call an action of this element's own visualizer (POST .../actions/<name>).
   * The host sends it, with the header X-Soup-Client the backend requires on
   * the requests that change data: an element never calls the API itself
   * (a direct fetch gets 403).
   */
  action<T = Json>(name: string, params?: Record<string, unknown>): Promise<T>;
}

export interface NavigationContext {
  /** Open another object of the workspace. */
  openObject(id: string): void;
}

export interface NotifyContext {
  notify(message: string, level?: NotifyLevel): void;
}

export interface ThumbnailContext {
  /** Set the SVG preview of the object (shown in the workspace as an image). */
  setThumbnail(svg: string): void;
}

export interface DownloadContext {
  /** Save a file built in the browser. */
  download(filename: string, mime: string, data: DownloadData): void;
}

export interface VisualizerContext
  extends ObjectContext,
    ActionContext,
    NavigationContext,
    NotifyContext,
    ThumbnailContext,
    DownloadContext {}

export interface ConfigContext {
  /** The full key of the importer, "<package>.<id>". */
  readonly importer: string;
  /** The fields the importer declared in inspect(), if any. */
  readonly fields: readonly Field[];
  /** The columns of the preview of the file. */
  readonly columns: readonly string[];
  /** The options at the time the element is mounted. */
  readonly value: FormValues;
  /** An updated preview for these options (POST /imports/preview). */
  preview(options: FormValues): Promise<Block[]>;
  /** Publish tables/column controls to the host's shared Angular import editor. */
  tabular?(configuration: TabularConfiguration): void;
  /** Send the current options to the host (the ones used by the import). */
  emit(options: FormValues): void;
}

/** Elements mounted by the host: both properties are set before the element is attached. */
export interface SoupVisualizerElement<D = unknown> extends HTMLElement {
  data: D;
  context: VisualizerContext;
}

export interface SoupConfigElement extends HTMLElement {
  context: ConfigContext;
}

export interface VisualizerContextInit {
  object: ObjectRef;
  theme?: Theme;
  action: (name: string, params: Record<string, unknown>) => Promise<unknown>;
}

export function createVisualizerContext(target: EventTarget, init: VisualizerContextInit): VisualizerContext {
  return Object.freeze({
    object: init.object,
    theme: init.theme ?? 'light',
    action: <T = Json>(name: string, params: Record<string, unknown> = {}) => init.action(name, params) as Promise<T>,
    openObject: (id: string) => {
      dispatchSoupEvent(target, SOUP_EVENTS.openObject, { id });
    },
    notify: (message: string, level: NotifyLevel = 'info') => {
      dispatchSoupEvent(target, SOUP_EVENTS.notify, { message, level });
    },
    setThumbnail: (svg: string) => {
      dispatchSoupEvent(target, SOUP_EVENTS.thumbnail, { svg });
    },
    download
  });
}

export interface ConfigContextInit {
  importer: string;
  fields?: readonly Field[];
  columns?: readonly string[];
  value?: FormValues;
  preview: (options: FormValues) => Promise<Block[]>;
  tabular?: (configuration: TabularConfiguration) => void;
}

export function createConfigContext(target: EventTarget, init: ConfigContextInit): ConfigContext {
  return Object.freeze({
    importer: init.importer,
    fields: Object.freeze([...(init.fields ?? [])]),
    columns: Object.freeze([...(init.columns ?? [])]),
    value: { ...(init.value ?? {}) },
    preview: (options: FormValues) => init.preview(options),
    ...(init.tabular ? { tabular: init.tabular } : {}),
    emit: (options: FormValues) => {
      dispatchSoupEvent(target, SOUP_EVENTS.configChange, { value: { ...options } });
    }
  });
}

/** Save `data` as a file: a temporary object URL clicked through a hidden link. */
export function download(filename: string, mime: string, data: DownloadData): void {
  const part: BlobPart = data instanceof Uint8Array ? new Uint8Array(data) : data;
  const blob = data instanceof Blob ? data : new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
