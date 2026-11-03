import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * End-to-end tests of the host with the real backend: soup-server's
 * tests/e2e_server.py (in-memory tools, no Docker) on 8081 and `ng serve`
 * with the "e2e" configuration (environment.e2e.ts) on 4201. Own ports,
 * and servers already listening are never reused: the tests must not run
 * against (and change) a development stack on 8080/4200, e.g. docker
 * compose. Uses the installed Chrome (no browser download). Run: npm run e2e
 *
 * The backend runs with the Python of SOUP_PYTHON, if set (e.g. in CI);
 * otherwise with the one of soup-server/.venv, the environment of the
 * project made by `npm run setup:server` (Scripts\python.exe on Windows,
 * bin/python elsewhere); otherwise with the `python` on the PATH, with a
 * hint. tests/e2e_server.py stops with a clear message when that Python
 * does not have the versions of requirements.txt.
 */

export const E2E_API_PORT = 8081;
export const E2E_APP_PORT = 4201;

const SERVER_DIR = join(__dirname, '..', 'soup-server');

function backendPython(): string {
  const chosen = process.env['SOUP_PYTHON']?.trim();
  if (chosen) return chosen;
  const local = join(SERVER_DIR, '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
  if (existsSync(local)) return local;
  // The config is loaded again by every worker: the hint once.
  if (!process.env['SOUP_E2E_PYTHON_HINT']) {
    process.env['SOUP_E2E_PYTHON_HINT'] = '1';
    console.warn('soup-server/.venv not found: the e2e backend uses the "python" on the PATH. Prepare it with: npm run setup:server');
  }
  return 'python';
}

const BACKEND_PYTHON = backendPython();

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${E2E_APP_PORT}`,
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: `"${BACKEND_PYTHON}" -m tests.e2e_server`,
      cwd: SERVER_DIR,
      env: { SOUP_E2E_PORT: String(E2E_API_PORT) },
      url: `http://127.0.0.1:${E2E_API_PORT}/api/v3/health`,
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: `npx ng serve --configuration e2e --port ${E2E_APP_PORT}`,
      url: `http://localhost:${E2E_APP_PORT}`,
      reuseExistingServer: false,
      timeout: 240_000
    }
  ]
});
