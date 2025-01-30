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


def include_activity_filter_query(activities):
    """
    Include activity filter query
    :param activities: list of the activities
    :return: the filtered graph
    """
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE e1.ActivityName = '{activities}' AND e2.ActivityName = '{activities}' "
            f"RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
            f"id(r) as edge_id, e2 as target, id(e2) as target_id ")


def include_activity_filter_delete_query(activities):
    """
    Include activity filter delete query
    :param activities: the activities
    :return: the filtered graph
    """
    activities_str = "', '".join(activities)
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE NOT (e1.ActivityName IN ['{activities_str}'] AND e2.ActivityName IN ['{activities_str}']) "
            f"DETACH DELETE e1, e2, r")


def exclude_activity_filter_query(activities):
    """
    Exclude activity filter query
    :param activities: the activities
    :return: the filtered graph
    """
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE NOT (e1.ActivityName = '{activities}' AND e2.ActivityName = '{activities}') "
            f"RETURN e1 as source, id(e1) as source_id, properties(r) as edge, "
            f"id(r) as edge_id, e2 as target, id(e2) as target_id ")


def exclude_activity_filter_delete_query(activities):
    """
    Exclude activity filter delete query
    :param activities: the activities
    :return: the filtered graph
    """
    activities_str = "', '".join(activities)
    return (f"MATCH (e1:Event)-[r:DF]->(e2:Event) "
            f"WHERE (e1.ActivityName IN ['{activities_str}'] OR e2.ActivityName IN ['{activities_str}']) "
            f"DETACH DELETE e1, e2, r")


def frequency_filter_query(frequency):
    """
    Frequency filter query
    :param frequency: the frequency
    :return: the activities and frequencies
    """
    return (f"MATCH (e1:Event) "
            f"WITH e.ActivityName AS activities, COUNT(e) AS frequency "
            f"WHERE frequency >= {frequency} "
            f"RETURN activities, frequency "
            f"ORDER BY frequency ASC ")


def variation_filter_query():
    """
    Variation filter query
    :return: the activities and durations
    """
    query = """
    MATCH (start:Event)-[:DF*]->(end:Event)
    WITH start.EventID AS caseId, COLLECT(start.ActivityName) + COLLECT(end.ActivityName) AS activities,
    duration.between(start.Timestamp, end.Timestamp) AS duration
    RETURN activities, AVG(duration.seconds) AS avg_duration, COUNT(*) AS frequency
    ORDER BY avg_duration ASC;
    """
    return query


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
