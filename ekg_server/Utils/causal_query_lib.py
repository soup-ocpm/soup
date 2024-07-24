"""
------------------------------------------------------------------------
File : casual_query.py
Description: Cypher casual query for support EKG creation
Date creation:
Project : ekg_server
Author: Sara Pettinari
Copyright: Copyright (c) 2024 Sara Pettinari <sara.pettinari@gssi.it>
License : MIT
------------------------------------------------------------------------
"""


def reveal_causal_rels(trigger, target):
    confounder_q = find_causal_node(trigger, target, 'confounder')

    confounder_rel_q = set_causal_rels(trigger, target, 'confounder')

    collider_q = find_causal_node(trigger, target, 'collider')

    collider_rel_q = set_causal_rels(trigger, target, 'collider')

    target_q = set_target_df(trigger, target)

    trigger_q = set_trigger_df(trigger)

    queries = [confounder_q, confounder_rel_q, collider_q, collider_rel_q, target_q, trigger_q]
    return (queries)


def find_causal_node(trigger, target, node_type):
    direction = '>' if node_type == 'collider' else '<'
    relation = node_type
    orderby = 'ASC' if node_type == 'collider' else 'DESC'

    return (f"""
           MATCH (e:Event)-[:CORR]->(a:Entity {{Type: "{trigger}"}})
            OPTIONAL MATCH (e)-[:CORR]->(b:Entity {{Type: "{target}"}})
            WITH a, b, e
            ORDER BY e.Timestamp
            WITH a, b, COLLECT(e) AS event_list, MIN(e.Timestamp) AS min_timestamp
            ORDER BY min_timestamp

            WITH a.Value as a, collect([b.Value, event_list]) as b_list
            WITH a, head(b_list) AS first_trace, tail(b_list) AS remaining_traces

            UNWIND remaining_traces AS trace
            WITH a, first_trace[1] AS first_trace_events, trace[1] AS trace_event
            WITH a, first_trace_events, COLLECT(trace_event) AS remaining_events

            UNWIND first_trace_events AS fe
            UNWIND remaining_events AS trace
            WITH a, fe, remaining_events, trace[0] AS trace_event
            WITH a, fe, remaining_events, trace_event.Timestamp AS trace_timestamp
            WITH a, fe, remaining_events, COLLECT(trace_timestamp) AS remaining_timestamps
            WHERE ALL(ts IN remaining_timestamps WHERE fe.Timestamp {direction} ts)
            WITH a, fe ORDER BY fe.Timestamp {orderby}
            WITH a, collect(fe) AS fee
            WITH a, fee[0] AS {relation}_node
            SET {relation}_node.relation = '{relation}'
           """
            )


def set_causal_rels(trigger, target, node_type):
    direction = '>' if node_type == 'collider' else '<'
    relation = node_type
    orderby = 'DESC' if node_type == 'collider' else 'ASC'
    connection = ['<-', '-'] if node_type == 'collider' else ['-', '->']

    return (f"""
        MATCH (e:Event)-[:CORR]->(a:Entity {{Type: "{trigger}"}})
        WHERE e.relation = '{relation}'
        MATCH (a)<-[:CORR]-(e1:Event)-[:CORR]->(b:Entity {{Type: "{target}"}})
        WITH e, a, b, e1
        ORDER BY e1.Timestamp {orderby}
        WITH DISTINCT b, a, e1, e
        WITH b, a, collect(e1) AS event_list, e
        WHERE ALL(ev IN event_list WHERE e.Timestamp {direction} ev.Timestamp)
        WITH e, a, event_list[0] as out_{relation}
        MERGE (e){connection[0]}[:DF {{Type: a.Type, relation: 'causal'}}]{connection[1]}(out_{relation})
        """

            )


def set_target_df(trigger, target):
    return (f"""
            MATCH (no:Entity {{Type:"{trigger}"}})<-[:CORR]-(e:Event)-[:CORR]->(n:Entity {{Type:"{target}"}})
            WITH e, n, no
            ORDER BY e.Timestamp, ID(e)
            WITH n, no, collect(e) AS event_list
            UNWIND range(0, size(event_list)-2) AS i
            WITH no, n, event_list[i] AS e1, event_list[i+1] AS e2
            MERGE (e1)-[df:DF {{Type:n.Type, ID:n.Value, edge_weight: 1}}]->(e2)
            MERGE (e1)-[df0:DF {{Type:no.Type, ID:no.Value, relation: 'causal', edge_weight: 1}}]->(e2)
           """
            )


def set_trigger_df(trigger):
    return (f"""
            MATCH (e:Event)-[:CORR]->(a:Entity {{Type:"{trigger}"}})
            WITH e, a
            ORDER BY e.Timestamp, ID(e)
            WITH a, collect(e) AS event_list
            UNWIND range(0, size(event_list)-2) AS i
            WITH a, event_list[i] AS e1, event_list[i+1] AS e2
            WHERE not (e1.relation = 'confounder' AND e2.relation = 'collider')
            MERGE (e1)-[df:DF {{Type:a.Type, ID:a.Value, edge_weight: 1}}]->(e2)
           """)


