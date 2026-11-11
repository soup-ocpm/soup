"""
------------------------------------------------------------------------
File : ekg_service.py
Description: EkgService - build/reset/rebuild the EKG of one dataset
             (moved here from soup/core/services), merging this package's
             build steps (steps.py) with the steps other packages
             contributed to the "ekg.build_steps" extension point (e.g.
             causal_df), ordered by `.order`. The contributed steps are
             read again at every build, so a package enabled or disabled
             at runtime takes effect immediately. build() can record the
             start/end of each phase in the shape of the legacy config's
             process_info (init_event_time, finish_event_time, ...).
Project : soup-packages/ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import cast

from soup_pkg_tool_memgraph.api import GraphDatabase, Query

from soup.core.contracts import import_phase

from . import schema
from .build import BuildContext, EkgBuildStep
from .process_timer import ProcessTimer
from .steps import core_steps

# Step phase -> the process_info keys it fills (init_<x>_time,
# finish_<x>_time), as in Services/generic_graph_service.py. Several steps
# of one phase (e.g. causal_df's 450 and the core 500, both "df") share
# one interval: from the start of the first to the end of the last.
PHASE_TIMES = ("event", "entity", "corr", "df")

StepSource = Iterable[EkgBuildStep] | Callable[[], Iterable[EkgBuildStep]]


class EkgService:
    def __init__(self, db: GraphDatabase, plugin_build_steps: StepSource | None = None):
        self._db = db
        self._plugin_build_steps = plugin_build_steps

    def build_pipeline(self) -> list[EkgBuildStep]:
        """
        The full, ordered list of build steps (this package's + contributed),
        independent of any particular BuildContext - useful to inspect/test
        the pipeline's composition without running it against a database.
        """

        source = self._plugin_build_steps
        plugin_steps = list((source() if callable(source) else source) or ()) if source is not None else []
        return sorted((*core_steps(), *plugin_steps), key=lambda step: step.order)

    def build(self, ctx: BuildContext, times: dict[str, str] | None = None) -> None:
        """Run the pipeline; with `times`, record each phase's start/end in it."""

        phases = {
            "event": "event creation",
            "entity": "entity creation",
            "corr": "CORR",
            "df": "DF",
            "index": "index setup",
        }
        for step in self.build_pipeline():
            hint = (
                "Check SHOW INDEX INFO label/property metadata and index privileges."
                if step.phase == "index"
                else "Check the mapped columns, database connectivity and server resources."
            )
            with import_phase(phases.get(step.phase, step.key), step=step.key, dataset=ctx.dataset_name, hint=hint):
                if not step.applies(ctx):
                    continue
                with ProcessTimer() as timer:
                    step.execute(ctx, self._db)
                if times is not None and step.phase in PHASE_TIMES:
                    times.setdefault(f"init_{step.phase}_time", cast(str, timer.started_at))
                    times[f"finish_{step.phase}_time"] = cast(str, timer.finished_at)

    def reset(self) -> None:
        """
        Delete every Event/Entity node and drop exactly the indexes the
        build actually creates (schema.DROPPED_INDEXES) - unlike the
        legacy Services/Graph/op_graph_service.py's delete_graph_s(),
        which also tries to drop :Event(Event_Id), an index the build
        never creates, and which Memgraph then errors on.
        """

        self._db.run(schema.delete_events_query())
        self._db.run(schema.delete_entities_query())
        existing = {
            (row.get("label"), row.get("property"))
            for row in self._db.run(Query("SHOW INDEX INFO"))
            if row.get("index type") == "label+property"
        }
        for key, factory in zip(schema.INDEXES, schema.DROPPED_INDEXES, strict=True):
            if key in existing:
                self._db.run(factory())

    def rebuild(self, ctx: BuildContext) -> None:
        self.reset()
        self.build(ctx)

    def counts(self) -> dict[str, int]:
        """event_nodes/entity_nodes/corr_rel/df_rel - the counters the legacy
        config JSON stores (Services/generic_graph_service.py)."""

        return {
            "event_nodes": self._scalar_count(schema.count_event_nodes_query()),
            "entity_nodes": self._scalar_count(schema.count_entity_nodes_query()),
            "corr_rel": self._scalar_count(schema.count_corr_relationships_query()),
            "df_rel": self._scalar_count(schema.count_df_relationships_query()),
        }

    def _scalar_count(self, query: Query) -> int:
        rows = self._db.run(query)
        if not rows:
            return 0
        return cast(int, next(iter(rows[0].values())))
