from ..aggregation.grammar import *
from ..configurator.knowledge import knowledge
from ..configurator.const import Constants as cn


def EKG():
    return knowledge.ekg

def LOG():
    return knowledge.log

def ENTITIES():
    ''' Set of entity types being aggregated '''
    return knowledge.entities



def translate_aggr_function(attr: str, func: AggregationFunction):
    ''' Translate aggregation functions to Neo4j Cypher syntax \n
    (Note that some attributes types are not compatible with aggregation functions. E.g., _sum_ or _avg_ does not work with timestamps) \n
    :param attr: attribute name
    :param func: aggregation function (supported: SUM, AVG, MIN, MAX, MINMAX, MULTISET)    
    '''
    if func == AggregationFunction.SUM:
        return f"sum(n.{attr})"
    elif func == AggregationFunction.AVG:
        return f"avg(n.{attr})"
    elif func == AggregationFunction.MIN:
        return f"min(n.{attr})"
    elif func == AggregationFunction.MAX:
        return f"max(n.{attr})"
    elif func == AggregationFunction.MINMAX:
        return [f"min(n.{attr})",f"max(n.{attr})"]
    elif func == AggregationFunction.MULTISET:
        return f""" COLLECT(n.{attr}) AS attrList
                UNWIND attrList AS att
                WITH c, att, COUNT(att) AS attrCount
                WITH c, COLLECT(att + ':' + attrCount) """
    else: raise ValueError(f"Unsupported function: {func}")


def generate_cypher_from_step_q(step: AggrStep) -> str:
    '''
    Convert an aggregation step to a Cypher query \n
    :param step: aggregation step
    '''
    node_type = cn.EVENT_NODE if step.aggr_type == cn.EVENTS \
                else cn.ENTITY_NODE
    
    match_clause = f"MATCH (n:{node_type})"
    of_clause = f"WHERE n.{EKG().type_tag} = '{step.ent_type}'" if step.ent_type else ""
       
    prefix = "WHERE" if (node_type == cn.EVENT_NODE) else "AND"
    
    where_clause = f" {prefix} n.{step.where}" if step.where else ""
    
    class_query = aggregate_nodes(node_type, step.group_by, step.where)
              
    clauses = [match_clause, of_clause, where_clause, class_query]
    cypher_query = "\n".join(clause for clause in clauses if clause)
    #print(cypher_query)
    return cypher_query.strip()


def aggregate_nodes(node_type: str, group_by: List[str], where: str) -> str:
    '''
    Cypher query construction for _nodes_ aggregation \n -> AGGREGATE < node_type > BY < group_by > WHERE < where > \n
    :param node_type: type of node to aggregate ("Event" or "Entity")
    :param group_by: list of attributes to group by 
    :param where: filtering condition 
    '''
   
    agg_type = "_".join(group_by) # will be used to create a type for the node
    cypher_query_parts = []
    aggr_expressions = []
    
    if node_type == cn.EVENT_NODE:
        get_query = aggregate_events_with_entities_q(group_by) # create a query to aggregate events also considering if entities have already been aggregated
        merge_clause = f'''
        MERGE (c:Class {{ CompositeID: val, Origin: "{node_type}", ID: randomUUID(), Agg: "{agg_type}",
        Name: rawEventName, Where: '{where if where else ''}', CorrEntName: corrEntName
        }})
        '''
        
        cypher_query_parts = [get_query, merge_clause]
    elif node_type == cn.ENTITY_NODE:
        
        has_type_tag = EKG().type_tag in group_by
 
        aliased_attrs = [f"n.{attr} AS {attr}" for attr in group_by]
                        
        group_keys_clause = "WITH " + ", ".join(aliased_attrs)
            
        if not has_type_tag:
            group_keys_clause += f", n.{EKG().type_tag} AS {EKG().type_tag}"
        group_keys_clause += ", COLLECT(n) AS nodes"

        # Build a value based on distinct values of the group_by attributes
        val_expr = ' + "_" + '.join([f'COALESCE({field}, "null")' for field in group_by]) # will be used to create a unique value for the node
        new_val = f"{val_expr} AS val"
        
        with_aggr = f"WITH nodes, {EKG().type_tag}, {new_val}"
        
        merge_clause = (
            f'MERGE (c:Class {{ Name: val, {EKG().type_tag}: {EKG().type_tag}, '
            + f'Origin: "{node_type}", ID: randomUUID(), Agg: "{agg_type}", ' #randomUUID()
            + f"Where: '{where if where else ''}'}})"
        )

        
        cypher_query_parts = [group_keys_clause, with_aggr, merge_clause]
        
    obs_clause = '''WITH c, nodes
    UNWIND nodes AS n
    MERGE (n)-[:OBS]->(c)
    '''
    
    ### Build the query ###

    # Conditionally add the match_event if aggr_expressions exist
    if aggr_expressions:
        prop_val = ", ".join(f"{attr} : {attr}" for attr in group_by)
        vars = ', '.join(group_by)
        cypher_query_parts.append(f"WITH c, {vars}")
        cypher_query_parts.append(f"MATCH (n:Event {{{prop_val}}})")

    # Add the obs_clause at the end
    cypher_query_parts.append(obs_clause)
    
    # Join all 
    cypher_query = "\n".join(cypher_query_parts)

    return cypher_query


