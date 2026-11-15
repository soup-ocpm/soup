"""SOUP adapters; the upstream ocean_lib/query/aggregation_query.py is untouched."""
from __future__ import annotations

import json
import logging
import math
import re
from collections.abc import Callable, Mapping
from types import SimpleNamespace
from typing import Any

from soup.core.contracts import (
    Choice,
    Field,
    ObjectDraft,
    ObjectRef,
    Operation,
    OperationInput,
    ToolAccess,
    ValidationError,
    Variant,
    validate_name,
)
from soup.core.contracts.database import CypherExecutor, Database

from .compat import AGGREGATION_LOCK as _AGGREGATION_LOCK
from .compat import (
    PROVIDER,
    UNSUPPORTED_FUNCTIONS,
    RunExecutor,
    check_queries,
    ekg_api,
    execute_ocean,
    require_no_classes,
)
from .ocean_lib.aggregation.grammar import AggregationFunction, AggrSpecification, AggrStep, AttrAggr

SOURCE_KIND = "oced_importer.log"
SOURCE_KINDS = (SOURCE_KIND, "ekg")
RESULT_KIND = "ocean_aggregation.graph"
MAX_STEPS = 30
# Ocean stores configuration in module-level knowledge; serialize running specifications.
_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")



def _identifier(name: Any) -> str:
    if not isinstance(name, str) or not _IDENTIFIER.fullmatch(name):
        raise ValidationError(f"Unsafe Cypher property identifier: {name!r}")
    return name


def _properties(db: CypherExecutor, label: str, type_tag: str | None = None,
                entity_type: str | None = None) -> tuple[str, ...]:
    """Read existing graph property keys; choices are supplied by Neo4j, not guessed."""
    if label not in ("Event", "Entity"):
        raise ValidationError("Unexpected graph label")
    where = f" WHERE n.{_identifier(type_tag)} = $entity_type" if entity_type is not None else ""
    rows = db.execute(f"MATCH (n:{label}){where} UNWIND keys(n) AS prop "
                      "RETURN DISTINCT prop ORDER BY prop LIMIT 300", {"entity_type": entity_type})
    return tuple(row["prop"] for row in rows
                 if isinstance(row.get("prop"), str) and _IDENTIFIER.fullmatch(row["prop"]))


def _entity_types(db: CypherExecutor, type_tag: str) -> tuple[str, ...]:
    rows = db.execute(f"MATCH (n:Entity) RETURN DISTINCT n.{_identifier(type_tag)} AS kind "
                      "ORDER BY kind LIMIT 200")
    return tuple(row["kind"] for row in rows
                 if isinstance(row.get("kind"), str) and _IDENTIFIER.fullmatch(row["kind"]))


def _filter_value(value: Any, value_type: str) -> str:
    if value_type == "number":
        try:
            number = float(value)
        except (ValueError, TypeError) as exc:
            raise ValidationError("Numeric filter requires a number") from exc
        if not math.isfinite(number):
            raise ValidationError("Filter number must be finite")
        return str(number)
    if value_type == "boolean":
        if str(value).lower() not in ("true", "false"):
            raise ValidationError("Boolean filter requires true or false")
        return str(value).lower()
    if value_type != "string" or not isinstance(value, str) or len(value) > 500:
        raise ValidationError("Invalid filter value")
    # Ocean writes its where-expression inside a single-quoted Class property.
    # Reject unsafe literal characters here without editing upstream Cypher.
    if "'" in value or "\\" in value or any(ord(ch) < 32 for ch in value):
        raise ValidationError("Filter text cannot include apostrophes, backslashes or control characters")
    return json.dumps(value, ensure_ascii=True)


def _where(filters: Any, properties: tuple[str, ...]) -> str | None:
    if not filters:
        return None
    if not isinstance(filters, list) or len(filters) > 12:
        raise ValidationError("Provide at most 12 filters per step")
    parts = []
    for item in filters:
        if not isinstance(item, dict) or item.get("variant") != "condition":
            raise ValidationError("Unexpected filter specification")
        values = item.get("values") or {}
        prop = _identifier(values.get("property"))
        if prop not in properties:
            raise ValidationError(f"Property {prop!r} is not in the selected graph node type")
        op = values.get("operator")
        if op not in ("=", "<>", ">", ">=", "<", "<=", "CONTAINS", "STARTS WITH", "ENDS WITH", "IS NULL", "IS NOT NULL"):
            raise ValidationError("Unsupported filter operator")
        if op in ("IS NULL", "IS NOT NULL"):
            expr = f"{prop} {op}"
        else:
            vt = values.get("value_type", "string")
            if op in ("CONTAINS", "STARTS WITH", "ENDS WITH") and vt != "string":
                raise ValidationError("Text operators require string values")
            expr = f"{prop} {op} {_filter_value(values.get('value'), vt)}"
        parts.append(expr)
    # Ocean prefixes the first condition with 'n.'; insert n. for each subsequent one.
    return " AND n.".join(parts)


