import time
from functools import wraps

def collect_metrics(step_key: str):
    """
    A parametric decorator to collect metrics for of a wrapped function.
    
    Args:
        key (str): The key to store time duration in `self.benchmark`.
        key (str): The key to store event and entity counts in `self.verification`.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            if callable(step_key):
                key = step_key(self, *args, **kwargs)
            else:
                key = step_key
            # Initial state capture
            n_events_init, n_entities_init = self.verify_no_aggregated_nodes()
            print(f"Number of initial not aggregated nodes: Events: {n_events_init} | Entities: {n_entities_init}")
            
            # Timer start
            start_time = time.time()
            
            # Execute the function
            result = func(self, *args, **kwargs)
            
            # Timer end
            end_time = time.time()
            delta = end_time - start_time
            
            # Final state capture
            n_events_final, n_entities_final = self.verify_no_aggregated_nodes()
            print(f"Number of final not aggregated nodes: Events: {n_events_final} | Entities: {n_entities_final}")
            
            # Store the results
            print(f"| AGGREGATION: {key} | TIME: {delta} s |")
            self.benchmark[key] = delta
            self.verification[key] = {
                'initial_events': n_events_init,
                'final_events': n_events_final,
                'initial_entities': n_entities_init,
                'final_entities': n_entities_final
            }
            return result
        return wrapper
    return decorator
