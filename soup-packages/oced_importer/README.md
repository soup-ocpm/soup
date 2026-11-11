# OCED event-log importer (Neo4j)

Upload an event CSV on SOUP's import page and choose **OCED event log (Neo4j)**.
Select event roles and object-reference columns. Each type independently uses an
object CSV/ID column or generated distinct IDs. Review types and prepared tables,
then use SOUP's Import action. No object CSV or modal is required.

Source timestamps map to `eventDatetime`. References are split on commas, trimmed,
and filtered for nulls; IDs keep leading zeros. Object ID columns map to `wyId`
(or the selected entity-ID attribute). Cross-type collisions are rejected because
the original CORR query matches by ID alone. Configuration is generated internally.

## Temporary HTTP CSV access

Use the standalone configuration, not an overlay on the Memgraph configuration:

```sh
export NEO4J_URI=bolt://your-neo4j-host:7687
export NEO4J_USERNAME=neo4j
export NEO4J_PASSWORD='your-password'
export NEO4J_DATABASE=neo4j
# Resolved and fetched BY NEO4J, not by the browser or SOUP.
export SOUP_NEO4J_CSV_BASE_URL=http://your-soup-host:8081
export SOUP_NEO4J_CSV_BIND_ADDRESS=0.0.0.0
docker compose -p soup-neo4j -f docker-compose.neo4j.yaml up --build
```

For Desktop on the SOUP host, explicitly use `http://127.0.0.1:8081` and the default
loopback bind. For Neo4j in Docker Desktop, commonly use
`http://host.docker.internal:8081` and the externally reachable bind above. For a
remote Neo4j server, configure reachable DNS/IP, port forwarding and firewall rules.
Use an HTTPS reverse proxy for untrusted networks; forward its CSV path to port 8081.
Neo4j needs HTTP(S) LOAD, graph-write and index permissions. No filesystem mount is needed.

CSV content is temporary and in-memory: random capability URLs expire after one
hour and are revoked after success or failure. Tokens are not logged, configuration
files are not served, and there is no directory listing. Read-only EXPLAIN checks compile all original queries before loading. Each CSV is
fetched and converted once by its real LOAD CSV query; HTTP/type failures identify
the failing load without clearing any database.

## Scope

`queries.py` contains the original loading/index/CORR/DF generators from
[ocean-lib commit 034006b](https://github.com/SaraPettinari/ocean-lib/blob/034006b621d4187f8d39b86ae02acde70f4d41c8/ocean_lib/query/init_query.py).
Only the generated CSV source literal is adapted to HTTP in `loader.py`.
Configuration binding is request-local; no vendor loader or runtime exec remains.

Each import creates a new database through `system`, using a sanitized name and the
SOUP dataset UUID. Neo4j Enterprise multi-database support and CREATE/DROP DATABASE
permissions are required, in addition to access, graph-write, LOAD CSV and index
permissions. The catalog records the exact database name and ownership before loading.
Failed imports remain marked as incomplete so their database can be explicitly deleted.
Do not write to these databases concurrently: the original queries are database-wide.

All graph operations explicitly select the dataset database. `NEO4J_DATABASE` is not
a dataset fallback. Older entries without a database mapping must be reimported or
explicitly mapped by an administrator; SOUP never guesses their database.

Workspace deletion warns that the registered database and ALL its nodes and
relationships will be irreversibly dropped, and requires explicit confirmation.
Protected (`system`, `neo4j`), shared and unmanaged databases cannot be dropped.
Failed deletion retains the catalog entry. Import failure never automatically drops
a database. Removing an entry whose package is unavailable with the catalog-only
option leaves its database untouched.

CSV checks, index setup and original Event/Entity/CORR/DF queries run only in the
new dataset database. Neo4j must support the original functions, including `ID(e)`.
Each unchanged loading/CORR/DF query commits separately to release transaction memory;
Event rows still load in one query, preserving internal-ID tie ordering. A failed
step leaves earlier commits in the dedicated database, marked incomplete and blocked
from graph visualization. SOUP never automatically clears, retries or resumes it.
A single large LOAD CSV or relationship query can still exceed Neo4j memory/time limits;
row batching would require changing the original queries and is not enabled.

Phase durations, per-step completion/failure, commit time and HTTP request/byte counts
are persisted in catalog `process_info`, including failed imports. Backend logs show
phase starts and finishes without polling. HTTP timing measures server write time,
overlapping Event/Entity loading, not isolated Neo4j parsing/network latency.
CSV preparation and database creation are included in the total import duration.
Source paths in metadata are provenance, not reusable URLs. Memgraph volumes/data
and queries remain unchanged. This package provides import, not analysis.