def _spec(raw: Any, *, event_props: tuple[str, ...],
          entity_types: tuple[str, ...], entity_columns: tuple[str, ...],
          entity_properties: Mapping[str, tuple[str, ...]]) -> AggrSpecification:
    if not isinstance(raw, list) or not raw:
        raise ValidationError("Add at least one aggregation step")
    if len(raw) > MAX_STEPS:
        raise ValidationError("Maximum 30 aggregation steps")
    steps: list[AggrStep] = []
    aggregated_entities: set[str] = set()
    for item in raw:
        if not isinstance(item, dict) or item.get("variant") not in ("EVENTS", "ENTITIES"):
            raise ValidationError("Unexpected aggregation step type")
        values = item.get("values") or {}
        aggr_type = item["variant"]
        ent_type = values.get("ent_type") if aggr_type == "ENTITIES" else None
        props = event_props if aggr_type == "EVENTS" else entity_properties.get(str(ent_type), ())
        group_by = values.get("group_by")
        if not isinstance(group_by, list) or not group_by:
            raise ValidationError("Each aggregation step needs grouping properties")
        for prop in group_by:
            if _identifier(prop) not in props:
                raise ValidationError(f"Grouping property {prop!r} not available")
        if aggr_type == "ENTITIES":
            if ent_type not in entity_types:
                raise ValidationError("Select an existing entity type")
        if aggr_type == "ENTITIES":
            aggregated_entities.add(str(ent_type))
        elif not aggregated_entities and not set(group_by).intersection(entity_columns):
            raise ValidationError(
                f"Aggregation step #{len(steps) + 1}: the original OCEAN event query requires entity grouping context. "
                "Add an entity aggregation before this event step, or include an object-reference column "
                "in its grouping properties. Steps execute in the order added; no aggregation was performed."
            )
        filters = values.get("filters") or []
        if filters and aggr_type == "ENTITIES" and not ent_type:
            raise ValidationError("Entity filtering requires an entity type")
        where = _where(filters, props)
        attrs = []
        for attr in values.get("attr_aggrs") or []:
            if not isinstance(attr, dict) or attr.get("variant") != "attribute":
                raise ValidationError("Unexpected attribute aggregation")
            entry = attr.get("values") or {}
            name = _identifier(entry.get("name"))
            if name not in props:
                raise ValidationError("Attribute not found in graph")
            try:
                fn = AggregationFunction(entry["function"])
            except (KeyError, ValueError) as exc:
                raise ValidationError("Invalid attribute aggregation function") from exc
            attrs.append(AttrAggr(name, fn))
        steps.append(AggrStep(aggr_type, ent_type, list(group_by), where, attrs))
    return AggrSpecification(steps)


def _filter_field(properties: tuple[str, ...]) -> Field:
    return Field("filters", "Filters (all conditions must match)", type="items", variants=(
        Variant("condition", "Property condition", fields=(
            Field("property", "Property", type="select", required=True,
                  choices=tuple(Choice(prop) for prop in properties)),
            Field("operator", "Comparison", type="select", required=True,
                  choices=tuple(Choice(op) for op in (
                      "=", "<>", ">", ">=", "<", "<=", "CONTAINS", "STARTS WITH", "ENDS WITH", "IS NULL", "IS NOT NULL"
                  ))),
            Field("value_type", "Value type", type="select", default="string",
                  choices=tuple(Choice(kind) for kind in ("string", "number", "boolean"))),
            Field("value", "Value (omit for IS NULL / IS NOT NULL)", type="text"),
        )),
    ), help="Only existing node properties are available. Conditions are combined using AND.")


def _attribute_field(properties: tuple[str, ...]) -> Field:
    return Field("attr_aggrs", "Attribute aggregations (optional)", type="items", variants=(
        Variant("attribute", "Aggregate attribute", fields=(
            Field("name", "Property", type="select", required=True, choices=tuple(Choice(prop) for prop in properties)),
            Field("function", "Function", type="select", required=True,
                  choices=tuple(Choice(fn.value) for fn in AggregationFunction
                                if fn.value not in UNSUPPORTED_FUNCTIONS)),
        )),
    ))


