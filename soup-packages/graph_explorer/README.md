# Graph Explorer

Optional `graph_explorer` visualizer for Memgraph EKG/derived EKG objects and
Neo4j OCED datasets. It adds **Graph Explorer** to the object's visualizer selector;
the existing EKG visualizer is unchanged. Enable/disable it through SOUP's package
manager. It requires the existing `soup_base` and `tool_storage` packages.

```sh
cd soup-packages
npm run build:packages -- graph_explorer
npm run pack -- graph_explorer
```

The normal package installer accepts `dist/graph_explorer-1.0.0.zip`. Repository
package discovery also finds it. No additional dependencies or database plugins.

## Safety and scope

Every graph operation binds `database.for_dataset(object.id)`. The server accepts
only named actions, validates parameters, and emits fixed read-only `MATCH` queries.
User input never becomes Cypher text. There are no graph edit, import, index,
procedure, or arbitrary-query actions. Neo4j uses `elementId`; Memgraph uses `id`.
Node references include the dataset identity and a property fingerprint: stale or
cross-dataset references fail instead of expanding a different node.

**Memgraph must already have the requested dataset loaded**, using its existing
Load EKG workflow. Explorer checks this under the existing lifecycle lock and
refuses to trigger the adapter's implicit clear/rebuild. Missing/lost graph state
requires an explicit load through that workflow. Neo4j reads its registered dataset
database directly, without falling back to the global default.

Scenes are JSON files under application storage
`graph-explorer/<object-id>/<scene-id>.json`. Save/load/duplicate/delete change only
these files. Scenes include their loaded graph snapshot, positions, pins, groups,
styles, filters, slicer, layout, coordinate properties, camera and selection.
A snapshot remains viewable after graph changes; use **Render query** before
exploring it if its identities became stale. Snapshots contain graph properties;
they inherit SOUP application's existing storage/access model.

## Controls

- Wheel zoom; blank drag pan; node drag moves the selection. Shift-click toggles
  selection; box/lasso modes select areas. The minimap also pans the camera.
- Expand selected nodes by direction, relationship type, depth and limit; reveal
  connections; find a bounded shortest path between two selected nodes.
- Fixed top-down hierarchical layout; pinned nodes remain fixed during layout.
  Layout work runs in a cancellable worker with a synchronous fallback.
- Node/edge colors, sizes, icons and property captions; conditional property rules;
  category legend; labels, types, property text and numeric/ISO datetime filters
  in hide/dim modes. Numeric/datetime slicer with scrubbing, playback and a sliding
  percentage window. ISO date/time display in the browser uses millisecond precision.
- Scene-only groups aggregate nodes and parallel relationships. Ungroup restores
  members. Inspector properties and connection counts are read-only.
- Loaded-scene degree, undirected PageRank and label-propagation communities.
  JSON exports the scene; CSV exports visible nodes and relationships; PNG exports
  the current Canvas. Undo/redo retains the last 20 scene states.

## Deliberate limits

The display holds at most 1,000 nodes and 2,000 edges. Searches scan at most 1,000
label-matching nodes; results are not an exhaustive database search. Expansions use
at most 50 seeds per hop and six hops, with bounded relationship results. Paths are
shortest within the explored neighborhood; truncation is reported and can exclude
paths in the full graph. Narrow relationship types and expand incrementally.

Analytics describe the loaded visible scene, not the entire database. This package
does not require or invoke GDS/MAGE procedures. Cancellation discards stale network
responses and terminates layout workers; SOUP's existing action API does not abort
an already-running server read. Saved scenes are capped at 2 MB each and 50 per
dataset. No natural-language Cypher generation or graph editing is provided.

## Graph Explorer query and styling update

- The initial view is blank: configure labels, relationship types and optional property predicates in **Query before rendering**, then click **Render query**. Refresh repeats the configured query. Query results replace the current scene, while expansion still adds neighbors. The server bounds the candidate scan to 1,000 nodes and returns matching relationships among the selected nodes (up to 2,000). Filters are read-only; the scan is not an exhaustive database-wide search on very large graphs.
- Hierarchical is the only layout. Reapply it using **Reapply hierarchy**; zoom, pan, selection and pinned positions remain available. Saved scenes with older layout values are normalized on load.
- Node colors use ordered, first-match-wins rules. Choose a label or property, condition (equals/contains/greater-or-equal/less-or-equal/between), color, and move rules up or down. The default color is the fallback.
- This package never creates, updates or deletes database graph data. Scene changes remain in SOUP application storage.

**Build note:** The uploaded standalone package archive does not contain the parent SOUP build configuration or `soup_base` sources. Regenerate `app/dist/` using the SOUP `build:packages` command before deploying the changed frontend.
