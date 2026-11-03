import { APIRequestContext, expect, Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { E2E_API_PORT } from '../playwright.config';

/**
 * The packages of the e2e backend, shared by every spec (one backend per
 * Playwright run). A spec that changes them records what it did in a
 * PackageChanges - packages installed, enabled, disabled or uninstalled -
 * and calls restore() in afterAll, so the backend is left as the spec found
 * it and the specs pass alone or together, in any order. Packages are
 * installed from the zips of soup-packages/dist (the spec packs them first).
 */

export const API = `http://127.0.0.1:${E2E_API_PORT}/api/v3`;
export const PACKAGES_DIR = join(__dirname, '..', '..', 'soup-packages');
/**
 * The header the app adds (soup-client.interceptor.ts) to the requests that
 * change data: without it the backend answers 403. The helpers below call
 * the API directly, not through the app, so they add it themselves.
 */
const CLIENT_HEADERS = { 'X-Soup-Client': '1' };

/** The in-memory catalog and preferences of tests/e2e_server.py. */
export const CORE_TOOLS = 'test_core_tools';

export const zipOf = (name: string) => join(PACKAGES_DIR, 'dist', `${name}-1.0.0.zip`);

/** The preference of the first-access hint (the host shows it on the first /o/:id ever opened). */
export const ONBOARDING_URL = `**/api/v3/preferences/onboarding.first_time`;

/**
 * For the specs that are not about it: the hint counts as already shown, so
 * its modal never covers the page (whichever package provides the
 * preferences at that moment).
 */
export async function skipFirstAccessHint(page: Page): Promise<void> {
  await page.route(ONBOARDING_URL, (route) =>
    route.fulfill({
      json: { http_status_code: 200, message: 'ok', response_data: { key: 'onboarding.first_time', value: false } }
    })
  );
}

interface PackageInfo {
  name: string;
  status: string;
  origin: string;
}

export async function packages(request: APIRequestContext): Promise<Map<string, PackageInfo>> {
  const response = await request.get(`${API}/packages`);
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  return new Map((body.response_data as PackageInfo[]).map((pkg) => [pkg.name, pkg]));
}

async function post(request: APIRequestContext, path: string): Promise<void> {
  const response = await request.post(`${API}/packages/${path}`, { headers: CLIENT_HEADERS });
  expect(response.status(), await response.text()).toBe(200);
}

async function upload(request: APIRequestContext, name: string): Promise<number> {
  const response = await request.post(`${API}/packages`, {
    headers: CLIENT_HEADERS,
    multipart: { file: { name: `${name}-1.0.0.zip`, mimeType: 'application/zip', buffer: readFileSync(zipOf(name)) } }
  });
  return response.status();
}

export class PackageChanges {
  private readonly installed: string[] = [];
  private readonly enabled: string[] = [];
  private readonly disabled: string[] = [];
  private readonly removed: PackageInfo[] = [];

  /** Make `name` active: enable it if it is there, otherwise install it from its zip. */
  public async activate(request: APIRequestContext, name: string): Promise<void> {
    const known = (await packages(request)).get(name);
    if (known?.status === 'active') return;
    if (known) {
      await post(request, `${name}/enable`);
      this.enabled.push(name);
      return;
    }
    const status = await upload(request, name);
    expect(status, `install ${name}`).toBe(201);
    this.installed.push(name);
  }

  /** Record a package installed by the spec itself (e.g. from the /packages page). */
  public installedByTheSpec(name: string): void {
    this.installed.push(name);
  }

  /** Make `name` inactive, if it is active. */
  public async deactivate(request: APIRequestContext, name: string): Promise<void> {
    if ((await packages(request)).get(name)?.status !== 'active') return;
    await post(request, `${name}/disable`);
    this.disabled.push(name);
  }

  /**
   * Leave only the in-memory catalog and preferences: every installed
   * package is uninstalled (dependents first) and test_core_tools enabled.
   */
  public async onlyCoreTools(request: APIRequestContext): Promise<void> {
    let pending = [...(await packages(request)).values()].filter((pkg) => pkg.name !== CORE_TOOLS);
    while (pending.length) {
      const left: PackageInfo[] = [];
      for (const pkg of pending) {
        const response = await request.delete(`${API}/packages/${pkg.name}`, { headers: CLIENT_HEADERS });
        if (response.status() === 200) this.removed.push(pkg);
        else if (response.status() === 409) left.push(pkg);
        else expect(response.status(), await response.text()).toBe(200);
      }
      expect(left.length, `cannot uninstall ${left.map((pkg) => pkg.name)}`).toBeLessThan(pending.length);
      pending = left;
    }
    await this.activate(request, CORE_TOOLS);
    expect([...(await packages(request)).keys()]).toEqual([CORE_TOOLS]);
  }

  /** Undo everything recorded, in reverse order. */
  public async restore(request: APIRequestContext): Promise<void> {
    for (const name of [...this.installed].reverse()) {
      const response = await request.delete(`${API}/packages/${name}`, { headers: CLIENT_HEADERS });
      expect(response.status(), `uninstall ${name}: ${await response.text()}`).toBe(200);
    }
    for (const name of [...this.enabled].reverse()) {
      if ((await packages(request)).get(name)?.status === 'active') await post(request, `${name}/disable?cascade=true`);
    }
    for (const name of [...this.disabled].reverse()) {
      if ((await packages(request)).get(name)?.status !== 'active') await post(request, `${name}/enable`);
    }
    await this.reinstallRemoved(request);
    this.installed.length = this.enabled.length = this.disabled.length = this.removed.length = 0;
  }

  /** Install again what onlyCoreTools() uninstalled (required packages first), with its status. */
  private async reinstallRemoved(request: APIRequestContext): Promise<void> {
    if (!this.removed.length) return;
    const wanted = this.removed.filter((pkg) => existsSync(zipOf(pkg.name)));
    if (wanted.some((pkg) => pkg.name === 'tool_storage')) await this.deactivateCoreToolsFor(request);
    let pending = wanted;
    while (pending.length) {
      const left: PackageInfo[] = [];
      for (const pkg of pending) {
        if ((await upload(request, pkg.name)) !== 201) left.push(pkg);
      }
      expect(left.length, `cannot reinstall ${left.map((pkg) => pkg.name)}`).toBeLessThan(pending.length);
      pending = left;
    }
    for (const pkg of [...wanted].reverse()) {
      if (pkg.status !== 'active') await post(request, `${pkg.name}/disable?cascade=true`);
    }
  }

  private async deactivateCoreToolsFor(request: APIRequestContext): Promise<void> {
    // tool_storage provides the catalog too: the two cannot be active together.
    if ((await packages(request)).get(CORE_TOOLS)?.status === 'active') await post(request, `${CORE_TOOLS}/disable`);
  }
}
