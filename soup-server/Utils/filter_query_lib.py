"""
------------------------------------------------------------------------
File : filter_query_lib.py
Description: Cypher query library for filter EKG
Date creation: 22-12-2024
Project : soup-server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""


def timestamp_filter_query(start_timestamp, end_timestamp):
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE e1.Timestamp >= localDateTime({start_timestamp}) AND e1.Timestamp <= localDateTime({end_timestamp}) "
            f"AND e2.Timestamp >= localDateTime({start_timestamp}) AND e2.Timestamp <= localDateTime({end_timestamp}) "
            f"RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
            f"id(r) as edge_id, e2 as target, id(e2) as target_id ")


def performance_filter_name_query(start_activity_name, end_activity_name, duration):
    return (f"MATCH (start: Event {{ActivityName: '{start_activity_name}'}}) "
            f"MATCH (end: Event {{ActivityName: '{end_activity_name}'}}) "
            f"WHERE start.Timestamp < end.Timestamp "
            f"WITH start, end, duration.between(start.Timestamp, end.Timestamp) "
            f"AS duration "
            f"WHERE duration.seconds > {duration} "
            f"MERGE (start)-[r:HAS_DURATION {{duration_seconds: duration.seconds}}]->(end) "
            f"RETURN start, r, end")


def include_activity_filter_query(activities):
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE e1.ActivityName = '{activities}' AND e2.ActivityName = '{activities}' "
            f"RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
            f"id(r) as edge_id, e2 as target, id(e2) as target_id ")


def exclude_activity_filter_query(activities):
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE NOT (e1.ActivityName = '{activities}' AND e2.ActivityName = '{activities}') "
            f"RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
            f"id(r) as edge_id, e2 as target, id(e2) as target_id ")


def frequency_filter_query(frequency):
    return (f"MATCH (e1:Event) "
            f"WITH e.ActivityName AS activities, COUNT(e) AS frequency "
            f"WHERE frequency >= {frequency} "
            f"RETURN activities, frequency "
            f"ORDER BY frequency ASC ")


def variation_filter_query():
    query = """
    MATCH (start:Event)-[:DF*]->(end:Event)
    WITH start.EventID AS caseId, COLLECT(start.ActivityName) + COLLECT(end.ActivityName) AS activities,
    duration.between(start.Timestamp, end.Timestamp) AS duration
    RETURN activities, AVG(duration.seconds) AS avg_duration, COUNT(*) AS frequency
    ORDER BY avg_duration ASC;
    """
    return query


def prototype_combined_query(filters):
    # 1. Base
    base_query = "MATCH (e1:Event)-[r:DF]->(e2:Event) WHERE 1=1 "

    # 2. Timestamp filters
    for timestamp_filter in filters.get("timestamp", []):
        start_date = timestamp_filter["startDate"]
        end_date = timestamp_filter["endDate"]

        # 2.1 Clean the timestamp
        start_date = clean_timestamp(start_date)
        end_date = clean_timestamp(end_date)

        base_query += (f"AND e1.Timestamp >= localDateTime(toString({start_date})) "
                       f"AND e1.Timestamp <= localDateTime(toString({end_date})) "
                       f"AND e2.Timestamp >= localDateTime(toString({start_date})) "
                       f"AND e2.Timestamp <= localDateTime(toString({end_date})) ")

    # 3. Performance filters
    for performance_filter in filters.get("performance", []):
        start_activity = performance_filter["startActivity"]
        end_activity = performance_filter["endActivity"]
        seconds = performance_filter["seconds"]

        # 3.1 Calculate the seconds
        base_query += (f"WITH e1, e2, r "
                       f"MATCH (start:Event {{ActivityName: '{start_activity}'}}), "
                       f"(end:Event {{ActivityName: '{end_activity}'}}) "
                       f"WHERE start.Timestamp < end.Timestamp "
                       f"WITH e1, e2, r, start, end, (end.Timestamp - start.Timestamp) AS time_diff "
                       f"WITH e1, e2, r, start, end, time_diff, "
                       f"(time_diff.day * 86400) + (time_diff.hour * 3600) + (time_diff.minute * 60) + time_diff.second AS total_seconds "
                       f"WHERE total_seconds > {seconds} ")

    # 4. Include activities filters
    for include_filter in filters.get("includeActivities", []):
        activities = include_filter["activities"]
        base_query += "AND ("
        base_query += " OR ".join([f"e1.ActivityName = '{activity}' AND e2.ActivityName = '{activity}'"
                                   for activity in activities])
        base_query += ") "

    # 5. Exclude activities filters
    for exclude_filter in filters.get("excludeActivities", []):
        activities = exclude_filter["activities"]
        base_query += "AND NOT ("
        base_query += " OR ".join([f"e1.ActivityName = '{activity}' AND e2.ActivityName = '{activity}'"
                                   for activity in activities])
        base_query += ") "

    # 6. Return the result
    base_query += ("RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
                   "id(r) as edge_id, e2 as target, id(e2) as target_id")

    return base_query


def clean_timestamp(timestamp):
    if timestamp.endswith("Z"):
        return timestamp[:-1]

    if "+" in timestamp or "-" in timestamp:
        return timestamp.split("+")[0].split("-")[0]

    return timestamp
