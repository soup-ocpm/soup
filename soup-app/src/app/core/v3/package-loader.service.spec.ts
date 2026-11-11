import { TestBed } from '@angular/core/testing';
import { defineSoupElement } from '@soup/sdk';
import { Observable, of, throwError } from 'rxjs';

import { MODULE_IMPORTER, PackageLoaderService } from './package-loader.service';
import { FrontendModule } from './v3.models';
import { V3ApiService } from './v3-api.service';

const ORIGIN = 'http://backend.test';

function module(name: string, requires: string[] = [], version = '1.0.0'): FrontendModule {
  return { name, version, module_url: `/api/v3/packages/${name}/app/index.js`, requires };
}

/** One element class per package, defined by its "bundle" like a real one (kept across tests). */
const ELEMENTS = new Map<string, CustomElementConstructor>();

function elementOf(name: string): CustomElementConstructor {
  if (!ELEMENTS.has(name)) {
    ELEMENTS.set(name, class extends HTMLElement {});
  }
  return ELEMENTS.get(name)!;
}

describe('PackageLoaderService', () => {
  let manifest: () => Observable<FrontendModule[]>;
  let imported: string[];
  let broken: Set<string>;
  let loader: PackageLoaderService;

  beforeEach(() => {
    manifest = () => of([]);
    imported = [];
    broken = new Set();
    const api: Partial<V3ApiService> = {
      frontendManifest: () => manifest(),
      resolveUrl: (url: string) => new URL(url, ORIGIN).toString()
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: V3ApiService, useValue: api },
        {
          provide: MODULE_IMPORTER,
          useValue: (url: string) => {
            imported.push(url);
            const name = new URL(url).pathname.split('/')[4];
            if (broken.has(name)) {
              return Promise.reject(new Error(`SyntaxError in ${name}`));
            }
            // What every bundle does: define its element once.
            defineSoupElement(`soup-loader-test-${name}`, elementOf(name));
            return Promise.resolve({});
          }
        }
      ]
    });
    loader = TestBed.inject(PackageLoaderService);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  // Like Jasmine's spies, the console spies of a test end with it.
  afterEach(() => vi.restoreAllMocks());

  it('rejects incompatible bundles before their components or navigation register', async () => {
    manifest = () =>
      of([
        { ...module('legacy'), database: 'neo4j' },
        { ...module('dependent', ['legacy']), database: 'neo4j', databases: ['neo4j'] },
        { ...module('native'), database: 'neo4j', databases: ['neo4j'] }
      ]);
    await loader.reload();
    expect(names()).toEqual(['native']);
    expect(loader.statuses().get('legacy')?.state).toBe('failed');
    await expect(loader.ensureLoaded('legacy')).rejects.toThrow('does not support');
  });

  const names = () => imported.map((url) => new URL(url).pathname.split('/')[4]);

  it('imports the bundles in the order of the manifest, with the version in the URL', async () => {
    manifest = () => of([module('base'), module('graphs', ['base']), module('extra', ['graphs'])]);

    await loader.reload();

    expect(names()).toEqual(['base', 'graphs', 'extra']);
    expect(imported[0]).toBe(`${ORIGIN}/api/v3/packages/base/app/index.js?v=1.0.0`);
    expect([...loader.statuses().values()].map((status) => status.state)).toEqual(['loaded', 'loaded', 'loaded']);
  });

  it('isolates a broken bundle: its dependents are not imported, the other packages are', async () => {
    broken.add('base');
    manifest = () => of([module('base'), module('graphs', ['base']), module('other')]);

    await loader.reload();

    expect(names()).toEqual(['base', 'other']);
    const statuses = loader.statuses();
    expect(statuses.get('base')?.state).toBe('failed');
    expect(statuses.get('base')?.error).toContain('SyntaxError in base');
    expect(statuses.get('graphs')?.state).toBe('failed');
    expect(statuses.get('graphs')?.error).toContain('base');
    expect(statuses.get('other')?.state).toBe('loaded');
    expect(loader.errorOf('graphs')).toContain('required package base');
    await expect(loader.ensureLoaded('base')).rejects.toThrow(/SyntaxError/);
  });

  it('does not import or register a bundle twice across reloads', async () => {
    manifest = () => of([module('base'), module('other')]);

    await loader.reload();
    await loader.reload();
    await Promise.all([loader.reload(), loader.reload()]);

    expect(names()).toEqual(['base', 'other']);
    expect(customElements.get('soup-loader-test-base')).toBe(elementOf('base'));
    // A bundle evaluated again (another URL, a second copy) does not throw.
    expect(defineSoupElement('soup-loader-test-base', elementOf('base'))).toBe(false);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(defineSoupElement('soup-loader-test-base', class extends HTMLElement {})).toBe(false);
  });

  it('retries a failed bundle at the next reload', async () => {
    broken.add('base');
    manifest = () => of([module('base')]);
    await loader.reload();
    broken.clear();

    await loader.reload();

    expect(names()).toEqual(['base', 'base']);
    expect(loader.statuses().get('base')?.state).toBe('loaded');
  });

  it('drops disabled packages and does not import them again when enabled', async () => {
    manifest = () => of([module('base'), module('other')]);
    await loader.reload();

    manifest = () => of([module('base')]);
    await loader.reload();
    expect([...loader.statuses().keys()]).toEqual(['base']);

    manifest = () => of([module('base'), module('other')]);
    await loader.reload();
    expect(names()).toEqual(['base', 'other']);
    expect(loader.statuses().get('other')?.state).toBe('loaded');
  });

  it('asks for a page reload when a new version replaces an imported bundle', async () => {
    manifest = () => of([module('base')]);
    await loader.reload();

    manifest = () => of([module('base', [], '2.0.0')]);
    await loader.reload();

    expect(names()).toEqual(['base']);
    expect(loader.statuses().get('base')?.state).toBe('reload-required');
    await expect(loader.ensureLoaded('base')).resolves.toBeUndefined();
  });

  it('reads the manifest again for a package missing from it, and imports it once with its version', async () => {
    await loader.reload();
    // Installed after the last reload: it is in the manifest now.
    manifest = () => of([module('fresh', [], '1.2.0')]);

    await loader.ensureLoaded('fresh');
    await loader.ensureLoaded('fresh');
    await loader.reload();

    expect(imported).toEqual([`${ORIGIN}/api/v3/packages/fresh/app/index.js?v=1.2.0`]);
    expect(loader.statuses().get('fresh')?.state).toBe('loaded');
  });

  it('refuses a package without an active bundle after reading the manifest again', async () => {
    manifest = () => of([module('base')]);
    await loader.reload();

    await expect(loader.ensureLoaded('nothing')).rejects.toThrow(/no active frontend bundle/);
    expect(names()).toEqual(['base']);
  });

  it('keeps the previous state when the manifest cannot be read', async () => {
    manifest = () => of([module('base')]);
    await loader.reload();
    manifest = () => throwError(() => new Error('offline'));

    await loader.reload();

    expect(loader.statuses().get('base')?.state).toBe('loaded');
  });
});
