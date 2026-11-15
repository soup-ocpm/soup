# Ocean aggregation for SOUP Studio

This optional package aggregates selected Neo4j OCED datasets and Memgraph EKG
datasets. It requires `soup_base` and `tool_storage` (the normal catalog/storage
provider). Neo4j source logs are imported with `oced_importer`; Memgraph source
logs use the existing `ekg` workflow. There is no hard dependency on either
backend-specific importer, so Neo4j-only deployments remain supported.

For Memgraph, enable `ekg` before enabling Ocean. The package contributes an
`ocean_aggregation.state` provider to `ekg.state_providers` while registering.
Normal bundled startup loads the required providers first. If `ekg` is enabled
or re-enabled later at runtime, re-enable `ocean_aggregation` afterward to register
its state provider; a missing provider produces an explicit error before writes.

## Configure and run

1. Select a completed Neo4j OCED or Memgraph EKG dataset and open **Ocean aggregation studio** from
   its visualizer selector.
2. Add ordered entity and/or event aggregation steps. Select a step to edit it
   in the **Properties** panel. Move steps up/down to change execution order.
3. Choose an entity type, grouping properties, optional AND conditions, and
   optional attribute aggregations. Entity properties are retrieved from the
   selected dataset for that specific entity type. Changing the type retains
   valid selections and removes grouping/filter/attribute selections that are
   unavailable in the new type. Stale schema responses cannot overwrite a newer
   selection.
4. The panel's live **OCEAN syntax preview** shows the statements in execution
   order, using the actual selected values:

   ```text
   AGGREGATE ENTITIES OF <selected type> BY <selected properties> [WHERE <selected conditions>] [WITH (<selected attribute> AGGREGATED BY <selected function>, ...)]
   AGGREGATE EVENTS BY <selected properties> [WHERE <selected conditions>] [WITH (<selected attribute> AGGREGATED BY <selected function>, ...)]
   ```

   The preview is descriptive text, not executable Cypher. The underlying
   `AggrSpecification`/`AggrStep` representation and execution order are unchanged.
5. Choose **Run aggregation and open graph**, then enter an aggregation name.
   The successful result is saved under that name with its ordered configuration.
   For Neo4j, existing Class nodes require explicit confirmation of irreversible
   replacement of those nodes and their attached relationships. Event and Entity
   source nodes remain. Cancel leaves the graph unchanged.
   For Memgraph, select an unaggregated EKG source. Existing Class nodes are
   rejected, and result objects are never accepted as aggregation inputs.
   Replacement happens only after the name, full configuration, and original
   query plans pass backend validation. A deletion failure stops the operation without starting aggregation.
   This calls SOUP's existing
   operation API with the original source object ID and opens the saved result
   object. The operation remains bound to that dataset if the active workspace
   changes. Validation failures leave the graph untouched. A query failure after
   execution starts may leave partial aggregation; no automatic clear or retry
   is performed.

Memgraph results are derived EKG states: SOUP restores the selected parent and
replays the saved aggregation when switching back from another dataset. An
already-loaded result is reused rather than aggregated again. Failed mutations
use the existing EKG compensation path to rebuild the parent. This restoration
uses the EKG loader's locked executor; it does not open a standalone OCEAN driver.
Deleting a Memgraph result clears it only if it is the active state, preserving
other loaded datasets and the source's staged files.

The existing **Operations → Ocean aggregation** form remains available. Use the
studio view for the live syntax preview and entity-specific property choices.
Server-side validation checks those choices on either execution path. The
package does not infer execution order from the list of available step types.

## Class graph

The result opens in **Ocean class graph**. Like `ekg_views`, it uses
`soup_base`'s `<soup-graph-view>` and its Dagre hierarchical renderer, preserving
zoom, pan, selection, search, shape controls, SVG export and the property
inspector. It displays `Class` nodes and `DF_C` relationships, with class names,
member counts, and all stored node/relationship properties, including aggregated
attributes. Node details use Neo4j element identities or Memgraph numeric identities
serialized as strings, always within the result's dataset context. **Refresh graph** reloads the bounded view.

