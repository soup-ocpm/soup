# Discovery, lifecycle, packaging and security

[Documentation index](../README.md) · [API reference](package-api.md)

## Discovery and startup

The [settings implementation](../../soup-server/soup/core/settings.py) supplies:

| Setting                       | Current meaning/default                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOUP_PACKAGES_PATH`          | Search-root list separated by `os.pathsep`: `:` on Linux/macOS, `;` on Windows. Default is repository `soup-packages/`; installed packages are also searched.                                             |
| `SOUP_INSTALLED_PACKAGES_DIR` | ZIP extraction root and state directory. Defaults to `soup-server/instance/packages`; Docker sets `/data/soup-packages` and mounts a package volume. Always appended to search paths if absent.           |
| `SOUP_PACKAGES`               | Comma-separated explicit startup selection. Absent: discover all compatible packages except user-disabled ones. Empty string: select none. This list does not automatically include omitted dependencies. |
| `SOUP_STRICT`                 | Default false; fail-fast package verification/loading behavior when enabled.                                                                                                                              |
| `SOUP_ALLOW_PACKAGE_INSTALL`  | Default false. Enables install/uninstall APIs; the development Compose configuration sets true.                                                                                                           |

`SOUP_PLUGINS` is not read by current settings. Search scans immediate child
folders with `soup-package.json`, ignoring names starting `_` or `.`. The folder
must match the manifest name. When several sources share a name, the higher PEP
440 version wins; equal versions keep the first source encountered in search
order. Installed directories are rediscovered on restart.

Before registration, the manager validates manifests, contract versions,
installed Python dependencies, package requirements, tool providers and
global-name conflicts, and orders dependencies topologically. Missing/failed
dependencies and cycles are reported. Backend-incompatible packages are disabled
during ordinary automatic discovery; explicitly forcing an incompatible package
still fails compatibility checks. With normal non-strict settings, one failed
package does not block unrelated packages.

The manifest's declarations are copied onto its `SoupPlugin`; modules are
imported as `soup_pkg_<name>`. The package registers through `register(ctx)`.
Runtime backend availability is established from startup connection settings;
dataset selection then determines request/package compatibility without a
mutable global selection. See
[database access](package-api.md#dataset-bound-database-access).

## Runtime management

The Angular **Packages** page uses the existing management API. Results use the
normal `{http_status_code, message, response_data}` envelope, not bare arrays.
Package list statuses are `active`, `disabled`, `failed`; an object's owner can
also be `missing` when its package is gone.

| Action              | Endpoint                                  | Important behavior                                                                                                                                      |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List                | `GET /api/v3/packages`                    | Metadata, compatibility, dependencies, errors and registered contribution keys                                                                          |
| Install ZIP         | `POST /api/v3/packages`, multipart `file` | Requires install permission; activates after validation; `allow_override=true` is explicit permission to replace a bundled package with a newer version |
| Disable             | `POST /api/v3/packages/<name>/disable`    | `409` with dependents unless `cascade=true`; unloads dependents first when cascading                                                                    |
| Enable              | `POST /api/v3/packages/<name>/enable`     | Requires the package and its dependencies/tools to be usable; missing active package requirements return `409`                                          |
| Uninstall           | `DELETE /api/v3/packages/<name>`          | Installed packages only, subject to dependent checks; a bundled package cannot be removed this way                                                      |
| Frontend manifest   | `GET /api/v3/frontend/manifest`           | Active frontend modules in package dependency order; optional `object_id` filters against resolved graph context                                        |
| Bundle/static files | `GET /api/v3/packages/<name>/app/<path>`  | Active package only, within its resolved `app/dist`; escaping paths/symlinks return `404`                                                               |

The frontend manifest includes `name`, `version`, `module_url`, `requires`,
`databases` and `database`. Without an object it describes configured compatible
packages; with graph context it selects that backend. The host updates package
availability/navigation for the selected dataset and guards stale responses.
These runtime restrictions do not replace the package's own input validation.

Management calls are serialized by the manager lock. Core registries, extension
points and event subscriptions use copy-on-write snapshots while requests read.
That is not a guarantee that arbitrary package-owned globals/resources are
thread-safe or that unload waits for all possible custom background work. Use
explicit resource ownership and the existing graph operation/session locks.

On unload, `on_shutdown(ctx)` is best-effort, then owned contributions,
extension points and subscriptions are removed. Engine shutdown closes shared
database connections after package cleanup; do not close borrowed dataset
connections after each request. Per-plugin caches/timers/resources should be
released by their owner. Enabled/disabled state is written atomically to
`_state.json` under the installed packages directory. An explicit
`SOUP_PACKAGES` startup selection overrides that persisted selection.

## Existing objects and removal

Disabling/uninstalling does not automatically delete objects or their external
data. If an object's owning cleanup contribution is unavailable, normal deletion
returns `409` with the affected package information. Re-enable its package to
run normal disposal. Explicit `force=true` deletion removes the catalog entry
and records orphan metadata, creator/package and time in `orphaned-data.json`
under the installed-package directory so leftover data can be reviewed later.

A managed Neo4j dataset deletion also needs explicit database-drop confirmation;
only its registered, validated owned database is eligible. Protected, shared and
unmanaged names are refused. Package uninstall is not a request to drop graphs.
See the [OCED importer](../oced_importer/README.md) for its dataset lifecycle.

## Build and package a release

From `soup-packages/`, use Node/npm versions matching the root `package.json`
(Node >=24.22.0 and npm >=11):

```sh
npm ci
npm run build:packages -- _template
npm run pack -- _template
```

Those commands create `dist/template-1.0.0.zip`. For an existing custom package,
substitute its directory name. The build helper also supports multiple
directories; without arguments, `npm run build:packages` processes every
directory with `app/src/index.ts`, including `_template` even though server
discovery skips it. The SDK is built first, then package TypeScript is checked
and esbuild creates a single minified ES module with a source map at
`app/dist/index.js`.

After **adding/changing npm workspace dependencies**, run `npm install` and
retain the updated `package-lock.json`. Use `npm ci` for a clean installation
from an already synchronized manifest/lockfile. Do not replace it with an
unlocked install in Docker to hide a missing/malformed lockfile.

`npm run pack -- <directory>` uses the directory's manifest name/version for the
ZIP filename and its one top-level directory. It includes the manifest, server
module files (excluding Python bytecode/cache), and `app/dist` when declared. It
rejects symbolic links and refuses an app entry whose built bundle is missing.
It does **not** include source tests or install Python/npm dependencies on the
server. Run the build first. A server-only package needs no frontend workspace
or `app` entry; the packaging script still accepts it.

The [server Dockerfile](../../soup-server/Dockerfile) copies the workspace
manifest and lockfile explicitly, runs `npm ci && npm run build:packages`, then
copies package code and built bundles into the Python image. The Angular image
compiles the host and SDK, not each package's visualizer into the host bundle.

### HTTP installation

With the server already configured to allow installation, install the template
ZIP from `soup-packages/`:

```sh
curl --fail-with-body -H 'X-Soup-Client: 1' \
  -F file=@dist/template-1.0.0.zip \
  http://localhost:8080/api/v3/packages
