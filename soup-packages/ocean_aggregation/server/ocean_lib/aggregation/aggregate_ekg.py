from ..query import aggregation_query as q_lib
from ..aggregation.grammar import *
from neo4j import GraphDatabase
from ..aggregation.collect_info_decorator import collect_metrics
from ..configurator.knowledge import knowledge
from ..configurator.const import Constants as cn
from ..configurator.handle_config import HandleConfig

class AggregateEkg:
    def __init__(self, first_load: bool = False):
        self.log = knowledge.log
        self.ekg = knowledge.ekg
        self.neo4j = self.ekg.neo4j

        # init the neo4j driver
        self.driver = GraphDatabase.driver(self.neo4j.URI, auth=(self.neo4j.username, self.neo4j.password))
        self.driver.verify_connectivity()
        self.session = self.driver.session(database="neo4j")
        
        handler = HandleConfig(self.session)

        if self.ekg.entity_type_mode == cn.LABEL:
            # if entity types are stored as labels, align them
            handler.load_entities_in_log_config()
            handler.align_entity_type_property()
            
        if not first_load: # create indexes only if not first load
            handler.load_indexes()
            
        # store performances
        self.benchmark = {}
        self.verification = {}
    
    @collect_metrics(lambda _, step: str(step))    
    def one_step_agg(self,step: AggrStep):
        ''' Execute a single aggregation step '''
        
        if step.aggr_type == cn.ENTITIES: # store the entity types being aggregated
            knowledge.entities.add(step.ent_type)
            
        print(f"Executing node aggregation query for {step}...")

        cypher_query = q_lib.generate_cypher_from_step_q(step)
        
        print("Cypher Query:", cypher_query)
                        
        self.session.run(cypher_query).consume()
        
        print("Finished node aggregation step.")
        
        # aggregate the attributes if any
        if step.attr_aggrs:
                for attr_aggr in step.attr_aggrs:
                    self.aggregate_attributes(step.aggr_type, attr_aggr.name, attr_aggr.function)
        print("Node aggregation query executed successfully")
        
        
    @collect_metrics('FINALIZATION')    
    def finalize(self):
        ''' Finalize the aggregation by creating the Class nodes for non-aggregated nodes '''
        print("Finalizing Class nodes ...")
        
        event_singleton_query = q_lib.finalize_c_q(node_type=cn.EVENT_NODE)
        self.session.run(event_singleton_query)
                
        entity_singleton_query = q_lib.finalize_c_q(node_type=cn.ENTITY_NODE)
        self.session.run(entity_singleton_query)
        
        print("Node finalization aggregation query executed successfully.")
                
 
    def aggregate_attributes(self, aggr_type: str, attribute: str, agg_func: AggregationFunction):
        ''' Execute the aggregation for the given attribute '''
        print(f"Executing node attribute aggregation ...")
        query = q_lib.aggregate_attributes(aggr_type, attribute, agg_func)
        self.session.run(query)
        print("Attribute aggregation query executed successfully.")
    
    @collect_metrics('TOTAL')
    def aggregate(self, aggr_spec: AggrSpecification):
        ''' Execute the aggregation for the given specification '''
        for step in aggr_spec.steps:
            self.one_step_agg(step)
        self.finalize() # finalize the aggregation
        
        # add the counter to the Class nodes
        counter_query = q_lib.add_counter_to_class_nodes_q()
        self.session.run(counter_query)
        
        print("Node aggregation query executed successfully.")

    @collect_metrics('RELATIONSHIPS')
    def infer_rels(self):
        print("Inferring relationships ...")
        query = q_lib.generate_df_c_q()
        
        self.session.run(query)
        
        query = q_lib.generate_corr_c_q()
        self.session.run(query)
        
        print("Relationships inferred successfully.")
                    
                    
    def verify_no_aggregated_nodes(self):
        ''' Verify the not aggregated nodes of the EKG '''
        cypher_query = q_lib.count_not_aggregated_nodes_q(cn.EVENT_NODE)
        no_aggr_nodes_events = self.session.run(cypher_query).single()[0]
        
        cypher_query = q_lib.count_not_aggregated_nodes_q(cn.ENTITY_NODE)
        no_aggr_nodes_entities = self.session.run(cypher_query).single()[0]
        
        return no_aggr_nodes_events, no_aggr_nodes_entities
        


    
    
