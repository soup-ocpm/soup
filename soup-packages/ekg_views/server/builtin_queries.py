"""
------------------------------------------------------------------------
File : builtin_queries.py
Description: The GraphQuery contributions of ekg_views to "ekg.queries":
             every read of the EKG the old /api/v2/graph/* endpoints and
             pages did (Utils/graph_query_lib.py, general_query_lib.py,
             Services/Graph/op_graph_service.py,
             Services/generic_graph_service.py), grouped:
             - Nodi: event nodes, entity nodes, one entity per type
               (get_nodes_entity_query_distinct), the entities of a type,
               the events of an activity;
             - Relazioni: :CORR, :DF, the :DF of one entity type, the
               number of :REL and :CORR per qualifier (OCEL);
             - Conteggi: events, entities, :CORR, :DF, all the nodes;
             - Attività: the distinct activities, their frequency;
             - Entità: the entity keys (types), their number per type,
               the properties with a null/"nan"/"" value
               (get_nan_entities);
             - Tempo: min and max timestamp, as ISO strings (the legacy
               reconstruct_datetime returned {year, month, ...} built
               with integer arithmetic);
             - Grafo: the maximum number of elements the standard view
               can show (get_max_data_to_show, without APOC).
             The Statistiche visualizer reads the same queries (rows()).
Project : soup-packages/ekg_views
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from soup.core.contracts import Field, report

from .database import Query, ident
from .kinds import STANDARD_KINDS
from .queries import (
    Block,
    CountQuery,
    GraphQuery,
    NodeListQuery,
    RelationshipListQuery,
    count_of,
    display,
    limit_fields,
)
from .values import clean
from .views import CORR, DF, ENTITY, EVENT, REL, StandardGraphView

NODES = "Nodi"
RELATIONSHIPS = "Relazioni"
COUNTS = "Conteggi"
ACTIVITIES = "Attività"
ENTITIES = "Entità"
TIME = "Tempo"
GRAPH = "Grafo"


# ---------------------------------------------------------------------- #
# Nodi
# ---------------------------------------------------------------------- #
class EntitiesOfType(NodeListQuery):
    key = "entities_of_type"
    label = "Entità di un tipo"
    node_label = ENTITY
    where = "n.Type = $type"
    fields = (Field("type", "Tipo di entità", required=True), *limit_fields())

    def __init__(self) -> None:
        super().__init__(group=NODES)

    def filter_params(self, params: Mapping[str, Any]) -> dict[str, Any]:
        return {"type": params["type"]}


class EventsOfActivity(NodeListQuery):
    key = "events_of_activity"
    label = "Eventi di un'attività"
    node_label = EVENT
    where = "n.ActivityName = $activity"
    fields = (Field("activity", "Attività", required=True), *limit_fields())

    def __init__(self) -> None:
        super().__init__(group=NODES)

    def filter_params(self, params: Mapping[str, Any]) -> dict[str, Any]:
        return {"activity": params["activity"]}


class EntityPerType(GraphQuery):
    key = "entity_per_type"
    label = "Un'entità per tipo"
    group = NODES

    def build(self, params: Mapping[str, Any]) -> Query:
        return Query("""
            MATCH (e:Entity)
            WITH e.Type AS type, collect(e)[0] AS node
            RETURN type, properties(node) AS props
            ORDER BY type""")

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        property_name = str(params.get("entity_id_property", "Value"))
        rows = [[record.get("type"), display((record.get("props") or {}).get(property_name))] for record in records]
        return [report.table(["tipo", "valore"], rows, title=self.label)]


# ---------------------------------------------------------------------- #
# Relazioni
# ---------------------------------------------------------------------- #
class DfOfType(RelationshipListQuery):
    key = "df_of_type"
    label = "Relazioni DF di un tipo di entità"
    source_label = EVENT
    relationship = DF
    target_label = EVENT
    where = "r.Type = $entity_type"
    fields = (Field("entity_type", "Tipo di entità", required=True), *limit_fields())

    def __init__(self) -> None:
        super().__init__(group=RELATIONSHIPS)

    def filter_params(self, params: Mapping[str, Any]) -> dict[str, Any]:
        return {"entity_type": params["entity_type"]}


# ---------------------------------------------------------------------- #
# Attività
# ---------------------------------------------------------------------- #
class Activities(GraphQuery):
    """get_activities_name_query: the distinct activity names."""

    key = "activities"
    label = "Attività distinte"
    group = ACTIVITIES

    def build(self, params: Mapping[str, Any]) -> Query:
        return Query("""
            MATCH (n:Event)
            WHERE n.ActivityName IS NOT NULL
            RETURN collect(DISTINCT n.ActivityName) AS activities""")

    def rows(self, records: Sequence[Mapping[str, Any]]) -> list[str]:
        if not records:
            return []
        return sorted(str(name) for name in records[0].get("activities") or ())

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        names = self.rows(records)
        return [report.table(["attività"], [[name] for name in names], title=f"{self.label} ({len(names)})")]


class ActivityFrequency(GraphQuery):
    key = "activity_frequency"
    label = "Frequenza delle attività"
    group = ACTIVITIES

    def build(self, params: Mapping[str, Any]) -> Query:
        return Query("""
            MATCH (e:Event)
            RETURN e.ActivityName AS activity, count(e) AS count
            ORDER BY count DESC, activity""")

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        labels = [str(record.get("activity")) for record in records]
        counts = [int(record.get("count") or 0) for record in records]
        return [
            report.chart("bar", labels, [{"label": "eventi", "data": counts}], title=self.label),
            report.table(["attività", "eventi"],
                [[label, count] for label, count in zip(labels, counts, strict=False)],
                title="Valori"),
        ]


# ---------------------------------------------------------------------- #
# Entità
# ---------------------------------------------------------------------- #
class EntityKeys(GraphQuery):
    """get_distinct_entities_keys: the entity types."""

    key = "entity_keys"
    label = "Chiavi delle entità"
    group = ENTITIES

    def build(self, params: Mapping[str, Any]) -> Query:
        return Query("""
            MATCH (n:Entity)
            WITH DISTINCT n.Type AS entity_type
            RETURN entity_type
            ORDER BY entity_type""")

    def rows(self, records: Sequence[Mapping[str, Any]]) -> list[str]:
        return [str(record.get("entity_type")) for record in records if record.get("entity_type") is not None]

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        return [report.table(["tipo di entità"], [[name] for name in self.rows(records)], title=self.label)]


class RelationshipQualifiers(GraphQuery):
    """The :REL and :CORR with a qualifier (from an OCEL log), counted per qualifier."""

    key = "qualifiers"
    label = "Qualifier delle relazioni"
    group = RELATIONSHIPS

    def build(self, params: Mapping[str, Any]) -> Query:
        return Query(f"""
            MATCH ()-[r:{ident(REL)}|{ident(CORR)}]->()
            WHERE r.qualifier IS NOT NULL
            RETURN type(r) AS relationship, r.qualifier AS qualifier, count(r) AS count
            ORDER BY relationship DESC, count DESC, qualifier""")

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        rows = [[str(record.get("relationship")), str(record.get("qualifier")), int(record.get("count") or 0)]
                for record in records]
        return [report.table(["relazione", "qualifier", "numero"], rows, title=self.label)]


class EntitiesPerType(GraphQuery):
    key = "entities_per_type"
    label = "Entità per tipo"
    group = ENTITIES

    def build(self, params: Mapping[str, Any]) -> Query:
        return Query("""
            MATCH (n:Entity)
            RETURN n.Type AS entity_type, count(n) AS count
            ORDER BY count DESC, entity_type""")

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        labels = [str(record.get("entity_type")) for record in records]
        counts = [int(record.get("count") or 0) for record in records]
        return [
            report.chart("pie", labels, [{"label": "entità", "data": counts}], title=self.label),
            report.table(["tipo di entità", "entità"],
                [[label, count] for label, count in zip(labels, counts, strict=False)],
                title="Valori"),
        ]


class NullEntities(GraphQuery):
    """get_nan_entities: the event properties with a null, "nan" or empty value, with the number of events."""

    key = "null_entities"
    label = "Entità con valori nulli"
    group = ENTITIES

    def build(self, params: Mapping[str, Any]) -> Query:
        return Query("""
            MATCH (e:Event)
            WITH e, properties(e) AS props
            UNWIND keys(props) AS prop
            WITH e, prop, props[prop] AS value
            WHERE value IS NULL OR toString(value) = 'nan' OR toString(value) = ''
            RETURN prop, count(DISTINCT e) AS count
            ORDER BY prop""")

    def rows(self, records: Sequence[Mapping[str, Any]]) -> dict[str, int]:
        return {str(record.get("prop")): int(record.get("count") or 0) for record in records}

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        rows = [[name, count] for name, count in self.rows(records).items()]
        return [report.table(["proprietà", "eventi"], rows, title=self.label)]


# ---------------------------------------------------------------------- #
# Tempo
# ---------------------------------------------------------------------- #
def _iso_of_number(value: Any) -> str | None:
    """yyyyMMddHHmmss (as get_min_max_timestamp_query computes it) -> "YYYY-MM-DDTHH:MM:SS"."""

    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return None
    number = int(value)
    year, rest = divmod(number, 10_000_000_000)
    month, rest = divmod(rest, 100_000_000)
    day, rest = divmod(rest, 1_000_000)
    hour, rest = divmod(rest, 10_000)
    minute, second = divmod(rest, 100)
    return f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:{second:02d}"


class Timestamps(GraphQuery):
    key = "timestamps"
    label = "Primo e ultimo timestamp"
    group = TIME

    def build(self, params: Mapping[str, Any]) -> Query:
        # Compared as yyyyMMddHHmmss numbers, like the legacy query.
        return Query("""
            MATCH (n:Event)
            WHERE n.Timestamp IS NOT NULL
            WITH n.Timestamp.year * 10000000000 + n.Timestamp.month * 100000000 + n.Timestamp.day * 1000000
                 + n.Timestamp.hour * 10000 + n.Timestamp.minute * 100 + n.Timestamp.second AS stamp
            RETURN min(stamp) AS min_timestamp, max(stamp) AS max_timestamp""")

    @staticmethod
    def _timestamp(value: Any) -> str | None:
        return value if isinstance(value, str) else _iso_of_number(clean(value))

    def rows(self, records: Sequence[Mapping[str, Any]]) -> dict[str, str | None]:
        record = records[0] if records else {}
        return {"min": self._timestamp(record.get("min_timestamp")),
            "max": self._timestamp(record.get("max_timestamp"))}

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        values = self.rows(records)
        return [report.keyvalue({"primo": values["min"], "ultimo": values["max"]}, title=self.label)]


# ---------------------------------------------------------------------- #
# Grafo
# ---------------------------------------------------------------------- #
class MaxData(GraphQuery):
    key = "max_data"
    label = "Massimo numero di elementi mostrabili"
    group = GRAPH

    def __init__(self) -> None:
        self.view = StandardGraphView()

    def build(self, params: Mapping[str, Any]) -> Query:
        return self.view.max_data_query(self.view.default_relations)

    def transform(self, records: Sequence[Mapping[str, Any]], params: Mapping[str, Any]) -> list[Block]:
        nodes, rels = count_of(records, "total_nodes"), count_of(records, "total_rels")
        return [report.keyvalue({"nodi": nodes, "relazioni": rels, "totale": nodes + rels}, title=self.label)]


# The count queries, also read by the Statistiche visualizer.
COUNT_EVENTS = CountQuery("count_events", "Nodi evento", COUNTS, node_label=EVENT)
COUNT_ENTITIES = CountQuery("count_entities", "Nodi entità", COUNTS, node_label=ENTITY)
COUNT_CORR = CountQuery("count_corr", "Relazioni CORR", COUNTS, relationship=CORR)
COUNT_DF = CountQuery("count_df", "Relazioni DF", COUNTS, relationship=DF)


def builtin_queries() -> list[GraphQuery]:
    """The 21 queries of ekg_views, for "ekg" and "ekg_class" objects (STANDARD_KINDS)."""

    queries = [
        NodeListQuery("event_nodes", "Nodi evento", NODES, node_label=EVENT),
        NodeListQuery("entity_nodes", "Nodi entità", NODES, node_label=ENTITY),
        EntityPerType(),
        EntitiesOfType(),
        EventsOfActivity(),
        RelationshipListQuery("corr", "Relazioni CORR", RELATIONSHIPS, EVENT, CORR, ENTITY),
        RelationshipListQuery("df", "Relazioni DF", RELATIONSHIPS, EVENT, DF, EVENT),
        DfOfType(),
        RelationshipQualifiers(),
        COUNT_EVENTS,
        COUNT_ENTITIES,
        COUNT_CORR,
        COUNT_DF,
        CountQuery("count_nodes", "Tutti i nodi", COUNTS),
        Activities(),
        ActivityFrequency(),
        EntityKeys(),
        EntitiesPerType(),
        NullEntities(),
        Timestamps(),
        MaxData(),
    ]
    for query in queries:
        query.kinds = STANDARD_KINDS
    return queries