The display contains at most 300 Class nodes and 700 DF_C relationships whose
endpoints are displayed. It is a bounded view, not an export of the full graph.
`CORR_C` is still created by OCEAN but is not drawn in this DF_C view.
Parallel DF_C relationships between the same ordered pair of Class nodes are
shown as one connection labeled with their multiplicity. This avoids a Dagre
parallel-edge layout failure. Every original relationship ID and its properties
remain in that connection's `relationships` data; the backend response and graph
database are unchanged. The header distinguishes relationships from drawn
connections. Empty graphs and drawing failures show an explicit message.

## Integration and limitations

- All graph entry points resolve with `database.for_dataset(object.id)`. No
  global default database is used. Neo4j also validates exclusive source-log
  ownership before discovery or visualization; Memgraph uses EKG's dataset lock,
  graph keys, and state-rebuild lifecycle.
- The adapter configures native Memgraph names (`Event_Id`, `ActivityName`,
  `Timestamp`, `Entity.Value`, `Entity.Type`) or the OCED log's configured property
  names. It does not rename source properties or translate OCEAN Cypher.
- The adapter bypasses OCEAN's standalone connection, graph initialization and
  index setup. Original modules in `server/ocean_lib/`, including every query
  generator and aggregation algorithm, are unchanged.
- Event aggregation requires entity grouping context: add an entity aggregation
  before the event step, or include an object-reference column in event grouping.
  The original generator does not support event-only grouping without that
  context; the adapter rejects it before any writes.
- Entity filters require an entity type. Property/type identifiers must be safe
  identifiers. String conditions cannot contain apostrophes, backslashes or
  control characters because the original query embeds WHERE text in a
  single-quoted property. Numeric and boolean condition values are supported.
- Neo4j existing Class nodes require explicit replacement confirmation (or the
  **Delete existing Class nodes before aggregation** checkbox in the operation
  form). Foreign source nodes, missing source data, or Class nodes also labeled
  Event/Entity cause rejection. No complete Neo4j database clear is performed.
  Neo4j results retain settings but display the dataset's current aggregation;
  failed replacement does not restore deleted Class nodes. Deleting a Neo4j
  result does not undo aggregation. Memgraph results instead use saved derived
  states and never delete existing Class nodes before running over them.
- `SUM`, `AVG`, `MIN`, `MAX` and `MULTISET` were checked against both engines.
  `SUM`/`AVG` require numeric source properties; native CSV EKG extra properties
  are normally text and are rejected by a read-only probe rather than coerced.
  Choose functions appropriate to the stored property types.
- `MINMAX` is unavailable on both engines: its original generator emits literal
  expression strings instead of computed minimum/maximum values. The adapter
  rejects it; the generator remains unchanged.
- Original aggregation queries are planned with `EXPLAIN` before writes. A server
  that lacks a required construct is rejected explicitly. OCEAN's standalone
  initialization/index/CSV-loading queries are intentionally never executed.
- Neo4j and PyYAML are declared Python dependencies and must already be installed
  for runtime ZIP installation. Graph mutations happen only when running the
  existing aggregation operation, not during configuration or visualization.

From `soup-packages/`:

```sh
npm ci
npm run build:packages -- ocean_aggregation
npm run pack -- ocean_aggregation
```

The package has no additional npm dependencies. The existing workspace builds
`app/src/index.ts` into `app/dist/index.js`, including the studio and Class graph
wrapper. The archive is `dist/ocean_aggregation-1.0.0.zip`. Rebuild the backend
image for bundled deployment; runtime upgrades follow SOUP's package version and
browser reload rules. A full integration check requires a compatible live Neo4j
instance with an imported OCED graph.

## Validation

From `soup-server/`:

```sh
python -m unittest discover -s ../soup-packages/ocean_aggregation -p test_backends.py -v
```

The two live engine tests are opt-in through `OCEAN_TEST_NEO4J_URI` and
`OCEAN_TEST_MEMGRAPH_URI`, with authentication disabled on disposable test
instances only. Each test refuses a nonempty target and rolls back its synthetic
fixture transaction. Never point these test variables at production databases.
The default checks need no database. Validation used isolated Neo4j 5.26 and
Memgraph 3.13.2 engines, including original query values, filters, OBS/DF_C/CORR_C
creation, graph identities, numeric-type rejection, and planning without writes.
The real Memgraph package lifecycle was additionally checked across A → B → A
and against attempts to aggregate an existing result. No external user Neo4j
server or existing Memgraph volume was modified.