def aggregate_events_with_entities_q(group_by: List[str]):
    '''
    Aggregate Event nodes considering also already aggregated Entity nodes \n
    :param group_by: list of attributes to group by
    '''
    bounded_entities = ENTITIES().copy()
    parameters = []
    for attr in group_by:
        if attr in LOG().entities:
            bounded_entities.add(attr)
        elif attr != LOG().event_activity:
            parameters.append(attr)
    
    match = ""
    variables = 'WITH n'
    coalesce_clause = f", COALESCE(n.{LOG().event_activity}, 'null') AS rawEventName"
    
    var_tags = ['rawEventName']
    entTags = []
    
    for index,entity in enumerate(bounded_entities):
        match += f"\nOPTIONAL MATCH (n)-[:CORR]->(:Entity {{{EKG().type_tag}: '{entity}'}})-[:OBS]->(c{index}:Class)"
        variables += f', c{index}'
        coalesce_clause += f', COALESCE(c{index}.ID, "null") AS resolved{entity}, COALESCE(c{index}.Name, "null") AS entName{entity}'
        var_tags.append(f'resolved{entity}')
        entTags.append(f'entName{entity}')
        
    for param in parameters:
        coalesce_clause += f', COALESCE(n.{param}, "null") AS {param}'
        var_tags.append(f'{param}')
        
    init_query = '\n'.join([match, variables, coalesce_clause])
    
    coalesced_parts = [f'{col}' for col in var_tags]
    coalesced_expression = ' + "_" + '.join(coalesced_parts)
    coalesced_entity_names = ' + "_" + '.join(entTags)
    with_clause = f'WITH rawEventName, {coalesced_expression} AS val, {coalesced_entity_names} as corrEntName, COLLECT(n) AS nodes'
    
    return '\n'.join([init_query, with_clause])
    

def aggregate_attributes(aggr_type, attribute, agg_func):
    '''
    Aggregate attributes of nodes \n
    :param aggr_type: type of aggregation ("EVENTS" or "ENTITIES")
    :param attribute: attribute to aggregate
    :param agg_func: aggregation function (supported: SUM, AVG, MIN, MAX, MINMAX, MULTISET)    
    '''
    node_type = "Event" if aggr_type == "EVENTS" else "Entity"
    t_function = translate_aggr_function(attribute, agg_func) # translate the aggregation function to Cypher syntax
    
    return (f'''
            MATCH (n:{node_type})-[:OBS]->(c:Class)
            WITH c, {t_function} AS val
            SET c.{attribute} = val
            ''')

