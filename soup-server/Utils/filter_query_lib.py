"""
------------------------------------------------------------------------
File : filter_query_lib.py
Description: Cypher query library for filter EKG
Date creation: 22-12-2024
Project : soup-server
Author: Alessio Giacché & Sara Pettinari
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com> & Sara Pettinari <sara.pettinari@gssi.it>
License : MIT
------------------------------------------------------------------------
"""


def timestamp_filter_query(start_date, end_date):
    """
    Timestamp filter query
    :param start_date: the start date
    :param end_date: the end date
    :return the filtered graph
    """
    start_date = clean_timestamp(start_date)
    end_date = clean_timestamp(end_date)

    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE e1.Timestamp >= localDateTime({start_date}) AND e1.Timestamp <= localDateTime({end_date}) "
            f"AND e2.Timestamp >= localDateTime({start_date}) AND e2.Timestamp <= localDateTime({end_date}) "
            f"RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
            f"id(r) as edge_id, e2 as target, id(e2) as target_id ")


def timestamp_filter_delete_query(start_date, end_date):
    """
    Timestamp filter delete query
    :param start_date: the start date
    :param end_date: the end date
    :return the filtered graph
    """
    start_date = clean_timestamp(start_date)
    end_date = clean_timestamp(end_date)

    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE NOT (e1.Timestamp >= localDateTime('{start_date}') AND e1.Timestamp <= localDateTime('{end_date}')) "
            f"AND NOT (e2.Timestamp >= localDateTime('{start_date}') AND e2.Timestamp <= localDateTime('{end_date}')) "
            f"DETACH DELETE e1, e2, r")


def performance_filter_query(start_activity_name, end_activity_name, duration):
    """
    Performance filter query
    :param start_activity_name: the start activity name
    :param end_activity_name: the end activity name
    :param duration: the duration
    :return: the filtered graph
    """
    return (f"MATCH (start: Event {{ActivityName: '{start_activity_name}'}}) "
            f"MATCH (end: Event {{ActivityName: '{end_activity_name}'}}) "
            f"WHERE start.Timestamp < end.Timestamp "
            f"WITH start, end, duration.between(start.Timestamp, end.Timestamp) AS duration "
            f"WHERE duration.seconds > {duration} "
            f"MERGE (start)-[r:HAS_DURATION {{duration_seconds: duration.seconds}}]->(end) "
            f"RETURN start, r, end")


def performance_filter_delete_query(start_activity_name, end_activity_name, duration):
    """
    Performance filter delete query
    :param start_activity_name: the start activity name
    :param end_activity_name: the end activity name
    :param duration: the duration
    :return: the filtered graph
    """
    return (f"MATCH (start: Event {{ActivityName: '{start_activity_name}'}}) "
            f"MATCH (end: Event {{ActivityName: '{end_activity_name}'}}) "
            f"WHERE start.Timestamp < end.Timestamp "
            f"WITH start, end, (end.Timestamp - start.Timestamp) AS time_diff "
            f"WITH start, end, time_diff, "
            f"(time_diff.day * 86400) + (time_diff.hour * 3600) + (time_diff.minute * 60) + time_diff.second AS total_seconds "
            f"WHERE total_seconds <= {duration} "
            f"DETACH DELETE start, end")


def clean_timestamp(timestamp):
    """
    Clean the timestamp
    :param timestamp:  the time to clean
    :return: the cleaned timestamp
    """
    if timestamp.endswith("Z"):
        return timestamp[:-1]

    if "+" in timestamp or "-" in timestamp:
        return timestamp.split("+")[0].split("-")[0]

    return timestamp


########################## NEW FILTERS ##########################

######## ACTIVITY FILTERS ########
def exclude_activity_filter_query(activity):
    """
    Exclude an activity from the EKG and infers the DF relationships between its predecessors and successors.
    """
    query = f"""
        MATCH (e:Event {{ActivityName: '{activity}'}})
        OPTIONAL MATCH (pred:Event)-[inRel:DF]->(e)
        OPTIONAL MATCH (e)-[outRel:DF]->(succ:Event)
        WITH e, pred, succ, inRel, outRel
        FOREACH (_ IN CASE WHEN pred IS NOT NULL AND succ IS NOT NULL AND inRel IS NOT NULL AND outRel IS NOT NULL AND inRel.Type = outRel.Type THEN [1] ELSE [] END |
            MERGE (pred)-[newRel:DF {{Type: inRel.Type}}]->(succ)
            SET newRel.edge_weight = inRel.edge_weight
        )
        WITH DISTINCT e
        DETACH DELETE e
    """
    return query



