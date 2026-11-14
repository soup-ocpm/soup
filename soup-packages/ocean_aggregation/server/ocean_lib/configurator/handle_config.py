from ..configurator.knowledge import knowledge
from ..query import init_query as q_lib

class HandleConfig:
    def __init__(self, session):
        self.log = knowledge.log
        self.ekg = knowledge.ekg
        
        self.session = session

                
    def load_entities_in_log_config(self):
        query = "MATCH (e:Entity) WITH DISTINCT e.Type as EType RETURN EType" if self.ekg.entity_type_mode == "property" \
            else "MATCH (e:Entity) WITH DISTINCT labels(e)[1] as EType RETURN EType"
        self.log.entities = []
        
        resp = self.session.run(query).data()
        for record in resp:
            self.log.entities.append(record['EType'])
        
        knowledge.log = self.log
        
        
    def align_entity_type_property(self):
        query = f"""
        MATCH (e:Entity)
        WITH e, labels(e) AS lbls
        SET e.{self.ekg.type_tag} = lbls[1]
        """
        self.session.run(query)
        
        # also align the DF relationships
        # in promg DF rels are of type DF_{EntityLabel}
        df_alig_query = f"""
        MATCH (:Event)-[df]->(:Event)
        WHERE left(type(df), 2) = "DF"
        SET df.{self.ekg.type_tag} = df.entityType
        """
        
        self.session.run(df_alig_query)
  
    def load_indexes(self):
        entities = self.log.entities
        
        ''' Create indexes to speed graph searching and manipulation '''
        print("Creating indexes...")
        # first remove all the indexes
        indexes = self.session.run(q_lib.get_indexes_q()).data()

        for index in indexes:
            name = index["name"]
            owning_constraint = index.get("owningConstraint")

            # Skip any index that belongs to a constraint
            if owning_constraint:
                print(f"Skipping constraint-backed index: {name}")
                continue

            #print(f"Dropping index: {name}")
            self.session.run(q_lib.drop_index_q(name))
                
        # create new indexes
        self.session.run(q_lib.create_index_q('Entity', self.log.entity_id))
        self.session.run(q_lib.create_index_q('Entity', self.ekg.type_tag))
        self.session.run(q_lib.create_index_q('Event', self.log.event_activity))
        
        curr_entities = entities.keys() if isinstance(entities, dict) else entities
        for entity in curr_entities:
            self.session.run(q_lib.create_index_q('Event', entity))
            
        query = q_lib.create_index_q('Class', 'Name')
        self.session.run(query)
            
        print("All INDEX queries executed successfully.")