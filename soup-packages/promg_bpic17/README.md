# PromG BPIC 2017 importer for SOUP Studio

This package registers [**PromG — BPI Challenge 2017 (Neo4j)**](https://github.com/PromG-dev/ekg_bpic17) in SOUP Studio's import page.
It uses the same PromG 2.2.3 graph construction calls as `PromG-dev/ekg_bpic17`:
`DBManagement.set_constraints()`, `OcedPg.load_and_transform()` and `OcedPg.create_df_edges()`.
The original semantic header and dataset description are bundled with the package (the data source directory is adjusted to the uploaded CSV).

## Prerequisites

1. SOUP configured for **Neo4j Enterprise** with multi-database support. Credentials are inherited from SOUP's `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` environment variables via SOUP `DatabaseConfig`, never entered separately.
2. Review this package’s `requirements.txt` and explicitly approve dependency installation when installing/enabling it. For Docker build/startup approval, see [Python dependencies](../docs/lifecycle.md#python-dependencies). Do not add package libraries to core server requirements.
3. The upstream BPIC17 importer specifies **Neo4j <=5.9.0**, APOC; compatibility with later versions is NOT validated. The CSV adapter uses native Neo4j `LOAD CSV WITH HEADERS` and adds no APOC dependency. Other upstream graph-construction queries still require their original APOC procedures.
4. Input is the *normalized* `BPI_Challenge_2017.csv` from Esser and Fahland's dataset, not an arbitrary BPIC17 XES export. The bundled descriptors map columns such as `case`, `event`, `time`, `EventOrigin`, `EventID`.

## Installation and use

Upload **this package ZIP** through SOUP Studio's package manager. On Import, choose **PromG — BPI Challenge 2017 (Neo4j)** and upload the normalized CSV. SOUP creates a new dedicated database named `soup-...` and associates it with a workspace dataset. The package passes the exact dataset database name, URI, username and password from SOUP to PromG.

SOUP does NOT let PromG clear the configured default database. Instead it creates an empty database and applies the original PromG constraints and construction stages. If the pipeline fails, the catalog keeps the dataset flagged `failed`; SOUP never silently deletes or clears databases.

## SOUP EKG interoperability (new in this package)

After PromG completes successfully, `server/normalize.py` **projects** its graph
into the common SOUP Neo4j EKG vocabulary, without deleting original PromG data:

- `:Entity:Application` etc. acquire `Type` and `Value` properties. Native `sysId`
  and other properties and labels remain unchanged. This includes reified `CASE_*`
  nodes when they are also `:Entity`.
- Events acquire `ActivityName`, `Timestamp`, and `Event_Id` aliases. Timestamps
  retain their original datatype: the adapter does not guess timezone semantics.
- Native `DF_APPLICATION`, `DF_OFFER`, `DF_WORKFLOW`, `DF_RESOURCE`, and the
  semantic-header-defined `DF_CASE_*` relationships have corresponding new
  `:DF {Type: ...}` relationships, preserving original edge properties and
  multiplicity. Source relationships are left in place. Re-running normalization
  does not duplicate projections; counts are checked against original types.
- Existing `CORR` edges acquire `Type` if missing. All native nodes receive the
  dataset's `Log` ownership marker. Writes are chunked for large datasets.
- The resulting workspace entry uses `oced_importer.log`, SOUP's **shared Neo4j
  EKG kind**, and the usual `log_config` / `ekg_config` metadata. The metadata
  retains `source: PromG-dev/ekg_bpic17` and the original importer provenance.

As a result, `ekg_views`' Graph / Statistics / Queries and Graph Explorer can
recognize new imports without changing their implementations. Ocean aggregation
can also recognize the dataset kind and configuration, but its full semantic
correctness must be verified on a real BPIC17 graph. Other workflows that
require Memgraph, OCEL qualifiers, or OCED-specific structures are **not**
automatically supported. In particular, reified `CASE_*` objects are not
converted into `:REL` edges: such a conversion requires a semantic mapping.

### Already-imported BPIC17 graphs (no re-upload)

The package contributes the operation **Normalize existing PromG BPIC17 EKG for
SOUP**, applicable to *completed* `promg_bpic17.ekg` datasets imported with the
previous package. Select the old dataset in Workspace, choose this operation,
and explicitly confirm. It normalizes the existing dataset database **in place**,
updates the original catalog object to kind `oced_importer.log` (keeping its ID,
provenance, and ownership), and produces a small result report. Refresh Workspace
to see the new visualizers. No second dataset database or CSV upload is created.

The native relationships remain, so the graph temporarily contains both native
and projected DF edges; expect additional storage usage. Do not repeat the
entire PromG import for this migration. Back up the graph before first use.

**Validation limitations:** package imports and Python syntax were checked, but
we could not execute BPIC17 with PromG+Neo4j against a populated database in
this environment. Test on a backup before deploying the migration to valuable data.

## Neo4j compatibility diagnostics

Neo4j 2026.06.0 rejects PromG 2.2.3's constraint option
`OPTIONS { indexProvider: 'range-1.0' }`. The package removes only this obsolete,
sole provider hint from `CREATE CONSTRAINT` statements. Constraint names, labels,
properties, uniqueness and graph-construction queries are retained. Adapted schema
statements are checked with `EXPLAIN` before execution.

Failures log the exact submitted query, phase, generator, selected database and
parameter names. Passwords, connection URI and HTTP capability tokens are redacted;
parameter values are not logged. The original schema query is also logged when an
adapted constraint fails. Logs distinguish schema compatibility from HTTP CSV errors.

Read-only validation on Neo4j 2026.06.0 reproduced the original provider-option
failure and passed both adapted constraint generators, the CSV loading query and
its native CSV reader. No schema or graph changes were executed during validation.
Neo4j reports `apoc.periodic.iterate` as deprecated; the original batching call is
retained. This does not establish compatibility of every later PromG transformation.

## Temporary HTTP CSV transport

No Neo4j import-directory mount or filesystem import setting is required.
PromG writes intermediate partitions once into a private local temporary directory;
the package streams these files over HTTP without loading another full copy into RAM.
The adapter replaces only the CSV reader inside PromG’s generated query with native
`LOAD CSV WITH HEADERS`, preserving its type conversions and empty-value handling.
The existing batching and record-creation clauses remain unchanged.
The original semantic descriptors, mappings, transformations and DF queries remain unchanged.

Set `SOUP_NEO4J_CSV_BASE_URL`, as for SOUP's OCED importer, to an HTTP(S) address
reachable **from Neo4j**, including the CSV port. The default listening port is 8081.
Do not assume localhost works between containers or remote hosts. TLS can be supplied
by a reverse proxy; retain any configured URL path prefix when proxying requests.
Neo4j must allow outbound HTTP. Neither the connectivity check nor CSV loading uses
`apoc.load.csv`; APOC Extended is not required for CSV access. The unchanged upstream
pipeline still uses APOC procedures such as `apoc.periodic.iterate`. Removing those
would require changing graph-construction queries and is outside this adapter.

The transport starts only during a worker run and stops afterward. If OCED is already
serving on port 8081, or concurrent PromG imports need independent ports, the import
fails clearly rather than replacing another server. Configure `SOUP_PROMG_CSV_PORT`
and `SOUP_PROMG_CSV_BASE_URL` for a separately exposed endpoint in that deployment.
These optional settings must reach the server process. No Compose files are changed
by this package. There is no supported cross-package shared-server API to reuse.

Each run uses an unguessable URL token, disables directory listings and access logging,
and serves only explicitly registered CSVs. A small HTTP read through Neo4j verifies
connectivity before graph construction. Treat the URLs as temporary credentials;
use a trusted network or HTTPS. The server shuts down before its temporary directory
is removed, including on import failure. A worker timeout terminates the serving process
and the parent removes temporary files. Abrupt termination of the entire SOUP container
can leave temporary files until its temporary storage is cleaned.

The configuration file is private (0600), credentials come exclusively from SOUP,
and every graph query targets the dedicated dataset database. The adapter bypasses
PromG 2.2.3's incorrect username-as-database factory and propagates query/APOC batch
errors instead of reporting incomplete imports as successful. Backend diagnostics contain
bounded, credential/token-redacted output, the failing phase, dataset and database.
Failed datasets stay registered as failed; the package never clears a database.

Remove any old `/neo4j-import` bind mount from your deployment separately; this package
no longer uses it. In particular, avoid exposing an entire Neo4j Desktop DBMS directory
to SOUP. The obsolete package Compose override has been removed.

Validation covers the HTTP adapter, file access restrictions, cleanup, installed PromG
CSV output and CSV-reader-only query adaptation. A full BPIC17 import still requires a compatible
Neo4j/APOC deployment and the normalized dataset.

## Profiling and normalization performance

`process_info.duration_seconds` now retains `database_creation`, `csv_preparation`,
`promg_constraints`, `promg_loading_transform`, `promg_df`, `normalization`,
`normalization_nodes`, `normalization_corr`, `normalization_df`, `csv_query_adapter`,
`http_transfer`, and `total` where those phases completed or raised an error.
CSV preparation includes upload staging, PromG preprocessing and intermediate CSV
serialization. It overlaps the loading/transformation phase; HTTP send time and
query times also overlap enclosing phases and must not be summed into a total.
`process_info.promg_queries` records calls and wall time by upstream generator;
`process_info.http` records requests and server-side send time. Worker metrics are
saved at phase boundaries and collected on success, failure or timeout. An abruptly
killed worker cannot record the duration of its currently running phase.

Normalization uses sequential native `CALL { ... } IN TRANSACTIONS` with at most
10,000 source rows per commit (configurable through the existing Python argument).
It must run through `Database.execute`, not an explicit transaction. Each phase scans
its input once rather than restarting a marker-filtered scan after every batch.
Completion checks run inside the bounded transaction: EXPLAIN on Neo4j 2026.06.0
confirmed this avoids a graph-sized outer Eager buffer for DF projection. Any Eager
operators inside the subtransaction are limited to that batch. No marker indexes
are added: ordinary property indexes do not index missing marker values.

Existing marker properties and atomic projection/provenance writes are retained.
Completed DF batches are skipped on retry, including parallel native relationships;
no MERGE collapses their multiplicity. Validation compares native and projected DF
counts, using one grouped projected-edge scan rather than one full scan per type.
Native PromG properties, labels, timestamps, event order, typed DF construction and
SOUP compatibility properties/relationships remain unchanged. This does not add a
UI or automatic retry for the whole upstream mining pipeline; it keeps normalization
safe to invoke again after interruption.

SOUP disables PromG's unused preprocessed pickle cache (`store_files=False`): these
private files were never read with `use_preprocessed_files=False` and were discarded
after every run. A 100,000-row synthetic frame demonstrated a 13,001,300-byte redundant
write (0.0079 seconds on the test machine); this is an I/O measurement, not a full
BPIC17 import speedup. The HTTP adapter still streams each generated file without
an extra full-file copy or repeated download. The original `apoc.load.csv` procedure
is absent on the checked Neo4j instance, so a live original-reader comparison was
not possible; the required native reader and datatype/null conversions are retained.
Connection pooling, original batch size and mining queries are not changed.

Run the offline structural check with:

```bash
PYTHONPATH=soup-server python soup-packages/promg_bpic17/validate_normalization.py
```

Fresh/idempotent and interrupted/retried graph checks are opt-in integration tests.
They create and drop only a uniquely named `soup-promg-test-*` database and require
multi-database privileges. Run them only on an explicitly authorized test instance:

```bash
SOUP_PROMG_TEST_CREATE_DATABASE=1 PYTHONPATH=soup-server python soup-packages/promg_bpic17/validate_normalization.py
```

The integration checks use SOUP's Neo4j credential environment variables. They were
not run against the external database: automatic approval rejected test database
creation/deletion. Offline structural tests, Ruff and 34 read-only EXPLAIN checks
passed. Full graph equivalence, interrupted-write tests and end-to-end speed relative
to standalone PromG remain unmeasured until an authorized test instance is available.

## Upstream

- https://github.com/PromG-dev/ekg_bpic17
- https://github.com/PromG-dev/promg-core
- `promg==2.2.3` (the upstream's requested release)
