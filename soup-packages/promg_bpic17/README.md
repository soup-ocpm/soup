# PromG BPIC 2017 importer for SOUP Studio

This package registers [**PromG — BPI Challenge 2017 (Neo4j)**](https://github.com/PromG-dev/ekg_bpic17) in SOUP Studio's import page.
It uses the same PromG 2.2.3 graph construction calls as `PromG-dev/ekg_bpic17`:
`DBManagement.set_constraints()`, `OcedPg.load_and_transform()` and `OcedPg.create_df_edges()`.
The original semantic header and dataset description are bundled with the package (the data source directory is adjusted to the uploaded CSV).

## Prerequisites

1. SOUP configured for **Neo4j Enterprise** with multi-database support. Credentials are inherited from SOUP's `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` environment variables via SOUP `DatabaseConfig`, never entered separately.
2. Install `promg==2.2.3` in the SOUP **server's Python environment** and restart SOUP. The package ZIP installer does not pip-install dependencies. On Docker, add `promg==2.2.3` to `soup-server/requirements.txt`, rebuild and restart the server.
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

## Upstream

- https://github.com/PromG-dev/ekg_bpic17
- https://github.com/PromG-dev/promg-core
- `promg==2.2.3` (the upstream's requested release)
