"""
------------------------------------------------------------------------
File : query_library.py
Description: Cypher query library for EKG
Date creation: 06-02-2024
Project : ekg_server
Author: Alessio Giacché
Copyright: Copyright (c) 2024 Alessio Giacché <ale.giacc.dev@gmail.com>
License : MIT
------------------------------------------------------------------------
"""


# Query for Graph (Standard)

def load_event_node_query(container_csv_path, event_id_col, timestamp_col, activity_col, dataset_name,
                          cypher_properties):
    properties_string = ', '.join(cypher_properties)
    return (f"LOAD CSV FROM '{container_csv_path}' WITH HEADER AS row "
            f"CREATE (e:Event {{EventID: row.{event_id_col}, DatasetName: '{dataset_name}', Timestamp: localDateTime(row.{timestamp_col}), ActivityName: row.{activity_col}, {properties_string}}});")


def create_node_event_query(cypher_properties):
    return f"CREATE (e:Event {{EventID: $event_id, DatasetName: $dataset_name, Timestamp: localDateTime($timestamp), ActivityName: $activity_name, {', '.join(cypher_properties)}}})"


def load_entity_node_query(container_csv_path, dataset_name):
    return (f"LOAD CSV FROM '{container_csv_path}' WITH HEADER AS row "
            f"MERGE (e:Entity {{Value: row.value, Type: row.type, DatasetName: '{dataset_name}'}})")


def create_node_entity_query():
    return "MERGE (e:Entity {Value: $property_value, Type: $type_value, DatasetName: $dataset_name})"


def create_entity_from_events(entity_type):
    return f""" MATCH (e:Event) 
                UNWIND e[{entity_type}] AS entity_name
                WITH DISTINCT entity_name
                MERGE (n:Entity {{entity_id: entity_name, type: '{entity_type}'}})
                RETURN keys(n) LIMIT 1
            """


def create_entity_index():
    return ("""
           CREATE INDEX ON :Entity(Value)
           """)


def create_corr_relation_query(key):  # checks if an entity has multiple values
    return (f"""
            MATCH (e:Event) 
            WITH e, 
                CASE WHEN toString(e.{key}) <> "nan"
                    THEN split(e.{key}, ',')
                    ELSE [e.{key}]
                END AS entities
            UNWIND entities AS entity_id
            WITH DISTINCT entity_id, e
            MATCH (ent:Entity {{Value: entity_id}})
            MERGE (e)-[c:CORR {{Type: '{key}'}}]->(ent)
            """)


def create_df_relation_query(key):
    return f"""
            MATCH (e:Event)-[:CORR]->(n:Entity)
            WHERE n.Type = '{key}'
            WITH n, e AS nodes ORDER BY e.Timestamp, ID(e)
            WITH n, collect(nodes) AS event_node_list
            UNWIND range(0, size(event_node_list)-2) AS i
            WITH n, event_node_list[i] AS e1, event_node_list[i+1] AS e2
            MERGE (e1)-[df:DF {{ Type:n.Type, ID:n.Value, edge_weight: 1}}]->(e2)
            """


def create_class_multi_query(matching_perspectives, dataset_name):
    class_type = 'Class'
    main_query = f'MATCH (e:Event {{DatasetName: "{dataset_name}"}}) \n'

    perspectives_dict = {}
    event_id = '"c_" + '
    for p in matching_perspectives:
        p_val = f'e.{p}'
        event_id += f' {p_val}'
        perspectives_dict[p] = p_val
        if p != matching_perspectives[-1]:
            event_id += ' + "_" +'

    perspectives_dict['Event_Id'] = event_id
    perspectives_dict['Type'] = f'"{class_type}"'
    perspectives_dict['DatasetName'] = f'"{dataset_name}"'

    res_dict = str(perspectives_dict).replace("'", "")

    class_creation = f'MERGE (c:Class {res_dict})'

    main_query += class_creation + '\n WITH c, e' + '\n MERGE (e) -[:OBSERVED]-> (c)'

    return main_query


def class_df_aggregation(rel_type, class_rel_type):
    return f"""
                MATCH (c1 : Class) <-[:OBSERVED]- (e1 : Event) -[r]-> (e2 : Event) -[:OBSERVED]-> (c2 : Class)
                WHERE c1.Type = c2.Type and type(r) = '{rel_type}'
                WITH r.Type as CType, c1, count(r) AS df_freq, c2
                MERGE (c1) -[:{class_rel_type} {{Type:CType, edge_weight: df_freq}}]-> (c2)
            """


