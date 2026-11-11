"""
------------------------------------------------------------------------
File : views.py
Description: The views of the "Grafo" visualizer, contributed to the
             "ekg.graph_views" extension point (contribution key = `key`):
             - GraphView: key, label, the object kinds it draws (`kinds`,
               kinds.py), the relationship types it can show
               (relationship_types, default_relations), edges_query(limit,
               relations) -> Query and to_graph(records) -> the data of a
               "graph" block {nodes, edges, directed}; optionally the
               remote search (search_query, search_count_query,
               search_items), the properties of one node (node_query,
               to_node) and the number of elements it could show
               (max_data_query);
             - EdgeListGraphView: a GraphView of the relationships declared
               in `relationships` (type -> (source label, target label))
               (Template Method, C17). Labels and types are in the pattern,
               like the legacy MATCH (e1:Event)-[r:DF]->(e2:Event), so
               Memgraph reads only what is needed: they come only from this
               closed list, quoted with ident(); the user's choices
               (visible relationships, node label of the search) are first
               checked against it (ValidationError) and only select which
               pattern is built - several types become [r:`DF`|`CORR`].
               Values (search text, id, offset) and the LIMIT stay
               parameters ($limit - never in the text, C22). The edges of
               the graph are read with no global ORDER BY (MATCH ... LIMIT,
               as the legacy query); ORDER BY is kept only for the
               incremental search, which pages with an offset. Subclasses
               only say how a node and an edge are labelled and grouped;
             - StandardGraphView ("standard", kinds "ekg" and
               "ekg_class"): Event-[:DF]->Event and Event-[:CORR]->Entity
               (only :DF by default, like the old graph page), from
               get_complete_standard_graph_query and
               SupportService.extract_graph_data;
             - ObjectGraphView ("object", same kinds): the objects,
               Entity-[:REL]->Entity (the object-object relationships of
               an OCEL log, by qualifier; the default) and
               Event-[:CORR]->Entity (labelled with their qualifier, if
               any). A graph without :REL (e.g. from a CSV) shows none.
             The "max data" query counts the distinct nodes in pure Cypher
             (the legacy get_max_standard_graph_data needed APOC's
             apoc.coll.toSet).
Project : soup-packages/ekg_views
------------------------------------------------------------------------
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable, Mapping, Sequence
from typing import Any, cast

from soup.core.contracts import ValidationError, report

from .database import Query, ident
from .kinds import DEFAULT_KINDS, STANDARD_KINDS
from .values import as_list, clean

NODE = "node"
EDGE = "edge"
SEARCH_KINDS = (NODE, EDGE)

Graph = dict[str, Any]


class GraphView(ABC):
    key: str = ""
    label: str = ""
    # The object kinds whose graph the view draws (kinds.py).
    kinds: Sequence[str] = DEFAULT_KINDS
    relationship_types: Sequence[str] = ()
    default_relations: Sequence[str] = ()
    node_labels: Sequence[str] = ()

    @abstractmethod
    def edges_query(self, limit: int, relations: Sequence[str]) -> Query:
        """At most `limit` edges of the `relations` types (a subset of relationship_types)."""
        raise NotImplementedError

    @abstractmethod
    def to_graph(self, records: Iterable[Mapping[str, Any]]) -> Graph:
        """The rows of edges_query as the data of a "graph" block {nodes, edges, directed}."""
        raise NotImplementedError

    # Optional parts: None means "not supported by this view". `label`
    # narrows a node search to one of node_labels.
    def search_query(self, text: str, kind: str, offset: int, limit: int, relations: Sequence[str],  # noqa: PLR0913, PLR0917 - GraphView contract (ekg.graph_views)
                     label: str | None = None) -> Query | None:
        return None

    def search_count_query(self, text: str, kind: str, relations: Sequence[str],
        label: str | None = None) -> Query | None:
        return None

    def search_items(self, records: Iterable[Mapping[str, Any]], kind: str) -> list[dict[str, Any]]:
        return []

    def node_query(self, node_id: int) -> Query | None:
        return None

    def to_node(self, records: Iterable[Mapping[str, Any]]) -> dict[str, Any] | None:
        return None

    def max_data_query(self, relations: Sequence[str]) -> Query | None:
        return None


# The endpoints and the relationship of an edge, as the rows of every
# EdgeListGraphView edge query return them.
_EDGE_RETURN = """
            RETURN id(a) AS source_id, labels(a) AS source_labels, properties(a) AS source,
                   id(r) AS edge_id, type(r) AS edge_type, properties(r) AS edge,
                   id(b) AS target_id, labels(b) AS target_labels, properties(b) AS target"""

_TEXT_MATCH = "any(k IN keys(p) WHERE toLower(toString(p[k])) CONTAINS toLower($text))"


def label_condition(variable: str, labels: Sequence[str]) -> str:
    """`n:`A` OR n:`B``, each label through ident()."""

    return " OR ".join(f"{variable}:{ident(label)}" for label in labels)


class EdgeListGraphView(GraphView):
    """
    The relationships of `relationships` ({type: (source label, target
    label)}). Override node_label/node_group/edge_type/edge_label to
    change how they are shown.
    """

    relationships: Mapping[str, tuple[str, str]] = {}

    @property
    def relationship_types(self) -> tuple[str, ...]:  # type: ignore[override]  # computed from `relationships` instead of declared
        return tuple(self.relationships)

    @property
    def node_labels(self) -> tuple[str, ...]:  # type: ignore[override]  # computed from `relationships` instead of declared
        labels: list[str] = []
        for source, target in self.relationships.values():
            for name in (source, target):
                if name not in labels:
                    labels.append(name)
        return tuple(labels)

    # --- hooks ------------------------------------------------------------ #
    def node_label(self, labels: Sequence[str], props: Mapping[str, Any]) -> str:
        return str(labels[0]) if labels else ""

    def node_group(self, labels: Sequence[str], props: Mapping[str, Any]) -> str:
        return str(labels[0]) if labels else ""

    def edge_type(self, rel_type: str, props: Mapping[str, Any]) -> str:
        """The type <soup-graph-view> gives colors and visibility by."""
        return rel_type

    def edge_label(self, rel_type: str, props: Mapping[str, Any]) -> str:
        return rel_type

    # --- patterns (closed lists only) -------------------------------------- #
    def chosen_relations(self, relations: Sequence[str]) -> list[str]:
        """`relations` checked against relationship_types; at least one."""

        chosen = as_list(list(relations), "relations", self.relationship_types, ())
        if not chosen:
            raise ValidationError(f"View '{self.key}': choose at least one of {list(self.relationship_types)}")
        return chosen

    def chosen_labels(self, label: str | None) -> list[str]:
        """[label] checked against node_labels, or all of them."""

        if label is None or label == "":
            return list(self.node_labels)
        if label not in self.node_labels:
            raise ValidationError(f"View '{self.key}' has no node label {label!r}; "
                                  f"expected one of {list(self.node_labels)}")
        return [label]

    def edge_pattern(self, relations: Sequence[str]) -> str:
        """MATCH (a:`S`)-[r:`T1`|`T2`]->(b:`D`): an endpoint is labelled when every chosen type agrees on it."""

        chosen = self.chosen_relations(relations)
        sources = {self.relationships[name][0] for name in chosen}
        targets = {self.relationships[name][1] for name in chosen}
        source = f"a:{ident(next(iter(sources)))}" if len(sources) == 1 else "a"
        target = f"b:{ident(next(iter(targets)))}" if len(targets) == 1 else "b"
        types = "|".join(ident(name) for name in chosen)
        return f"MATCH ({source})-[r:{types}]->({target})"

    def node_pattern(self, label: str | None) -> str:
        labels = self.chosen_labels(label)
        if len(labels) == 1:
            return f"MATCH (n:{ident(labels[0])})"
        return f"MATCH (n) WHERE {label_condition('n', labels)}"

    # --- queries ---------------------------------------------------------- #
    def edges_query(self, limit: int, relations: Sequence[str]) -> Query:
        text = f"""
            {self.edge_pattern(relations)}{_EDGE_RETURN}
            LIMIT $limit"""
        return Query(text, {"limit": int(limit)})

    def _search_body(self, text: str, kind: str, relations: Sequence[str], label: str | None) -> str:
        if kind == NODE:
            return f"""
            {self.node_pattern(label)}
            WITH n, properties(n) AS p
            WHERE $text = '' OR {_TEXT_MATCH}"""
        return f"""
            {self.edge_pattern(relations)}
            WITH a, r, b, properties(r) AS p
            WHERE $text = '' OR toLower(type(r)) CONTAINS toLower($text) OR {_TEXT_MATCH}"""

    def search_query(self, text: str, kind: str, offset: int, limit: int, relations: Sequence[str],  # noqa: PLR0913, PLR0917 - GraphView contract (ekg.graph_views)
                     label: str | None = None) -> Query:
        body = self._search_body(text, kind, relations, label)
        # A stable order: the next page continues the previous one.
        if kind == NODE:
            body += """
            RETURN id(n) AS id, labels(n) AS labels, p AS props
            ORDER BY id"""
        else:
            body += _EDGE_RETURN + """
            ORDER BY edge_id"""
        body += """
            SKIP $offset
            LIMIT $limit"""
        return Query(body, {"text": text, "offset": int(offset), "limit": int(limit)})

    def search_count_query(self, text: str, kind: str, relations: Sequence[str], label: str | None = None) -> Query:
        body = self._search_body(text, kind, relations, label)
        body += """
            RETURN count(n) AS count""" if kind == NODE else """
            RETURN count(r) AS count"""
        return Query(body, {"text": text})

    def node_query(self, node_id: int) -> Query:
        text = f"""
            MATCH (n)
            WHERE id(n) = $id AND ({label_condition('n', self.node_labels)})
            RETURN id(n) AS id, labels(n) AS labels, properties(n) AS props"""
        return Query(text, {"id": int(node_id)})

    def max_data_query(self, relations: Sequence[str]) -> Query:
        text = f"""
            {self.edge_pattern(relations)}
            UNWIND [a, b] AS n
            RETURN count(DISTINCT n) AS total_nodes, count(DISTINCT r) AS total_rels"""
        return Query(text)

    # --- rows -> models ---------------------------------------------------- #
    def node_model(self, node_id: Any, labels: Any, props: Any) -> dict[str, Any]:
        """A node as <soup-graph-view> models it: {id, label, group, props}."""

        names = [str(label) for label in (labels or ())]
        values = clean(dict(props or {}))
        return {"id": str(node_id), "label": self.node_label(names, values),
            "group": self.node_group(names, values), "props": values}

    def edge_model(self, record: Mapping[str, Any]) -> dict[str, Any]:
        """An edge as <soup-graph-view> models it: {id, source, target, type, label, weight, props}."""

        rel_type = str(record.get("edge_type") or "")
        props = clean(dict(record.get("edge") or {}))
        weight = props.get("edge_weight", props.get("weight", 1))
        props["weight"] = weight if isinstance(weight, (int, float)) and not isinstance(weight, bool) else 1
        return {
            "id": str(record["edge_id"]),
            "source": str(record["source_id"]),
            "target": str(record["target_id"]),
            "type": self.edge_type(rel_type, props),
            "label": self.edge_label(rel_type, props),
            "weight": props["weight"],
            "props": props,
        }

    def to_graph(self, records: Iterable[Mapping[str, Any]]) -> Graph:
        nodes: dict[str, dict[str, Any]] = {}
        edges: list[dict[str, Any]] = []
        for record in records:
            for side in ("source", "target"):
                node = self.node_model(record[f"{side}_id"], record.get(f"{side}_labels"), record.get(side))
                nodes.setdefault(node["id"], node)
            edge = self.edge_model(record)
            edges.append({**edge, "group": edge["type"]})
        return cast("dict[str, Any]", report.graph(nodes.values(), edges, directed=True)["data"])

    def search_items(self, records: Iterable[Mapping[str, Any]], kind: str) -> list[dict[str, Any]]:
        if kind == NODE:
            return [self.node_model(record["id"], record.get("labels"), record.get("props")) for record in records]
        return [self.edge_model(record) for record in records]

    def to_node(self, records: Iterable[Mapping[str, Any]]) -> dict[str, Any] | None:
        for record in records:
            return self.node_model(record["id"], record.get("labels"), record.get("props"))
        return None


EVENT = "Event"
ENTITY = "Entity"
CORR = "CORR"
DF = "DF"
REL = "REL"


class StandardGraphView(EdgeListGraphView):
    key = "standard"
    label = "Grafo standard"
    kinds = STANDARD_KINDS
    relationships = {DF: (EVENT, EVENT), CORR: (EVENT, ENTITY)}
    default_relations = (DF,)

    activity_property = "ActivityName"
    entity_id_property = "Value"

    def node_label(self, labels: Sequence[str], props: Mapping[str, Any]) -> str:
        if ENTITY in labels:
            return str(props.get(self.entity_id_property, ""))
        return str(props.get(self.activity_property, super().node_label(labels, props)))

    def node_group(self, labels: Sequence[str], props: Mapping[str, Any]) -> str:
        # Events by node type, entities by entity type.
        if ENTITY in labels:
            return str(props.get("Type") or ENTITY)
        return EVENT if EVENT in labels else super().node_group(labels, props)

    def edge_type(self, rel_type: str, props: Mapping[str, Any]) -> str:
        # :DF by the entity type they follow (props.Type), as in the old
        # page; all :CORR alike.
        if rel_type == DF and props.get("Type"):
            return str(props["Type"])
        return rel_type

    def edge_label(self, rel_type: str, props: Mapping[str, Any]) -> str:
        return self.edge_type(rel_type, props)


class ObjectGraphView(StandardGraphView):
    key = "object"
    label = "Grafo degli oggetti"
    relationships = {REL: (ENTITY, ENTITY), CORR: (EVENT, ENTITY)}
    default_relations = (REL,)

    def edge_type(self, rel_type: str, props: Mapping[str, Any]) -> str:
        # :REL by qualifier (a color and a checkbox each); all :CORR alike.
        if rel_type == REL and props.get("qualifier"):
            return str(props["qualifier"])
        return rel_type

    def edge_label(self, rel_type: str, props: Mapping[str, Any]) -> str:
        return str(props.get("qualifier") or rel_type)