def _step_fields(properties: tuple[str, ...], entity_types: tuple[str, ...] = ()) -> tuple[Field, ...]:
    fields = [Field("group_by", "Group by properties", type="multiselect", required=True,
                    choices=tuple(Choice(prop) for prop in properties), help="Choose one or more existing properties"),
              _filter_field(properties), _attribute_field(properties)]
    if entity_types:
        fields.insert(0, Field("ent_type", "Entity type", type="select", required=True,
                               choices=tuple(Choice(kind) for kind in entity_types)))
    return tuple(fields)


def _configs(source: ObjectRef) -> tuple[Any, Any]:
    if source.kind == "ekg":
        return (SimpleNamespace(event_id="Event_Id", event_activity="ActivityName", event_timestamp="Timestamp",
                                entity_id="Value", entities={}),
                SimpleNamespace(type_tag="Type", entity_type_mode="property"))
    log_config = source.meta.get("log_config")
    ekg_config = source.meta.get("ekg_config")
    if not isinstance(log_config, dict) or not isinstance(ekg_config, dict):
        raise ValidationError("OCED dataset lacks the log_config/ekg_config metadata")
    log = SimpleNamespace(**log_config)
    ekg = SimpleNamespace(**ekg_config)
    for field in ("event_id", "event_activity", "event_timestamp", "entity_id"):
        _identifier(getattr(log, field, None))
    _identifier(getattr(ekg, "type_tag", None))
    if getattr(ekg, "entity_type_mode", None) != "property":
        raise ValidationError("Ocean aggregation expects entity types stored as properties")
    return log, ekg


def _source_db(database: Database, obj: ObjectRef) -> Database:
    db = database.for_dataset(obj.id)
    if db.backend not in {"neo4j", "memgraph"}:
        raise ValidationError("Ocean aggregation requires a Neo4j or Memgraph dataset")
    if db.backend == "neo4j":
        owner = obj.meta.get("source_id", obj.id)
        counts = db.execute(
            "MATCH (n) WHERE NOT n:Class RETURN count(n) AS total, "
            "count(CASE WHEN n.Log = $owner THEN 1 END) AS owned", {"owner": owner})[0]
        if not counts["total"] or counts["total"] != counts["owned"]:
            raise ValidationError("The selected database does not exclusively contain this OCED dataset")
    return db


