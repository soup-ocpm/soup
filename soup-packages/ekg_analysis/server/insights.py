"""
------------------------------------------------------------------------
File : insights.py
Description: InsightsVisualizer ("insights", "Indicatori di processo",
             <soup-pkg-ekg-insights>) for "ekg" objects: what the old
             filter dialogs and the graph page computed before choosing
             a filter (Services/filters_service.py, graph.component.ts):
             - data(): the entity types, the frequency of the activities
               (process_frequency, threshold 1), the indicators of the
               first entity type and meta.notice;
             - action "entity" {entity}: the indicators of one entity
               type - the average duration of its traces
               (get_performance_entities_avg: seconds and H:MM:SS), the
               occurrences of the activities
               (get_frequency_entities_activities_occurrences) and the
               variants with their occurrences and average duration
               (get_variation_entities_occurrences and process_variation,
               calculateGraphVariation, per entity type);
             - action "frequency" {min}: the activities with at least
               `min` events (preCalculateFrequency).
             The entity type is checked against the ones of the graph
             (400 otherwise) and travels as $entity. The legacy
             process_frequency and process_variation called queries that
             no longer existed (removed in 755c0a9: every call was a
             500), and the variation grouped by a property that does not
             exist (start.EventID). Durations from Memgraph (Duration,
             with months, days, seconds, nanoseconds) become seconds like
             the legacy code (a month counts 30 days).
Project : soup-packages/ekg_analysis
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import timedelta
from typing import Any, cast

import soup_pkg_ekg.api as ekg
from soup_pkg_ekg.api import Query, ident
from soup_pkg_ekg_views.api import notice_of

from soup.core.contracts import NotFoundError, ObjectRef, ToolAccess, ValidationError, Visualizer

from .filters import CORR, ENTITY, EVENT, MEMGRAPH, Run, _run, entity_types


def activity_frequency_query(minimum: int) -> Query:
    # The legacy frequency_filter_query.
    return Query(f"""
            MATCH (e:{ident(EVENT)})
            WITH e.ActivityName AS activity, count(e) AS frequency
            WHERE frequency >= $min
            RETURN activity, frequency
            ORDER BY frequency ASC, activity""", {"min": minimum})


_TRACES = f"""
            MATCH (e:{ident(EVENT)})-[:{ident(CORR)}]->(t:{ident(ENTITY)} {{Type: $entity}})
            WITH e, t.Value AS entity ORDER BY e.Timestamp ASC
            WITH entity, collect(e) AS events"""


def trace_durations_query(entity: str) -> Query:
    # get_entity_trace_duration.
    return Query(_TRACES + """
            RETURN entity AS entity_id, last(events).Timestamp - head(events).Timestamp AS iso_duration""",
                 {"entity": entity})


def activity_occurrences_query(entity: str) -> Query:
    # get_activity_frequency_query.
    return Query(f"""
            MATCH (e:{ident(EVENT)})-[:{ident(CORR)}]->(t:{ident(ENTITY)} {{Type: $entity}})
            RETURN e.ActivityName AS activity, count(*) AS occurrences
            ORDER BY occurrences DESC, activity""", {"entity": entity})


def variants_query(entity: str) -> Query:
    # get_variant_query, with the duration of each trace. extract(), not a
    # list comprehension ([x IN events | ...]): Memgraph 2.x does not
    # implement comprehensions ("Not yet implemented: atom expression").
    return Query(_TRACES + """
            WITH extract(x IN events | x.ActivityName) AS variant,
                 last(events).Timestamp - head(events).Timestamp AS duration
            RETURN variant, count(*) AS occurrences, collect(duration) AS durations
            ORDER BY occurrences DESC""", {"entity": entity})


def duration_seconds(value: Any) -> float | None:
    """A Memgraph Duration (months, days, seconds, nanoseconds), a timedelta or a number, in seconds."""

    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, timedelta):
        return value.total_seconds()
    if all(hasattr(value, part) for part in ("months", "days", "seconds")):
        return cast(float, value.months * 30 * 24 * 3600 + value.days * 24 * 3600 + value.seconds
                    + getattr(value, "nanoseconds", 0) / 1_000_000_000)
    return None


def average(values: Sequence[Any]) -> dict[str, Any] | None:
    """{average_seconds, formatted (H:MM:SS)} of the durations that can be read, None if none."""

    seconds = [item for item in (duration_seconds(value) for value in values) if item is not None]
    if not seconds:
        return None
    mean = sum(seconds) / len(seconds)
    return {"average_seconds": round(mean, 2), "formatted": str(timedelta(seconds=int(mean))), "count": len(seconds)}


def _as_int(value: Any, name: str, default: int, low: int) -> int:
    if value is None or value == "":
        return default
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"'{name}' must be an integer") from None
    if number < low:
        raise ValidationError(f"'{name}' must be at least {low}")
    return number


class InsightsVisualizer(Visualizer):
    id = "insights"
    label = "Process indicators"
    element = "soup-pkg-ekg-insights"
    accepts = (ekg.EKG_KIND,)
    requires_tools = (MEMGRAPH,)

    def data(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        types = entity_types(obj, tools)
        run = _run(tools)
        return {
            "entity_types": types,
            "frequency": self._frequency(run, 1),
            "indicators": self._indicators(run, types[0]) if types else None,
            "notice": notice_of(obj),
        }

    def action(self, obj: ObjectRef, name: str, params: Mapping[str, Any], tools: ToolAccess) -> Any:
        if name not in ("entity", "frequency"):
            raise NotFoundError(f"Visualizer '{self.id}' has no action '{name}'")
        if name == "frequency":
            minimum = _as_int(params.get("min"), "min", 1, 1)
            ekg.ensure_loaded(obj, tools)
            return {"min": minimum, "frequency": self._frequency(_run(tools), minimum)}
        types = entity_types(obj, tools)
        entity = params.get("entity")
        if entity not in types:
            raise ValidationError(f"'entity' must be one of the entity types of the graph {types}, got {entity!r}")
        return self._indicators(_run(tools), entity)

    @staticmethod
    def _frequency(run: Run, minimum: int) -> list[dict[str, Any]]:
        return [{"activity": row.get("activity"), "frequency": row.get("frequency")}
                for row in run(activity_frequency_query(minimum)) if row.get("activity") is not None]

    @staticmethod
    def _indicators(run: Run, entity: str) -> dict[str, Any]:
        durations = [row.get("iso_duration") for row in run(trace_durations_query(entity))]
        activities = [{"activity": row["activity"], "occurrences": row["occurrences"]}
                      for row in run(activity_occurrences_query(entity))
                      if row.get("activity") is not None and row.get("occurrences") is not None]
        variants = []
        for row in run(variants_query(entity)):
            if not isinstance(row.get("variant"), list) or row.get("occurrences") is None:
                continue
            mean = average(row.get("durations") or [])
            variants.append({
                "variant": [str(item) for item in row["variant"]],
                "occurrences": row["occurrences"],
                "average_seconds": mean["average_seconds"] if mean else None,
                "formatted": mean["formatted"] if mean else None,
            })
        return {"entity": entity, "duration": average(durations), "activities": activities, "variants": variants}
