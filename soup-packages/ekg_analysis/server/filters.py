"""
------------------------------------------------------------------------
File : filters.py
Description: The filters of an analysis (Command, scheda C25),
             contributed to the "ekg.analysis_filters" extension point
             (contribution key = `key`, order = `order`):
             - AnalysisFilter: key (also the key of the filter in the
               legacy configuration file), label, description, order (the
               filters of an analysis run by order: it changes the
               result), fields(obj, tools) (the form of one condition, its
               choices read from the graph of obj), validate(spec) (one
               condition in the legacy format, ValidationError naming the
               field) and to_queries(spec, ctx) -> the Query objects that
               apply it; ctx (FilterContext) reads the graph being
               filtered;
             - EntityConditionFilter: "entity type, operator, value", the
               base of performance, frequence and variant;
             - the six filters of the legacy process_analysis
               (Services/filters_service.py), in its order: timestamp
               (100), performance (200), includeActivities (300),
               excludeActivities (400), frequence (500), variant (600).
             Their Cypher (Utils/filter_query_lib.py) is fixed text:
             labels and types through ident(), the operator from the
             closed list OPERATORS ("!=" is Cypher's "<>"), every value a
             $parameter - the legacy code put operators, entity types,
             activities, dates and numbers in the text. clean_timestamp
             drops only the time zone ("Z", "+01:00"): the legacy one cut
             at the first "-" or "+", so "2024-01-01T10:00:00+01:00"
             became "2024".
Project : soup-packages/ekg_analysis
------------------------------------------------------------------------
"""

from __future__ import annotations

import math
import re
from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping, Sequence
from contextlib import suppress
from datetime import datetime
from typing import Any, cast

import soup_pkg_ekg.api as ekg
from soup_pkg_ekg.api import Query, ident
from soup_pkg_ekg_views.api import clean

from soup.core.contracts import Choice, Field, ObjectRef, ToolAccess, ValidationError

MEMGRAPH = "memgraph"

EVENT = "Event"
ENTITY = "Entity"
CORR = "CORR"
DF = "DF"

# The operators of the old dialogs (allOperators) and their Cypher form.
OPERATORS = {"<": "<", "<=": "<=", "=": "=", "!=": "<>", ">": ">", ">=": ">="}

Run = Callable[[Query], list[dict[str, Any]]]


# ---------------------------------------------------------------------- #
# What the filters read of the graph
# ---------------------------------------------------------------------- #
def entity_types_query() -> Query:
    return Query(f"MATCH (n:{ident(ENTITY)}) WHERE n.Type IS NOT NULL "
                 "RETURN DISTINCT n.Type AS entity_type ORDER BY entity_type")


def activities_query() -> Query:
    # Only the events: the legacy get_activities_name_query read every node.
    return Query(f"""
            MATCH (e:{ident(EVENT)})
            WHERE e.ActivityName IS NOT NULL
            RETURN DISTINCT e.ActivityName AS activity
            ORDER BY activity""")


def time_range_query() -> Query:
    return Query(f"""
            MATCH (e:{ident(EVENT)})
            WHERE e.Timestamp IS NOT NULL
            RETURN min(e.Timestamp) AS first, max(e.Timestamp) AS last""")


def _column(rows: Sequence[Mapping[str, Any]], column: str) -> list[str]:
    return [str(row[column]) for row in rows if row.get(column) is not None]


def _run(tools: ToolAccess) -> Run:
    return cast(ekg.GraphDatabase, tools.get(MEMGRAPH)).run


def entity_types(obj: ObjectRef, tools: ToolAccess) -> list[str]:
    """The entity types of the graph of obj (loaded first)."""

    ekg.ensure_loaded(obj, tools)
    return _column(_run(tools)(entity_types_query()), "entity_type")


def activities(obj: ObjectRef, tools: ToolAccess) -> list[str]:
    ekg.ensure_loaded(obj, tools)
    return _column(_run(tools)(activities_query()), "activity")


def time_range(obj: ObjectRef, tools: ToolAccess) -> tuple[str | None, str | None]:
    """The first and the last timestamp of the events, as ISO text."""

    ekg.ensure_loaded(obj, tools)
    rows = _run(tools)(time_range_query())
    if not rows:
        return None, None
    first, last = clean(rows[0].get("first")), clean(rows[0].get("last"))
    return (str(first) if first is not None else None, str(last) if last is not None else None)


