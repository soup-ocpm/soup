# tool_memgraph

Backend compatibility: **memgraph**. Required packages: None. Manifest-level
tools: None. See the [manifest](soup-package.json) for Python requirements.

## Native Memgraph lifecycle tool

[server/api.py](server/api.py) exports `MemgraphTool`, the `GraphDatabase` port,
`Query`, `ident`, `Run`, `Loader` and `MEMGRAPH_TOOL`. Direct imports require
`tool_memgraph` in `requires`; accessing the tool requires `memgraph` in
`requires_tools`. The EKG API also re-exports `Query`, `ident` and the port.

| Method                                          | Behavior                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run(query)`                                    | Executes a parameterized `Query`, returning `list[dict[str, Any]]`.                                                                                                                         |
| `session()`                                     | Context manager holding the reentrant operation/lifecycle lock across multiple calls.                                                                                                       |
| `health()`                                      | Returns health and the remembered state; query failure is returned as an error, not raised.                                                                                                 |
| `is_loaded(state_key)`                          | Checks state and node presence; forgets state if the graph was lost.                                                                                                                        |
| `ensure_loaded(state_key, loader, force=False)` | Under the lock, clears/reloads when necessary; invokes `loader(run)` and marks the state only after success.                                                                                |
| `advance(from_state, to_state, mutate)`         | Requires the expected loaded state and a nonempty graph; invokes `mutate(run)` under the lock. A mismatch raises `ConflictError` without mutation. A mutation failure leaves state unknown. |
| `current_state()`                               | Returns the remembered key without checking database contents.                                                                                                                              |
| `clear()` / `invalidate()`                      | Clear graph and state / forget state without deleting data.                                                                                                                                 |
| `close()`                                       | Waits behind tool operations and closes its shared backend connection.                                                                                                                      |

Connection settings are `MEMGRAPH_HOST` (default `memgraph`) and `MEMGRAPH_PORT`
(default `7687`). `MemgraphDatabase` is a compatibility adapter over the host's
shared Cypher connection; it no longer owns a second driver. Connections are
lazy and reused. Shutdown waits for active sessions. The EKG package owns
dataset rebuild/state restoration; the tool's state key is opaque.

Parameterize values, escape validated identifiers with `ident`, and choose
operators/types from fixed allowlists. `ident` accepts `[A-Za-z_][A-Za-z0-9_]*`
and backtick-quotes it; it is intentionally stricter than all identifiers a
graph server might allow. `Query` and the tool do not enforce read-only Cypher.

For new dataset-scoped package operations, prefer
`ctx.database.for_dataset(obj.id)` from the
[database contract](../docs/package-api.md#dataset-bound-database-access). Use
native lifecycle operations only when the feature actually needs them.

See the [package developer documentation](../README.md) for authoring, packaging
and lifecycle rules.
