"""
------------------------------------------------------------------------
File : api.py
Description: Public API of the ekg package. Other packages import it as
             soup_pkg_ekg.api, and only if they list "ekg" in their
             `requires`:
             - the event log: Table (and the pandas conversions),
               EventLogData, ColumnMapping, EventLog, and
               mapping_problem/validate_mapping (the three standard roles
               on three different, existing columns);
             - build_ekg(obj, data, mapping, tools, ...): stage and build
               the EKG of an object being created; ensure_loaded(obj,
               tools, force=False), dispose(obj, tools) and
               graph_key_of(obj), the memgraph tool state of its graph;
               derive_state(parent, mutate, tools), the graph of a new
               derived object made on the loaded parent; root_of(obj),
               its root "ekg" object; new_graph_key();
               buildable_problem(obj), why its graph cannot be built (or
               None);
             - DatasetRepository: the files of a dataset, the analyses
               in Analyses/ included, on a StorageSpaceTool (what it
               uses of the "storage" tool);
             - the extension points: BUILD_STEPS_POINT (EkgBuildStep,
               BuildContext, with load_csv_clause for the extra files a
               step reads and normalize_text, how names and values are
               normalized in the graph) and STATE_PROVIDERS_POINT
               (StateProvider);
             - the events EKG_BEFORE_RESET and EKG_BUILT, the kind
               EKG_KIND, and GraphDatabase and Query/ident to write the Cypher
               of a step.
             The callers pass their own tools: build_ekg needs "memgraph"
             and "storage", ensure_loaded, derive_state and dispose only
             "memgraph" (the datasets are read with this package's own
             storage).
Project : soup-packages/ekg
------------------------------------------------------------------------
"""

from soup_pkg_tool_memgraph.api import GraphDatabase, Query, ident

from soup.core.contracts import ToolAccess

from .build import BuildContext, EkgBuildStep
from .builder import EKG_BEFORE_RESET, EKG_BUILT, EKG_KIND, build_ekg, new_graph_key
from .dataset_repository import ANALYSES_FOLDER, DatasetRepository, StorageSpaceTool
from .event_log import ColumnMapping, EventLog, EventLogData, mapping_problem, normalize_text, validate_mapping
from .migration import LEGACY_IMPORTER, LEGACY_PACKAGE
from .runtime import BUILD_STEPS_POINT, STATE_PROVIDERS_POINT, current
from .schema import load_csv_clause
from .state import (
    StateProvider,
    buildable_problem,
    derive_state,
    dispose,
    ensure_loaded,
    graph_key_of,
    is_derived,
    root_of,
)
from .tables import Table, from_dataframe, to_dataframe


def graph_tools() -> ToolAccess:
    """Tools owned by the Memgraph EKG runtime, for optional read-only consumers."""
    return current().tools


__all__ = [
    "ANALYSES_FOLDER",
    "BUILD_STEPS_POINT",
    "EKG_BEFORE_RESET",
    "EKG_BUILT",
    "EKG_KIND",
    "LEGACY_IMPORTER",
    "LEGACY_PACKAGE",
    "STATE_PROVIDERS_POINT",
    "BuildContext",
    "ColumnMapping",
    "DatasetRepository",
    "EkgBuildStep",
    "GraphDatabase",
    "EventLog",
    "EventLogData",
    "Query",
    "StateProvider",
    "StorageSpaceTool",
    "Table",
    "build_ekg",
    "buildable_problem",
    "derive_state",
    "dispose",
    "ensure_loaded",
    "from_dataframe",
    "graph_key_of",
    "graph_tools",
    "ident",
    "is_derived",
    "load_csv_clause",
    "mapping_problem",
    "new_graph_key",
    "normalize_text",
    "root_of",
    "to_dataframe",
    "validate_mapping",
]