########################


def find_confounder_node(trigger, target):
    return (f"""
            MATCH (e:Event)-[:CORR]->(a:Entity {{Type: "{trigger}"}})
            OPTIONAL MATCH (e)-[:CORR]->(b:Entity {{Type: "{target}"}})
            WITH a, b, e
            ORDER BY e.Timestamp
            WITH a, b, COLLECT(e) AS event_list, MIN(e.Timestamp) AS min_timestamp
            ORDER BY min_timestamp

            WITH a.Value as a, collect([b.Value, event_list]) as b_list
            WITH a, head(b_list) AS first_trace, tail(b_list) AS remaining_traces

            UNWIND remaining_traces AS trace
            WITH a, first_trace[1] AS first_trace_events, trace[1] AS trace_event
            WITH a, first_trace_events, COLLECT(trace_event) AS remaining_events

            UNWIND first_trace_events AS fe
            UNWIND remaining_events AS trace
            WITH a, fe, remaining_events, trace[0] AS trace_event
            WITH a, fe, remaining_events, trace_event.Timestamp AS trace_timestamp
            WITH a, fe, remaining_events, COLLECT(trace_timestamp) AS remaining_timestamps
            WHERE ALL(ts IN remaining_timestamps WHERE fe.Timestamp < ts)
            WITH a, fe ORDER BY fe.Timestamp DESC
            WITH a, collect(fe) AS fee
            WITH a, fee[0] AS confounder_node
            SET confounder_node.relation = 'confounder'
           """
            )


def set_confounder_rels(trigger, target):
    return (f"""
        MATCH (e:Event)-[:CORR]->(a:Entity {{Type: "{trigger}"}})
        WHERE e.relation = 'confounder'
        MATCH (a)<-[:CORR]-(e1:Event)-[:CORR]->(b:Entity {{Type: "{target}"}})
        WITH e, a, b, e1
        ORDER BY e1.Timestamp
        WITH DISTINCT b, a, e1, e
        WITH b, a, collect(e1) AS event_list, e
        WHERE all(ev IN event_list WHERE e.Timestamp < ev.Timestamp)
        WITH e, a, event_list[0] as out_confounder
        MERGE (e)-[:DF {{Type: a.Type, relation: 'causal'}}]->(out_confounder)
           """

            )


def find_collider_node(trigger, target):
    return (f"""
            MATCH (e:Event)-[:CORR]->(a:Entity {{Type: "{trigger}"}})
            OPTIONAL MATCH (e)-[:CORR]->(b:Entity {{Type: "{target}"}})
            WITH e, a, b
            ORDER BY e.Timestamp
            WITH a, b, COLLECT(e) AS event_list, MIN(e.Timestamp) AS min_timestamp
            ORDER BY min_timestamp

            WITH a.Value as a, collect([b.Value, event_list]) as b_list
            WITH a, head(b_list) AS first_trace, tail(b_list) AS remaining_traces
            
            UNWIND remaining_traces AS trace
            WITH a, first_trace[1] AS first_trace_events, trace[1] AS trace_event
            WITH a, first_trace_events, COLLECT(trace_event) AS remaining_events

            UNWIND first_trace_events AS fe
            UNWIND remaining_events AS trace
            WITH a, fe, remaining_events, trace[0] AS trace_event
            WITH a, fe, remaining_events, trace_event.Timestamp AS trace_timestamp
            WITH a, fe, remaining_events, COLLECT(trace_timestamp) AS remaining_timestamps
                        
            WHERE ALL(ts IN remaining_timestamps WHERE fe.Timestamp > ts)
            WITH a, fe ORDER BY fe.Timestamp ASC
            WITH a, collect(fe) AS fee
            WITH a, fee[0] AS collider_node
            SET collider_node.relation = 'collider'
           """)


def set_collider_rels(trigger, target):
    return (f"""
            MATCH (e:Event)-[:CORR]->(a:Entity {{Type: "{trigger}"}})
            WHERE e.relation = 'collider'
            MATCH (a)<-[:CORR]-(e1:Event)-[:CORR]->(b:Entity {{Type: "{target}"}})
            WITH e, a, b, e1
            ORDER BY e1.Timestamp DESC
            WITH DISTINCT b, a, e1, e
            WITH b, a, collect(e1) AS event_list, e
            WHERE all(ev IN event_list WHERE e.Timestamp > ev.Timestamp)
            // Get the first event occurrence with higher timestamp value
            WITH e, a, event_list[0] as out_collider
            MERGE (e)<-[:DF {{Type: a.Type, relation: 'causal'}}]-(out_collider)
           """)
