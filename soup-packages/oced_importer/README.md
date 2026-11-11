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
files are not served, and there is no directory listing. A read-only LOAD CSV check
runs through Neo4j before any schema/data writes to validate actual reachability.

## Scope

`queries.py` contains the original loading/index/CORR/DF generators from
[ocean-lib commit 034006b](https://github.com/SaraPettinari/ocean-lib/blob/034006b621d4187f8d39b86ae02acde70f4d41c8/ocean_lib/query/init_query.py).
Only the generated CSV source literal is adapted to HTTP in `loader.py`.
Configuration binding is request-local; no vendor loader or runtime exec remains.

Use a dedicated database with no concurrent external writers: the original queries
are database-wide. A nonempty database shows Cancel / Delete existing dataset and
import new one. Explicit confirmation authorizes deletion of ALL nodes and
relationships, irreversibly, when SOUP's Import action runs. Confirmation is bound
to the current CSVs/options, expires after 15 minutes and is single-use. Changing
the configuration or retrying a failed attempt requires confirmation again.

SOUP validates all CSVs and their conversions through Neo4j, and compiles the
original import queries before deletion. It then executes exactly
`MATCH (e) DETACH DELETE e` once, separately from the import transaction. Deletion
failure stops the import. Import failure rolls back the new graph, cannot restore
the deleted dataset and never triggers another deletion. Existing indexes are kept. Neo4j must support the original functions, including `ID(e)`. Large imports
still use memory and one transaction within SOUP's upload limit.

Workspace deletion removes only its catalog entry. Source paths in metadata are
provenance, not reusable URLs. Neo4j uses its own catalog/package volumes; existing
Memgraph volumes/data are untouched. Old `ocean_ekg` catalog entries are not migrated
between deployment volumes automatically. This package provides import only, not analysis.