def finalize_c_q(node_type: str):
    '''
    Implement the finalization step by creating Class nodes for non-aggregated nodes \n
    :param node_type: type of node to finalize ("Event" or "Entity")
    '''
    if node_type == cn.EVENT_NODE:
        return(f'''
                MATCH (n:Event)
                WHERE  NOT EXISTS((n)-[:OBS]->())
                WITH n
                CREATE (c:Class {{ Name: n.{LOG().event_activity}, Origin: 'Event', ID: n.{LOG().event_id}, Agg: "singleton"}})
                WITH n,c
                MERGE (n)-[:OBS]->(c)
                ''')
    elif node_type == cn.ENTITY_NODE:
        return(f'''
                MATCH (n:Entity)
                WHERE  NOT EXISTS((n)-[:OBS]->())
                WITH n
                CREATE (c:Class {{ Name: n.{LOG().entity_id}, {EKG().type_tag}: n.{EKG().type_tag}, Origin: 'Entity', ID: n.{LOG().entity_id}, Agg: "singleton"}})
                WITH n,c
                MERGE (n)-[:OBS]->(c)
                ''')
        
        
def generate_df_c_q():
    ''' Generate the Cypher query to create DF_C relationships between Class nodes based on DF relationships between Event nodes '''
    return (f'''
        MATCH ( c1 : Class ) <-[:OBS]- ( e1 : Event ) -[df]-> ( e2 : Event ) -[:OBS]-> ( c2 : Class )
        WHERE type(df) CONTAINS 'DF'
        WITH df.{EKG().type_tag} as EType, c1, COUNT(df) AS df_freq, c2
        MERGE ( c1 ) -[rel2:DF_C {{{EKG().type_tag}:EType}}]-> ( c2 ) 
        ON CREATE SET rel2.count=df_freq
        ''')
    

def generate_corr_c_q():
    ''' Generate the Cypher query to create CORR_C relationships between Class nodes based on CORR relationships between Event and Entity nodes '''
    return (f'''
        MATCH ( ce : Class ) <-[:OBS]- ( e : Event ) -[corr:CORR]-> ( t : Entity ) -[:OBS]-> ( ct : Class )
        MERGE ( ce ) -[rel2:CORR_C]-> ( ct ) 
        ''')
    

def count_not_aggregated_nodes_q(node_type : str):
    ''' Count the number of not aggregated nodes of the EKG '''
    return (f'''
        MATCH (n:{node_type})
        WHERE NOT EXISTS((n)-[:OBS]->())
        RETURN COUNT(n) AS count
        ''')
    
    
def add_counter_to_class_nodes_q():
    ''' Add a counter attribute to Class nodes based on the number of nodes observed '''
    return (f'''
        MATCH (c:Class)<-[:OBS]-(e)
        WITH c, COUNT(e) AS count
        SET c.Count = count
        ''')
    
def count_relationships_q(label: str):
    ''' Count the number of relationships of a given type \n
    :param label: relationship type label
    '''
    return (f'''
        MATCH ()-[r:{label}]->()
        RETURN COUNT(r) AS count
        ''')
    
    
############# WiP #############
def finalize_c_noobs_q(node_type: str):
    if node_type == "Event":
        return(f'''
                MATCH (class:Class)
                UNWIND class.Ids AS id
                WITH collect(DISTINCT id) AS allIds
                MATCH (n:Event)
                WHERE NOT n.id IN allIds
                CREATE (c:Class {{ Name: n.{LOG().event_activity}, Origin: 'Event', ID: n.{LOG().event_id}, Agg: "singleton", Ids: [n.id]}})
                ''')
    elif node_type == "Entity":    
        return(f'''
               MATCH (class:Class)
                UNWIND class.Ids AS id
                WITH collect(DISTINCT id) AS allIds
                MATCH (n:Entity)
                WHERE NOT n.id IN allIds
                CREATE (c:Class {{ Name: n.{LOG().entity_id}, {EKG().type_tag}: n.{EKG().type_tag}, Origin: 'Entity', ID: n.{LOG().entity_id}, Agg: "singleton", Ids: [n.id]}})
                ''')
        
   