######## PERFORMANCE FILTERS ########
def generic_trace_duration_query(ent_type):
    return (f'''
                MATCH (e:Event)-[:CORR]->(t:Entity {{Type: "{ent_type}"}})
                WITH e, t.Value AS entity ORDER BY e.Timestamp ASC
                WITH entity, COLLECT(e) AS events
                WITH entity, HEAD(events) AS StartNode, LAST(events) AS EndNode
                WITH entity, (EndNode.Timestamp - StartNode.Timestamp) AS duration
                ''')


def get_entity_trace_duration(ent_type):
    """
    Calculate the duration of the trace for a specific entity type
    :param ent_type: the entity type
    :return: the cypher query
    :query_returns: the entity and the duration (only in HH:M:SS format)
    """
    query = generic_trace_duration_query(ent_type)
    return query + ('''\n
            RETURN entity AS entity_id, duration AS iso_duration
            ''')


def filter_entity_performance(ent_type, operator, duration):
    """
    Filter the trace for a specific entity type
    :param ent_type: the entity type
    :param operator: >, <, >=, <=, =, !=
    :param duration: the duration
    :return: the cypher query and a filtered EKG
    """
    query = generic_trace_duration_query(ent_type)
    duration_iso = f"PT{duration}S"
    return query + (f'''\n
            WHERE duration {operator} duration("{duration_iso}")
            WITH entity
            MATCH (e:Event)-[:CORR]->(t:Entity  {{Type: "{ent_type}", Value: entity}})
            DETACH DELETE e
            ''')


######## FREQUENCY FILTERS ########

def get_activity_frequency_query(ent_type):
    """
    Get the activity frequency query
    :param ent_type: the entity type
    :return: the cypher query
    :query_returns: the activity and the frequency
    """
    return (f'''
            MATCH (e:Event)-[:CORR]->(t:Entity {{Type: "{ent_type}"}})
            RETURN e.ActivityName AS Activity, count(*) AS Occurrences
            ORDER BY Occurrences DESC
            ''')


def filter_activity_frequency(ent_type, operator, frequency):
    """
    Filter the activity frequency
    :param ent_type: the entity type
    :param operator: >, <, >=, <=, =, !=
    :param frequency: the frequency
    :return: the cypher query and a filtered EKG
    """
    return (f'''
            MATCH (e:Event)-[:CORR]->(t:Entity {{Type: "{ent_type}"}})
            WITH e.ActivityName AS Activity, COLLECT(e) as Events
            WHERE SIZE(Events) {operator} {frequency}
            UNWIND Events AS e_keep
            WITH COLLECT(e_keep) AS EventsToKeep

            // Match all other events (those NOT in EventsToKeep)
            MATCH (e:Event)
            WHERE NOT e IN EventsToKeep
            // Find predecessors and successors of the event in the DF chain
            OPTIONAL MATCH (prev)-[df1:DF]->(e)-[df2:DF]->(next)
            // Create a new connection from the predecessor to the successor if both exist
            FOREACH (_ IN CASE WHEN prev IS NOT NULL AND next IS NOT NULL THEN [1] ELSE [] END | 
                MERGE (prev)-[:DF]->(next)
            )
            // Delete the original event and its DF relationships
            DETACH DELETE e
            ''')


######## VARIANT FILTERS ########

def get_variant_query(ent_type):
    """
    Get the variant query
    :param ent_type: the entity type
    :return: the cypher query
    :query_returns: the activity and the frequency
    """
    return (f'''
            MATCH (e:Event)-[:CORR]->(t:Entity {{Type: "{ent_type}"}})
            WITH e, t.Value AS entity 
            ORDER BY e.Timestamp ASC
            WITH entity, COLLECT(e.ActivityName) AS events
            WITH events, COUNT(*) AS event_count
            RETURN events, event_count
            ORDER BY event_count DESC
            ''')


def filter_entity_variant(ent_type, operator, variant):
    """
    Filter the entity variant
    :param ent_type: the entity type
    :param operator: >, <, >=, <=, =, !=
    :param variant: the variant expressed as a number of trace occurrences
    """
    return (f'''    
            MATCH (e:Event)-[:CORR]->(t:Entity {{Type: "{ent_type}"}})
            WITH e, t AS entity
            ORDER BY e.Timestamp ASC
            WITH entity, COLLECT(e.ActivityName) AS events
            WITH events, COUNT(*) AS event_count, COLLECT(entity) AS entities
            WHERE event_count {operator} {variant}  
            MATCH (e2:Event)-[:CORR]->(t2:Entity {{Type: "{ent_type}"}})
            WHERE t2 IN entities
            DETACH DELETE e2
            ''')
