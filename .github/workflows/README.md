# CI

`ci.yml` runs on every push and pull request, with one job per area (they run in parallel; a new
push to the same branch cancels the run still going):

| Job | What it runs |
|---|---|
| `backend` | `pip install -r requirements-dev.txt`, `python -m pytest` on Python 3.10 and 3.12.16; `python scripts/lint.py` (ruff, vulture, mypy `--strict`, zero messages) on 3.12.16. |
| `packages` | In `soup-packages`: `npm ci`, `npm run lint`, `npm test`, `npm run build:packages`, `npm run pack -- ocel`. |
| `app` | In `soup-app`: `npm ci`, `npm run lint`, `npm run test:v3` (Vitest), `npm run build` (production), `npm run e2e` (Playwright with Chrome, on the e2e backend of `soup-server/tests/e2e_server.py`, run with the `python` of `setup-python`, which has `requirements.txt`: there is no `soup-server/.venv` in CI and `SOUP_PYTHON` is not set; the backend checks the versions of Flask, Werkzeug, pandas and numpy at startup). On failure the Playwright results are kept as an artifact. |
| `memgraph` | The two `memgraph_smoke.py` (`ekg_views`, `ekg_analysis`) on a `memgraph/memgraph` service. |
| `docker` | Builds the two images of `docker-compose.yaml` (`soup-server/Dockerfile`, `soup-app/Dockerfile`) from the repository root, without pushing them. |

Versions: Python and Node are those of the Dockerfiles (`python:3.12.16-slim`, `node:24.22.0-alpine`,
as `PYTHON_VERSION` and `NODE_VERSION`), Memgraph the tag of `docker-compose.yaml`.
`soup-server/tests/test_ci_workflow.py` fails when one of them changes and the workflow does not:
update them together.

Caches: pip (keyed on the `requirements*.txt` files), npm (on the `package-lock.json` files) and the
Docker layers (`type=gha`, one scope per image).