class FilterContext:
    """The graph a filter is applied to, for the filters that read it first (includeActivities)."""

    def __init__(self, run: Run):
        self.run = run

    def activities(self) -> list[str]:
        return _column(self.run(activities_query()), "activity")


# ---------------------------------------------------------------------- #
# Checks of one condition (the legacy validate*Filter of details-dataset)
# ---------------------------------------------------------------------- #
_ZONE = re.compile(r"(?:Z|[+-]\d{2}(?::?\d{2})?)$")


def clean_timestamp(timestamp: str) -> str:
    """An ISO date-time without its time zone ("Z", "+01:00", "-0500"); the date is kept as it is."""

    text = timestamp.strip()
    if "T" not in text:
        return text
    day, time = text.split("T", 1)
    return f"{day}T{_ZONE.sub('', time)}"


def _mapping(spec: Any) -> Mapping[str, Any]:
    if not isinstance(spec, Mapping):
        raise ValidationError("must be an object")
    return spec


def require_text(spec: Mapping[str, Any], name: str) -> str:
    value = spec.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{name}: required, a non-empty text")
    return value


def require_operator(spec: Mapping[str, Any]) -> str:
    value = spec.get("operator")
    if value not in OPERATORS:
        raise ValidationError(f"operator: {value!r} is not one of {list(OPERATORS)}")
    return cast(str, value)


def require_positive(spec: Mapping[str, Any], name: str, integer: bool = False) -> int | float:
    value = spec.get(name)
    if isinstance(value, str):
        with suppress(ValueError):
            value = float(value.strip()) if not integer else int(value.strip())
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValidationError(f"{name}: required, a number greater than 0")
    if integer and value != int(value):
        raise ValidationError(f"{name}: must be a whole number")
    if value <= 0:
        raise ValidationError(f"{name}: must be greater than 0")
    return int(value) if integer or value == int(value) else value


def require_timestamp(spec: Mapping[str, Any], name: str) -> str:
    value = require_text(spec, name)
    try:
        datetime.fromisoformat(clean_timestamp(value))
    except ValueError:
        raise ValidationError(f"{name}: {value!r} is not an ISO-8601 date-time") from None
    return value


def require_activities(spec: Mapping[str, Any]) -> list[str]:
    value = spec.get("activities")
    if not isinstance(value, (list, tuple)) or not value or not all(isinstance(item, str) and item for item in value):
        raise ValidationError("activities: required, a non-empty list of activity names")
    return list(dict.fromkeys(value))


# ---------------------------------------------------------------------- #
# Contracts
# ---------------------------------------------------------------------- #
class AnalysisFilter(ABC):
    key: str = ""
    label: str = ""
    description: str = ""
    order: int = 0

    @abstractmethod
    def fields(self, obj: ObjectRef, tools: ToolAccess) -> list[Field]:
        """The form of one condition; the names are the keys of the legacy format."""
        raise NotImplementedError

    @abstractmethod
    def validate(self, spec: Any) -> dict[str, Any]:
        """One condition in the legacy format, normalized. :raises ValidationError: naming the field"""
        raise NotImplementedError

    @abstractmethod
    def to_queries(self, spec: Mapping[str, Any], ctx: FilterContext) -> list[Query]:
        """The queries that apply one condition (already validated) to the graph of ctx."""
        raise NotImplementedError


def entity_field(types: Sequence[str]) -> Field:
    if types:
        return Field("entity", "Entity type", type="select", required=True,
                     choices=cast("tuple[Choice, ...]", tuple(types)), default=types[0])
    return Field("entity", "Entity type", required=True, help="The graph has no entities.")


def operator_field() -> Field:
    return Field("operator", "Operator", type="select", required=True,
                 choices=tuple(Choice(value) for value in OPERATORS), default=">=")


