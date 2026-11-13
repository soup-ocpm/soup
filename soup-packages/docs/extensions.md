# Cross-package extensions and EKG integration

[Documentation index](../README.md) · [Contracts and tools](package-api.md)

Choose the narrowest existing integration point. A file-processing package does
not need an EKG dependency just because it can also run in a Memgraph
deployment. A package declaring both backends must not unconditionally import a
Memgraph-only package or run its Cypher against Neo4j.

## Public Python APIs

A package's `server/` module is loaded as `soup_pkg_<manifest name>`. Within
that module use relative imports. For another package, use its public `api.py`
and list that package in `requires`, so it is active before your module is
imported. Do not reach into another package's private implementation files or
import the Angular host. Stable host imports normally come from
`soup.core.contracts` (including the `contracts.database` submodule).

For example, importing `StorageTool` from `soup_pkg_tool_storage.api` requires
`tool_storage` in `requires`; calling `tools.typed("storage", StorageTool)` also
requires `storage` in the package **and contribution** `requires_tools` lists.
Importing the abstract `Catalog` from core contracts does not require a direct
provider import; using the `catalog` tool still requires its tool declaration.

Tools give access to a service; `requires` gives an explicit package dependency.
They are not interchangeable. Provider ordering is also inferred from declared
required tools, but this does not make undeclared public module imports a
supported cross-package API. No library dependencies are installed
automatically.

## Extension points

The owner declares the point in its manifest's `extension_points` and calls
`ctx.add_extension_point(name)` during registration. It can export the name and
contribution contract from its public `api.py`. Contributors require that owner
and call `ctx.contribute(point, item, key, order=0)`; they do **not** add the
consumed point to their own `extension_points` declaration.

The owner reads `ctx.contributions(point)`, which returns items ordered by
explicit `order`, then registration sequence. Keys must be unique within a
point, and point names are global. Unknown points and duplicate keys fail. There
is no generic per-point type checker: the owner defines/validates its
contribution protocol. The current registry does not reject ties in `order`; use
distinct meaningful values when order matters.

Contributions, subscriptions and owned extension points are removed on unload. A
consumer that needs dynamic enable/disable behavior should capture the
`ctx.contributions` callable and read it when serving a request/build, instead
of freezing a list during registration. The EKG pipeline and views follow this
model.

See
[extension registry implementation](../../soup-server/soup/core/extension_points.py)
and [registration facade](../../soup-server/soup/core/plugin_context.py).

## Events

Use `ctx.subscribe(event, handler, critical=False)` and
`ctx.publish(event, payload)`. Handlers run synchronously in subscription order.
The payload is a shallow read-only mapping view; nested objects are not
recursively frozen. A noncritical handler failure is logged and remaining
handlers run. A critical failure propagates immediately to the publisher and
stops later handlers. Critical subscriptions can veto work only if the publisher
honors the failure/compensates; events are not database transactions.

Current core events:

| Name                   | Payload / timing                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `object.created`       | `{object: ObjectRef.to_dict()}` after registration                                             |
| `object.before_delete` | `{object: ObjectRef.to_dict()}` before disposal/catalog removal; critical subscribers can veto |
| `package.loaded`       | `{package, version}` after successful registration                                             |
| `package.unloaded`     | `{package, version}` after contribution removal                                                |

Domain event names belong to the publishing package's public API. Importing its
constant requires that package in `requires`. An optional observer can subscribe
by the documented event-name string without a code dependency, but receives
nothing when the publisher is absent. A manifest has no separate event-name
list.

For an events-only `object_observer` package (`server/plugin.py`, plus
`server/__init__.py`), use this manifest:

```json
{
  "name": "object_observer",
  "version": "1.0.0",
  "api_version": "4.0",
  "label": "Object observer",
  "description": "Observe object creation.",
  "author": "SOUP",
  "databases": ["memgraph", "neo4j"],
  "requires": [],
  "requires_tools": [],
  "provides_tools": [],
  "extension_points": [],
  "python_dependencies": [],
  "server": { "module": "server", "plugin": "plugin:Plugin" }
}
```

Its complete plugin is:

```python
import logging
from collections.abc import Mapping
from typing import Any

from soup.core.contracts import PluginContext, SoupPlugin


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        ctx.subscribe("object.created", self.created)

    def created(self, payload: Mapping[str, Any]) -> None:
        # Do not log object metadata or uploaded values.
        obj = payload.get("object", {})
        logging.getLogger("object_observer").info("Object registered: %s", obj.get("id"))
```

The subscription is attributed to the package, so unload removes it. No catalog
or storage tool is accessed. Noncritical observation is appropriate here because
a logging failure must not invalidate an already-created object.

## Memgraph EKG extension map

These are **Memgraph** integration contracts. The existing Neo4j OCED importer
has a separate loading workflow and original query generators; do not translate
or repurpose those queries as EKG build steps.

| Goal                                                               | Existing extension / reference                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Construct a Memgraph EKG from event tables                         | `build_ekg` and event-log types in [ekg](../ekg/README.md)                                                                |
| Add a construction phase                                           | `ekg.build_steps`, `EkgBuildStep`, `BuildContext`; see [causal_df](../causal_df/README.md) and [ocel](../ocel/README.md)  |
| Reapply a derived graph's transformation after a dataset switch    | `ekg.state_providers`, `StateProvider.apply(spec, db)`; see [ekg_class_graph](../ekg_class_graph/README.md)               |
| Add analysis conditions                                            | `ekg.analysis_filters`, `AnalysisFilter`; see the example below and [ekg_analysis](../ekg_analysis/README.md)             |
| Add graph views, read queries, JSON sections or statistics notices | `ekg.graph_views`, `ekg.queries`, `ekg.json_parts`, `ekg.stats_notices`; contracts in [ekg_views](../ekg_views/README.md) |
| React before a graph reset or after construction                   | `ekg.before_reset`, `ekg.built`; payloads in [ekg](../ekg/README.md)                                                      |
| React before a new analysis modifies its parent state              | `analysis.before_apply`; payload and compensation in [ekg_analysis](../ekg_analysis/README.md)                            |

