# Ocean aggregation for SOUP Studio

This optional Neo4j-only package aggregates an already imported OCED dataset.
It requires `oced_importer` and `soup_base`. If `SOUP_PACKAGES` is explicitly
configured, include these packages and their required providers.

## Configure and run

1. Select a completed OCED dataset and open **Ocean aggregation studio** from
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
   If Class nodes already exist, explicitly confirm irreversible replacement of
   all Class nodes and their attached relationships in this dataset. Event and
   Entity source nodes remain. Cancel leaves the graph unchanged.
   Replacement happens only after the name and full configuration pass backend
   validation. A deletion failure stops the operation without starting aggregation.
   This calls SOUP's existing
   operation API with the original source object ID and opens the saved result
   object. The operation remains bound to that dataset if the active workspace
   changes. Validation failures leave the graph untouched. A query failure after
   execution starts may leave partial aggregation; no automatic clear or retry
   is performed.

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
attributes. Node details use Neo4j element identities within the result's dataset
context. **Refresh graph** reloads the bounded view.

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

- All graph access resolves through SOUP's dataset database abstraction. No
  global default database is used for graph queries.
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
- Existing Class nodes require explicit replacement confirmation (or the
  **Delete existing Class nodes before aggregation** checkbox in the operation
  form). Foreign source nodes, missing source data, or Class nodes also labeled
  Event/Entity cause rejection. No complete database clear is performed.
  Previous result objects retain their names and settings, but their graph view
  shows the dataset's current aggregation, not a historical graph snapshot.
  A failed aggregation after deletion does not restore the previous Class nodes.
  Deleting a result object does not undo aggregation.
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