class EntityConditionFilter(AnalysisFilter):
    """
    "Entity type, operator, value": `value_field` is the name of the value
    (seconds, frequency, variant); condition_query() writes the Cypher with
    the operator already mapped to its Cypher form.
    """

    value_field: str = ""
    value_label: str = ""
    value_help: str = ""
    integer: bool = True

    def fields(self, obj: ObjectRef, tools: ToolAccess) -> list[Field]:
        return [
            entity_field(entity_types(obj, tools)),
            operator_field(),
            Field(self.value_field, self.value_label, type="number", required=True, help=self.value_help),
        ]

    def validate(self, spec: Any) -> dict[str, Any]:
        spec = _mapping(spec)
        return {
            "entity": require_text(spec, "entity"),
            "operator": require_operator(spec),
            self.value_field: require_positive(spec, self.value_field, self.integer),
        }

    def to_queries(self, spec: Mapping[str, Any], ctx: FilterContext) -> list[Query]:
        return [self.condition_query(spec["entity"], OPERATORS[spec["operator"]], spec[self.value_field])]

    @abstractmethod
    def condition_query(self, entity: str, operator: str, value: Any) -> Query:
        """`operator` is one of the values of OPERATORS (never the user's text)."""
        raise NotImplementedError


# ---------------------------------------------------------------------- #
# The six filters
# ---------------------------------------------------------------------- #
class TimestampFilter(AnalysisFilter):
    key = "timestamp"
    label = "Time range"
    description = "Remove pairs of consecutive events (:DF) when both fall outside the time range."
    order = 100

    def fields(self, obj: ObjectRef, tools: ToolAccess) -> list[Field]:
        first, last = time_range(obj, tools)
        return [
            Field("startDate", "From", type="datetime", required=True, default=first),
            Field("endDate", "To", type="datetime", required=True, default=last),
        ]

    def validate(self, spec: Any) -> dict[str, Any]:
        spec = _mapping(spec)
        return {"startDate": require_timestamp(spec, "startDate"), "endDate": require_timestamp(spec, "endDate")}

    def to_queries(self, spec: Mapping[str, Any], ctx: FilterContext) -> list[Query]:
        # timestamp_filter_delete_query.
        text = f"""
            MATCH (e1:{ident(EVENT)})-[r:{ident(DF)}]->(e2:{ident(EVENT)})
            WHERE NOT (e1.Timestamp >= localDateTime($start) AND e1.Timestamp <= localDateTime($end))
            AND NOT (e2.Timestamp >= localDateTime($start) AND e2.Timestamp <= localDateTime($end))
            DETACH DELETE e1, e2, r"""
        return [Query(text, {"start": clean_timestamp(spec["startDate"]), "end": clean_timestamp(spec["endDate"])})]


class PerformanceFilter(EntityConditionFilter):
    key = "performance"
    label = "Trace duration"
    description = (
        "Remove events belonging to entities of the selected type whose trace duration, from first to last "
        "event, satisfies the condition."
    )
    order = 200
    value_field = "seconds"
    value_label = "Seconds"
    integer = False

    def condition_query(self, entity: str, operator: str, value: Any) -> Query:
        # filter_entity_performance.
        text = f"""
            MATCH (e:{ident(EVENT)})-[:{ident(CORR)}]->(t:{ident(ENTITY)} {{Type: $entity}})
            WITH e, t.Value AS entity ORDER BY e.Timestamp ASC
            WITH entity, collect(e) AS events
            WITH entity, head(events) AS start_node, last(events) AS end_node
            WITH entity, (end_node.Timestamp - start_node.Timestamp) AS duration
            WHERE duration {operator} duration($duration)
            WITH entity
            MATCH (e:{ident(EVENT)})-[:{ident(CORR)}]->(t:{ident(ENTITY)} {{Type: $entity, Value: entity}})
            DETACH DELETE e"""
        return Query(text, {"entity": entity, "duration": f"PT{value}S"})


def exclude_activity_query(activity: str) -> Query:
    """
    exclude_activity_filter_query: the events of `activity` go away, and
    their predecessor and successor of the same :DF type are linked.
    """

    text = f"""
            MATCH (e:{ident(EVENT)} {{ActivityName: $activity}})
            OPTIONAL MATCH (pred:{ident(EVENT)})-[in_rel:{ident(DF)}]->(e)
            OPTIONAL MATCH (e)-[out_rel:{ident(DF)}]->(succ:{ident(EVENT)})
            WITH e, pred, succ, in_rel, out_rel
            FOREACH (_ IN CASE WHEN pred IS NOT NULL AND succ IS NOT NULL AND in_rel IS NOT NULL
                               AND out_rel IS NOT NULL AND in_rel.Type = out_rel.Type THEN [1] ELSE [] END |
                MERGE (pred)-[new_rel:{ident(DF)} {{Type: in_rel.Type}}]->(succ)
                SET new_rel.edge_weight = in_rel.edge_weight
            )
            WITH DISTINCT e
            DETACH DELETE e"""
    return Query(text, {"activity": activity})