# Other utils query for Graph (Standard)

def create_dataset_node(dataset_name):
    return f"MERGE (e: Dataset {{Name: '{dataset_name}'}})"


def check_unique_dataset_name_query(dataset_name):
    return (f"MATCH (e: Dataset {{Name: '{dataset_name}'}}) "
            f"RETURN COUNT(e) AS count")


def get_dataset_nodes_query():
    return "MATCH (e: Dataset) RETURN e as node"


def get_nodes_event_query(dataset_name):
    return f"""
            MATCH (e:Event {{DatasetName: '{dataset_name}'}}) 
            RETURN e AS node
            """


def get_count_nodes_event_query(dataset_name):
    return f"""
            MATCH (n: Event {{DatasetName: '{dataset_name}'}})
            RETURN COUNT(n) as node_count
            """


def get_nodes_entity_query(dataset_name):
    return f"""
            MATCH (e:Entity {{DatasetName: '{dataset_name}'}})
            RETURN e AS node
            """


def get_count_nodes_entity_query(dataset_name):
    return f"""
            MATCH (n: Entity {{DatasetName: '{dataset_name}'}})
            RETURN COUNT(n) as entity_count
            """


def get_nodes_details_query():
    return """
            MATCH (event:Event)
            WITH collect(event) AS data, 'events' AS type, size(collect(event)) AS count
            RETURN data, type, count
            UNION
            MATCH (entity:Entity)
            WITH collect(entity) AS data, 'entities' AS type, size(collect(entity)) AS count
            RETURN data, type, count
            """


def get_nodes_details_length_query(limit):
    return f"""
            MATCH (event:Event)
            WITH collect(event) AS data, 'events' AS type, size(collect(event)) AS count
            RETURN data, type, count
            LIMIT {limit}
            UNION
            MATCH (entity:Entity)
            WITH collect(entity) AS data, 'entities' AS type, size(collect(entity)) AS count
            RETURN data, type, count
            LIMIT {limit}
            """


def get_corr_relation_query(dataset_name):
    return f"""
            MATCH (e: Event {{DatasetName: '{dataset_name}'}})-[corr:CORR]->(en:Entity {{DatasetName: '{dataset_name}'}})
            RETURN e, corr, en
            """


def get_count_corr_rel_query(dataset_name):
    return f"""
            MATCH (e:Event {{DatasetName: '{dataset_name}'}})-[corr:CORR]->(e1:Entity {{DatasetName: '{dataset_name}'}})
            RETURN COUNT(corr) as corr_count
            """


def get_df_relation_query(dataset_name):
    return f"""
            MATCH (e:Event {{DatasetName: '{dataset_name}'}})-[df:DF]->(e1:Event {{DatasetName: '{dataset_name}'}})
            RETURN e, df, e1
            """


def get_count_df_rel_query(dataset_name):
    return f"""
            MATCH (e:Event {{DatasetName: '{dataset_name}'}})-[df:DF]->(e1:Event {{DatasetName: '{dataset_name}'}})
            RETURN COUNT(df) as df_count
            """


def get_complete_standard_graph_query(dataset_name):
    return f"""
            MATCH (e1:Event {{DatasetName: "{dataset_name}"}})-[r:DF]->(e2:Event {{DatasetName: "{dataset_name}"}})
            RETURN e1 as source, id(e1) as source_id, properties(r) as edge, 
            id(r) as edge_id, e2 as target, id(e2) as target_id
            """


def get_limit_standard_graph_query(dataset_name, limit):
    return f"""@
            MATCH (e1:Event {{DatasetName: "{dataset_name}"}})-[r:DF]->(e2:Event {{DatasetName: "{dataset_name}"}})
            RETURN e1 as source, id(e1) as source_id, properties(r) as edge, 
            id(r) as edge_id, e2 as target, id(e2) as target_id
            LIMIT {limit}
            """


# Other utils query for Graph (Class)
def get_nodes_class_query(dataset_name):
    return f"""
            MATCH (e:Class {{DatasetName: '{dataset_name}'}}) 
            RETURN e AS node
            """


def get_count_nodes_class_query(dataset_name):
    return f"""
            MATCH (c:Class {{DatasetName: '{dataset_name}'}})
            RETURN COUNT(c) as class_count
    """