The EKG package is server-only and owns dataset staging, mapping, canonical CSV
files, graph keys, state restoration, construction timing and legacy adoption.
It supplies a loader to the host's dataset-bound database abstraction. The
native `memgraph` tool holds one physical graph at a time: `ensure_loaded` can
clear and rebuild it. Use the existing operation/lifecycle lock across
multi-query work; checking a state once does not protect later unscoped
requests.

A root has a dataset mapping; a derived graph has parents and
`meta.state = {provider, spec}`. `derive_state(parent, mutate, tools)` uses
compensating rebuild on failed mutation and returns a new graph key for the
output metadata. It is not a Neo4j transaction or a read-only API. Full
signatures, metadata, build order, extra-file handling and migration rules are
in the owning [EKG reference](../ekg/README.md).

The views package supports the configured backend pool and filters contributions
by applicable kinds. A Memgraph `GraphQuery` is not automatically valid against
Neo4j: declare compatible kinds and verify its properties/query semantics. Its
small Neo4j adapter maps view-specific legacy property references; it is not a
universal Cypher translator. See
[view contracts and supported kinds](../ekg_views/README.md).

The aggregated-graph package demonstrates optional observation: it subscribes
critically to `analysis.before_apply` by name without requiring `ekg_analysis`,
and also observes `ekg.before_reset` to remove its class structures before the
owner resets/rebuilds the graph. Other packages do not call its private cleanup.

## Optional Memgraph analysis filter

This is separate from the neutral `records` tutorial. Create a server-only
`records_min_events` package with `server/__init__.py` and this manifest:

```json
{
  "name": "records_min_events",
  "version": "1.0.0",
  "api_version": "4.0",
  "label": "Minimum event filter",
  "description": "Adds an optional Memgraph EKG analysis condition.",
  "author": "SOUP",
  "databases": ["memgraph"],
  "requires": ["ekg", "ekg_analysis"],
  "requires_tools": [],
  "provides_tools": [],
  "extension_points": [],
  "python_dependencies": [],
  "server": { "module": "server", "plugin": "plugin:Plugin" }
}
```

Both public module imports below are declared. This filter's fields are static
and `to_queries()` receives the owner's query context; it does not directly
request tools. Its query **deletes entities from the derived analysis graph**.
It is an optional mutating analysis feature, not an example for a read-only
viewer.

`server/min_events.py`:

```python
from collections.abc import Mapping
from typing import Any

from soup_pkg_ekg.api import Query, ident
from soup_pkg_ekg_analysis.api import AnalysisFilter, FilterContext

from soup.core.contracts import Field, ObjectRef, ToolAccess, ValidationError


class MinEventsFilter(AnalysisFilter):
    key = "minEvents"
    label = "Entities with too few events"
    description = "Remove entities of the selected type below the event minimum."
    order = 700

    def fields(self, obj: ObjectRef, tools: ToolAccess) -> list[Field]:
        return [Field("entity", "Entity type", required=True),
                Field("minimum", "Minimum events", type="number", required=True, default=2)]

    def validate(self, spec: Any) -> dict[str, Any]:
        if not isinstance(spec, Mapping):
            raise ValidationError("minEvents: expected an object")
        entity = spec.get("entity")
        if not isinstance(entity, str) or not entity.strip():
            raise ValidationError("minEvents: entity is required")
        minimum = spec.get("minimum")
        if isinstance(minimum, bool) or not isinstance(minimum, int) or minimum < 1:
            raise ValidationError("minEvents: minimum must be a positive integer")
        return {"entity": entity.strip(), "minimum": minimum}

    def to_queries(self, spec: Mapping[str, Any], ctx: FilterContext) -> list[Query]:
        text = f"""
            MATCH (n:{ident("Entity")} {{Type: $entity}})
            OPTIONAL MATCH (e:{ident("Event")})-[:{ident("CORR")}]->(n)
            WITH n, count(e) AS events
            WHERE events < $minimum
            DETACH DELETE n"""
        return [Query(text, {"entity": spec["entity"], "minimum": spec["minimum"]})]
```

`server/plugin.py`:

```python
from soup_pkg_ekg_analysis.api import ANALYSIS_FILTERS_POINT

from soup.core.contracts import PluginContext, SoupPlugin

from .min_events import MinEventsFilter


class Plugin(SoupPlugin):
    def register(self, ctx: PluginContext) -> None:
        item = MinEventsFilter()
        ctx.contribute(ANALYSIS_FILTERS_POINT, item, key=item.key, order=item.order)
```

Order 700 follows the six built-in filters (100–600). The owner turns
contributed filters into **New analysis** variants and configuration keys,
validates them, and applies them in order rather than UI-list order. The example
preserves the original README's query structure: only trusted identifiers are
interpolated; entity/minimum values remain parameters.

No frontend bundle is needed because the existing analysis UI renders `Field`
values. `FilterContext` supplies `run` and `activities()` when a filter needs
reads. A filter that uses the passed `tools` itself must add those names to its
package's `requires_tools`; no such calls occur in this example.
