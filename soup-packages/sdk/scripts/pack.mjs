// npm run pack -- <folder>
//
// Creates the installable zip of a package: dist/<name>-<version>.zip with
// a single top-level folder named after the manifest's `name` (so
// `_template` installs as its manifest name) holding soup-package.json,
// server/ (without __pycache__ and compiled files) and app/dist/. Run
// build:packages first: a package declaring app.entry is refused if the
// bundle is missing.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { zipSync } from 'fflate';

import { MANIFEST_FILE, readManifest, ROOT } from './packages.mjs';

const EXCLUDED_DIRS = new Set(['__pycache__', 'node_modules']);
const EXCLUDED_FILE = /\.py[cod]$/;

function filesUnder(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symbolic links are not allowed in a package: ${path}`);
    }
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) files.push(...filesUnder(path));
    } else if (entry.isFile() && !EXCLUDED_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: npm run pack -- <package folder>');
    process.exit(2);
  }
  const base = join(ROOT, folder);
  const manifest = readManifest(folder);
  const serverDir = join(base, manifest.server?.module ?? 'server');
  if (!existsSync(serverDir) || !statSync(serverDir).isDirectory()) {
    throw new Error(`${folder}: missing the server module folder`);
  }

  const sources = [join(base, MANIFEST_FILE), ...filesUnder(serverDir)];
  const requirements = join(base, 'requirements.txt');
  if (existsSync(requirements)) {
    if (lstatSync(requirements).isSymbolicLink() || !statSync(requirements).isFile()) {
      throw new Error(`${folder}: requirements.txt must be a regular file, not a symbolic link`);
    }
    sources.push(requirements);
  }
  const entry = manifest.app?.entry;
  if (entry) {
    if (!existsSync(join(base, 'app', entry))) {
      throw new Error(`${folder}: app/${entry} not found - run "npm run build:packages -- ${folder}" first`);
    }
    sources.push(...filesUnder(join(base, 'app', 'dist')));
  }

  const entries = {};
  for (const source of sources) {
    const inZip = `${manifest.name}/${relative(base, source).split(sep).join('/')}`;
    entries[inZip] = new Uint8Array(readFileSync(source));
  }
  const outDir = join(ROOT, 'dist');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${manifest.name}-${manifest.version}.zip`);
  writeFileSync(outFile, zipSync(entries, { level: 9 }));
  console.warn(`[pack] ${relative(ROOT, outFile)} (${sources.length} files)`);
}

try {
  main();
} catch (error) {
  console.error(`[pack] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