class _ActivitiesFilter(AnalysisFilter):
    def fields(self, obj: ObjectRef, tools: ToolAccess) -> list[Field]:
        names = activities(obj, tools)
        if names:
            return [Field("activities", "Activities", type="multiselect", required=True,
                          choices=cast("tuple[Choice, ...]", tuple(names)))]
        return [Field("activities", "Activities", type="columns", required=True, help="The graph has no activities.")]

    def validate(self, spec: Any) -> dict[str, Any]:
        return {"activities": require_activities(_mapping(spec))}


class IncludeActivitiesFilter(_ActivitiesFilter):
    key = "includeActivities"
    label = "Include activities"
    description = "Keep only events with the selected activities, linking their predecessors and successors."
    order = 300

    def to_queries(self, spec: Mapping[str, Any], ctx: FilterContext) -> list[Query]:
        keep = set(spec["activities"])
        return [exclude_activity_query(name) for name in ctx.activities() if name not in keep]


class ExcludeActivitiesFilter(_ActivitiesFilter):
    key = "excludeActivities"
    label = "Exclude activities"
    description = "Remove events with the selected activities, linking their predecessors and successors."
    order = 400

    def to_queries(self, spec: Mapping[str, Any], ctx: FilterContext) -> list[Query]:
        return [exclude_activity_query(name) for name in spec["activities"]]


class FrequenceFilter(EntityConditionFilter):
    key = "frequence"
    label = "Activity frequency"
    description = (
        "Keep events whose activity frequency for the selected entity type satisfies the condition. Remove "
        "other events and link their predecessors and successors."
    )
    order = 500
    value_field = "frequency"
    value_label = "Occurrences"

    def condition_query(self, entity: str, operator: str, value: Any) -> Query:
        # filter_activity_frequency.
        text = f"""
            MATCH (e:{ident(EVENT)})-[:{ident(CORR)}]->(t:{ident(ENTITY)} {{Type: $entity}})
            WITH e.ActivityName AS activity, collect(e) AS events
            WHERE size(events) {operator} $frequency
            UNWIND events AS kept
            WITH collect(kept) AS events_to_keep
            MATCH (e:{ident(EVENT)})
            WHERE NOT e IN events_to_keep
            OPTIONAL MATCH (prev)-[:{ident(DF)}]->(e)-[:{ident(DF)}]->(next)
            FOREACH (_ IN CASE WHEN prev IS NOT NULL AND next IS NOT NULL THEN [1] ELSE [] END |
                MERGE (prev)-[:{ident(DF)}]->(next)
            )
            DETACH DELETE e"""
        return Query(text, {"entity": entity, "frequency": value})


class VariantFilter(EntityConditionFilter):
    key = "variant"
    label = "Variants"
    description = (
        "Remove events belonging to entities of the selected type whose variant (activity sequence) frequency "
        "satisfies the condition."
    )
    order = 600
    value_field = "variant"
    value_label = "Variant occurrences"

    def condition_query(self, entity: str, operator: str, value: Any) -> Query:
        # filter_entity_variant.
        text = f"""
            MATCH (e:{ident(EVENT)})-[:{ident(CORR)}]->(t:{ident(ENTITY)} {{Type: $entity}})
            WITH e, t AS entity ORDER BY e.Timestamp ASC
            WITH entity, collect(e.ActivityName) AS events
            WITH events, count(*) AS event_count, collect(entity) AS entities
            WHERE event_count {operator} $variant
            MATCH (e2:{ident(EVENT)})-[:{ident(CORR)}]->(t2:{ident(ENTITY)} {{Type: $entity}})
            WHERE t2 IN entities
            DETACH DELETE e2"""
        return Query(text, {"entity": entity, "variant": value})


def builtin_filters() -> list[AnalysisFilter]:
    return [
        TimestampFilter(),
        PerformanceFilter(),
        IncludeActivitiesFilter(),
        ExcludeActivitiesFilter(),
        FrequenceFilter(),
        VariantFilter(),
    ]


# The keys of the legacy configuration file, always written (the old
# configuration files have each of them, so the format stays the same).
LEGACY_FILTER_KEYS = tuple(item.key for item in builtin_filters())