```

The client header is required for POST/PUT/PATCH/DELETE under `/api/v3`,
including read-only visualizer actions that happen to use POST. Merely setting
CORS is not enough. Requests with an `Origin` must additionally use an allowed
origin or the backend's own origin. The host SDK/context handles its normal
requests; external scripts must supply the header themselves. This curl
invocation is illustrative for a running local server; do not run it against an
installation you do not intend to modify.

A ZIP manifest can be at the root or inside one top-level directory. Defaults
from [ArchiveLimits](../../soup-server/soup/core/packages/archive.py) are 50 MiB
archive, 200 MiB extracted, 2,000 entries, and a maximum 100:1 ratio for members
larger than 1 MiB. Traversal/absolute/drive/backslash paths and symlinks are
refused. The HTTP request-body limit (`SOUP_MAX_UPLOAD_MB`, default 200) can
reject a request earlier.

## Upgrades and frontend reloads

- Replacing an installed package requires a **strictly higher** PEP 440 version.
- Replacing a bundled package requires a higher version **and**
  `allow_override=true`.
- Active dependents must be disabled before upgrading their active dependency.
- The installer stages/validates before swapping. Registration failure restores
  prior files and attempts to reload the old active version. This does not undo
  arbitrary external side effects a malicious/broken plugin performed during
  load.
- Uninstalling an installed override can restore an underlying bundled package.
- Python modules are purged/reloaded as appropriate. Existing browser custom
  elements cannot be redefined, so a loaded new version is marked
  `reload-required` until the page is fully reloaded.

Frontend files have ETags based on package version, file size and nanosecond
mtime; a rebuilt bundle of the same version can change its ETag. The browser
module cache/custom-element registry is separate: this is not a supported
substitute for bumping the package version and reloading the page during an
upgrade.

## Validation commands

Run focused checks appropriate to your change. From `soup-packages/`:

```sh
npm run build:packages -- _template
npm test -- soup_base/app/test/graph-model.test.ts
```

From `soup-server/`, with `requirements-dev.txt` installed in your chosen
environment:

```sh
python scripts/lint.py ruff mypy vulture
```

Run `python -m pytest` with your package's actual test path when tests are
available. `pytest.ini` collects package `tests/` directories. The old shared
`soup-server/tests`
directory, `tests.fakes`, `tests.packages`, architecture-boundary test and
build-order test cited by the former guide are absent in this checkout. Some
older package tests still import those missing helpers; do not present the
entire pytest suite as known runnable without restoring/fixing its dependencies.

Broader commands, when needed, are `npm run lint` (ESLint, Knip, SDK type
check), `npm test` (Vitest/jsdom package and SDK tests), and
`npm run build:packages`. Per-package TypeScript checks run during package
builds. Existing unrelated tests may have stale expectations; distinguish
baseline failures from your regression. Do not introduce new dependencies,
fixtures or test infrastructure just to mirror an implementation. Validate
cleanup, malformed inputs, compatibility and isolation.

## Security boundaries

A package is trusted server and browser code. It can execute Python in the
server process and JavaScript in the application page. ZIP/path validation,
dependency checks, tool declarations, CORS and the client header do not create a
plugin sandbox or a general authentication/authorization system. Install only
trusted archives. Installation/uninstallation are disabled by default;
enable/disable management and ordinary action calls still use the existing
client-header/origin checks.

Use parameterized bounded graph queries, fixed identifiers/modes or validated
allowlists, and dataset-bound sessions. Neither `Query` nor `Database.execute`
automatically prevents writes. A read-only feature must enforce a closed
read-only API and account for Memgraph's on-demand rebuild lifecycle; see
[Graph Explorer](../graph_explorer/README.md). Never clear/drop a dataset
implicitly to recover from a failed request. Store scenes and application
preferences in application storage, not by adding graph nodes to an unrelated
dataset.

Render untrusted text through `textContent` or the SDK/shared components,
sanitize markup where needed, avoid logging uploaded rows/secrets, and expose
actionable safe errors. Follow [error handling](package-api.md#error-handling)
and release resources on disconnect/shutdown.
