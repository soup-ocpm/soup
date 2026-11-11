import { Inject, Injectable, InjectionToken, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { FrontendModule } from './v3.models';
import { V3ApiService } from './v3-api.service';

/** Imports an ES module by URL; replaced in the tests. */
type ModuleImporter = (url: string) => Promise<unknown>;

export const MODULE_IMPORTER = new InjectionToken<ModuleImporter>('MODULE_IMPORTER', {
  providedIn: 'root',
  factory: () => (url: string) => import(/* @vite-ignore */ url)
});

/**
 * - loaded: the bundle was imported;
 * - failed: importing it (or a package it requires) failed, see `error`;
 * - reload-required: a different version was installed after the bundle
 *   had been imported - a custom element cannot be redefined, so the new
 *   version is used after the page is reloaded.
 */
export type FrontendLoadState = 'loaded' | 'failed' | 'reload-required';

export interface FrontendPackageStatus {
  name: string;
  version: string;
  url: string;
  state: FrontendLoadState;
  error: string | null;
}

/**
 * PackageLoaderService - loads the app/ bundle of every active package at
 * runtime. reload() reads /frontend/manifest and imports the bundles one
 * after the other, in the manifest order (every package after the ones it
 * requires). Errors are isolated: a broken bundle is recorded in
 * `statuses` (shown by the packages page), the packages requiring it are
 * not imported, the others are. Each name@version is imported once: a
 * reload after install/enable/disable only imports what is new, and the
 * version is part of the URL so a new version is not served from the
 * browser's module map.
 */
@Injectable({
  providedIn: 'root'
})
export class PackageLoaderService {
  // Frontend state of the packages of the last manifest, by name
  public readonly statuses = signal<ReadonlyMap<string, FrontendPackageStatus>>(new Map());

  // name -> "name@version" of the bundle imported in this page
  private readonly imported = new Map<string, string>();

  // url -> import in progress or done (one import per URL)
  private readonly imports = new Map<string, Promise<unknown>>();

  // The reload in progress, if any
  private current: Promise<void> | null = null;

  // The reload queued behind the current one, if any
  private queued: Promise<void> | null = null;

  /**
   * Initialize a new instance of PackageLoaderService service
   * @param api the V3ApiService service
   * @param importModule how a bundle is imported
   */
  constructor(
    private api: V3ApiService,
    @Inject(MODULE_IMPORTER) private importModule: ModuleImporter
  ) {}

  /**
   * Read the manifest again and import what is new. Calls made while a
   * reload runs are merged into one more reload after it, which the
   * returned promise waits for.
   */
  public reload(): Promise<void> {
    if (this.current) {
      this.queued ??= this.current.then(() => {
        this.queued = null;
        return this.reload();
      });
      return this.queued;
    }
    this.current = this.run().finally(() => {
      this.current = null;
    });
    return this.current;
  }

  /**
   * Make sure the bundle of `pkg` is imported (waits for the reload in
   * progress). A package missing from the last manifest (installed or
   * enabled since) makes the manifest be read again: its bundle is then
   * imported by load(), with the version in the URL and recorded as
   * name@version, so the next reload does not import it a second time.
   * @throws Error with the load error of the package, or if it has no active bundle
   */
  public async ensureLoaded(pkg: string): Promise<void> {
    await this.settled();
    if (!this.statuses().has(pkg)) {
      await this.reload();
      await this.settled();
    }
    const status = this.statuses().get(pkg);
    if (status?.state === 'failed') {
      throw new Error(status.error ?? `The frontend of package '${pkg}' failed to load`);
    }
    if (!status) {
      throw new Error(`Package '${pkg}' has no active frontend bundle`);
    }
  }

  /** The load error of a package, null if loaded or unknown. */
  public errorOf(pkg: string): string | null {
    return this.statuses().get(pkg)?.error ?? null;
  }

  /** Resolves when no reload is running or queued. */
  private async settled(): Promise<void> {
    while (this.current || this.queued) {
      await (this.queued ?? this.current);
    }
  }

  private async run(): Promise<void> {
    let modules: FrontendModule[];
    try {
      modules = await firstValueFrom(this.api.frontendManifest());
    } catch (error) {
      console.error('[soup] cannot read the frontend manifest', error);
      return;
    }

    const next = new Map<string, FrontendPackageStatus>();
    for (const module of modules) {
      next.set(module.name, await this.load(module, next));
      this.statuses.set(new Map([...this.statuses(), ...next]));
    }
    // Only the packages of this manifest: the disabled ones disappear.
    this.statuses.set(next);
  }

  private async load(module: FrontendModule, done: ReadonlyMap<string, FrontendPackageStatus>): Promise<FrontendPackageStatus> {
    const url = this.versionedUrl(module);
    const status = (state: FrontendLoadState, error: string | null = null): FrontendPackageStatus => ({
      name: module.name,
      version: module.version,
      url,
      state,
      error
    });

    if (!(module.databases ?? ['memgraph']).includes(module.database ?? 'memgraph')) {
      return status('failed', `Package '${module.name}' does not support database '${module.database}'`);
    }

    const failed = module.requires.filter((name) => done.get(name)?.state === 'failed');
    if (failed.length) {
      return status('failed', `Not loaded: required package ${failed.join(', ')} failed to load`);
    }

    const key = `${module.name}@${module.version}`;
    const previous = this.imported.get(module.name);
    if (previous === key) {
      return status('loaded');
    }
    if (previous !== undefined) {
      return status('reload-required', `Version ${module.version} is installed: reload the page to use it`);
    }

    try {
      await this.importOnce(url);
      this.imported.set(module.name, key);
      return status('loaded');
    } catch (error) {
      console.error(`[soup] frontend of package '${module.name}' failed to load`, error);
      return status('failed', error instanceof Error ? error.message : String(error));
    }
  }

  private importOnce(url: string): Promise<unknown> {
    let pending = this.imports.get(url);
    if (!pending) {
      pending = this.importModule(url).catch((error) => {
        // A failed import may be retried by a later reload.
        this.imports.delete(url);
        throw error;
      });
      this.imports.set(url, pending);
    }
    return pending;
  }

  private versionedUrl(module: FrontendModule): string {
    const url = new URL(this.api.resolveUrl(module.module_url));
    url.searchParams.set('v', module.version);
    return url.toString();
  }
}