def get_count_obs_relationships_query(dataset_name):
    return f"""
    MATCH (e:Event {{DatasetName: '{dataset_name}'}})-[obs:OBSERVED]->(c:Class {{DatasetName: '{dataset_name}'}})
    RETURN COUNT(obs) as obs_count
    """


def get_count_dfc_relationships_query(dataset_name):
    return f"""
    MATCH (c1:Class {{DatasetName: '{dataset_name}'}})-[dfc:DF_C]->(c2:Class {{DatasetName: '{dataset_name}'}})
    RETURN COUNT(dfc) as dfc_count
    """


def get_complete_class_graph_query(dataset_name):
    return f"""
            MATCH (c1:Class {{DatasetName: "{dataset_name}"}})-[r:DF_C]->(c2:Class {{DatasetName: "{dataset_name}"}})
            RETURN c1 as source, id(c1) as source_id, properties(r) as edge, 
            id(r) as edge_id, c2 as target, id(c2) as target_id
            """


def get_limit_class_graph_query(dataset_name, limit):
    return f"""
            MATCH (c1:Class {{DatasetName: "{dataset_name}"}})-[r:DF_C]->(c2:Class {{DatasetName: "{dataset_name}"}})
            RETURN c1 as source, id(c1) as source_id, properties(r) as edge, 
            id(r) as edge_id, c2 as target, id(c2) as target_id
            LIMIT {limit}
            """


def get_df_class_relation_simple_query(dataset_name):
    return f"""
            MATCH (e:Class {{DatasetName: '{dataset_name}'}})-[df:DF_C]->(e1:Class {{DatasetName: '{dataset_name}'}})
            RETURN e, df, e1
            """


def get_df_class_relation_query():
    return """
            MATCH (e:Class)-[r:DF_C]->(dfRelated)
            RETURN ID(e) AS nodeId, e AS mainNode, r.Type AS type, ID(dfRelated) AS relatedNodeId
            """


# Other utils query (supports)
def delete_event_graph_query(dataset_name):
    return (f"MATCH(e: Event {{DatasetName: '{dataset_name}'}}) "
            f"DETACH DELETE e")


def delete_entity_graph_query(dataset_name):
    return f"""
    MATCH (e:Entity {{DatasetName: '{dataset_name}'}})
    DETACH DELETE e
    """


def get_count_event_query(dataset_name):
    return (f"MATCH (n : Event {{DatasetName: '{dataset_name}'}}) "
            f"RETURN COUNT(n) AS count")


def drop_entity_index():
    return "DROP INDEX ON :Entity(Value)"


def get_count_event_query():
    return "MATCH (n : Event) RETURN COUNT(n) AS count"


def get_count_entity_query(dataset_name):
    return (f"MATCH (n : Entity {{DatasetName: '{dataset_name}'}}) "
            f"RETURN COUNT(n) AS count")


def delete_class_graph_query(dataset_name):
    return f"""
    MATCH (n:Class {{DatasetName: '{dataset_name}'}})
    DETACH DELETE n
    """


def get_count_class_graph_query():
    return "MATCH (c: Class) RETURN COUNT(c) AS count"


def get_count_node_query():
    return "MATCH (e) RETURN COUNT(e) AS count"


def delete_graph_query():
    return "MATCH (e) DETACH DELETE e"


def get_nan_entities(dataset_name):
    return f"""
            MATCH (e:Event {{DatasetName: '{dataset_name}'}})
            WITH e, properties(e) AS props
            UNWIND keys(props) AS prop
            WITH e, prop, props[prop] AS value
            WHERE toString(value) = 'nan' OR toString(value) = ''
            WITH DISTINCT prop, count(DISTINCT e) AS nodeCount
            RETURN prop, nodeCount
    """


def change_nan(entity):
    entity = entity.replace("'", "")
    return f"""
        MATCH (n:Event)
        SET n.{entity} = toString(n.{entity})
        """


def get_distinct_entities_keys(dataset_name):
    return f"""
            MATCH (n:Entity {{DatasetName: '{dataset_name}'}}) 
            WITH DISTINCT n.Type as entityType
            RETURN entityType
    """


def set_class_weight():
    return ("""
        MATCH (:Event)-[obs:OBSERVED]->(c:Class)
        WITH c, COUNT(obs) as weight
        SET c.Count = weight
        """)
