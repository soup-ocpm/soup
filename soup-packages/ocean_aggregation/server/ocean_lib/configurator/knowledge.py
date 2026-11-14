from .config import LogReferences, EKGReferences

class Knowledge:
    
    log:LogReferences | None
    ekg: EKGReferences | None
    
    entities: set[str] 
    
    def __init__(self):
        self.log = None
        self.ekg = None
        self.entities = set() # set of entity types being aggregated
        
knowledge = Knowledge()