class OceanOperation(Operation):
    id = "aggregate"
    label = "Ocean aggregation"
    description = "Build Ocean Class/OBS/DF_C/CORR_C structures on an existing dataset EKG"
    group = "Aggregation"
    inputs = (OperationInput("ekg", SOURCE_KINDS),)
    produces = (RESULT_KIND,)

    def __init__(self, database: Database, memgraph_ready: Callable[[], bool] = lambda: False):
        self.database = database
        self.memgraph_ready = memgraph_ready

    def fields(self, inputs: Mapping[str, ObjectRef], tools: ToolAccess) -> list[Field]:
        source = inputs["ekg"]
        _, ekg = _configs(source)
        db = _source_db(self.database, source)
        events, entities = _properties(db, "Event"), _properties(db, "Entity")
        entity_types = _entity_types(db, ekg.type_tag)
        variants = []
        if events:
            variants.append(Variant("EVENTS", "Aggregate events", fields=_step_fields(events)))
        if entities and entity_types:
            variants.append(Variant("ENTITIES", "Aggregate entities", fields=_step_fields(entities, entity_types)))
        if not variants:
            raise ValidationError("Selected dataset has no supported Event/Entity properties and entity types")
        fields = [Field("aggregation_name", "Aggregation name", required=True)]
        if db.backend == "neo4j":
            fields.append(Field("replace_classes", "Delete existing Class nodes before aggregation",
                  type="bool", default=False,
                  help="Irreversible: removes all Class nodes and their attached relationships in this dataset. "
                       "Source nodes and saved settings remain; the previous graph is replaced."))
        fields.append(Field("steps", "Ocean aggregation steps", type="items", required=True, variants=tuple(variants)))
        return fields

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:
        source = inputs["ekg"]
        aggregation_name = validate_name(params.get("aggregation_name"), label="Aggregation")
        if source.meta.get("import_status", "complete") != "complete":
            raise ValidationError("Source OCED import has not completed")
        log, ekg = _configs(source)
        db = _source_db(self.database, source)
        raw = params.get("steps")
        if not isinstance(raw, list) or not raw or len(raw) > MAX_STEPS:
            raise ValidationError("Provide between 1 and 30 aggregation steps")
        types = _entity_types(db, ekg.type_tag)
        if db.backend == "memgraph":
            log.entities = {kind: {} for kind in types}
        selected_types = {
            item["values"].get("ent_type") for item in raw
            if isinstance(item, dict) and item.get("variant") == "ENTITIES"
            and isinstance(item.get("values"), dict)
            and isinstance(item["values"].get("ent_type"), str)
        }
        properties = {kind: _properties(db, "Entity", ekg.type_tag, kind)
                      for kind in selected_types if kind in types}
        spec = _spec(raw, event_props=_properties(db, "Event"),
                     entity_types=types, entity_columns=tuple(log.entities or ()),
                     entity_properties=properties)
        check_queries(db, log, ekg, spec)
        if db.backend == "memgraph":
            return self._memgraph(source, log, ekg, spec, params)
        # Validate source ownership and replace only derived Class nodes after explicit confirmation.
        with _AGGREGATION_LOCK:
            counts = db.execute("MATCH (n) RETURN count(n) AS all_nodes, "
                                "count(CASE WHEN NOT n:Class AND n.Log = $id THEN 1 END) AS owned, "
                                "count(CASE WHEN n:Class THEN 1 END) AS classes, "
                                "count(CASE WHEN n:Class AND (n:Event OR n:Entity) THEN 1 END) AS source_classes",
                                {"id": source.id})[0]
            if counts["source_classes"]:
                raise ValidationError(
                    "Some Class nodes are also source Event/Entity nodes; replacement is unsafe and was stopped."
                )
            if not counts["owned"] or counts["all_nodes"] - counts["classes"] != counts["owned"]:
                raise ValidationError(
                    "Dataset database contains foreign source nodes or no source nodes; no aggregation performed"
                )
            if counts["classes"]:
                if params.get("replace_classes") is not True:
                    raise ValidationError(
                        "Existing Class nodes must be deleted before running a new aggregation. "
                        "Confirm replacement to continue; no graph was changed."
                    )
                try:
                    db.execute("MATCH (c:Class) DETACH DELETE c")
                except Exception as exc:
                    logging.getLogger(__name__).exception("Class replacement failed for dataset %s", source.id)
                    raise ValidationError(
                        f"Could not delete existing Class nodes: {exc}. Aggregation was not started."
                    ) from exc
            result = execute_ocean(db, log, ekg, spec)
        return [ObjectDraft(
            name=aggregation_name, kind=RESULT_KIND,
            description="Ocean class aggregation in the source dataset's Neo4j database",
            meta={"source_id": source.id, "neo4j_database": source.meta.get("neo4j_database"),
                  "backend": "neo4j", **result,
                  "aggregation_name": aggregation_name, "configuration": {"steps": raw},
                  "steps": [{"aggr_type": step.aggr_type, "ent_type": step.ent_type,
                             "group_by": step.group_by, "where": step.where,
                             "attr_aggrs": [{"name": a.name, "function": a.function.value}
                                            for a in step.attr_aggrs]} for step in spec.steps],
                  "type_tag": ekg.type_tag},
        )]

    def _memgraph(self, source: ObjectRef, log: Any, ekg: Any, spec: AggrSpecification,
                  params: Mapping[str, Any]) -> list[ObjectDraft]:
        raw = params["steps"]
        aggregation_name = params["aggregation_name"]
        if not self.memgraph_ready():
            raise ValidationError(
                "Enable ekg before ocean_aggregation (re-enable Ocean if needed) "
                "to register its Memgraph state provider."
            )
        require_no_classes(_source_db(self.database, source))
        api = ekg_api()
        result: dict[str, Any] = {}

        def mutate(run: Any) -> None:
            executor = RunExecutor(run)
            require_no_classes(executor)
            result.update(execute_ocean(executor, log, ekg, spec))

        graph_key = api.derive_state(source, mutate, api.graph_tools())
        return [ObjectDraft(aggregation_name, RESULT_KIND, {
            "source_id": source.id, "backend": "memgraph", "graph_key": graph_key,
            "state": {"provider": PROVIDER, "spec": {"log_config": vars(log), "ekg_config": vars(ekg),
                      "configuration": {"steps": raw}}},
            "aggregation_name": aggregation_name, "configuration": {"steps": raw}, **result,
        })]

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        if obj.meta.get("backend") == "memgraph":
            api = ekg_api()
            api.dispose(obj, api.graph_tools())
        # Neo4j graphs remain shared with the source; deleting a result never clears them.

