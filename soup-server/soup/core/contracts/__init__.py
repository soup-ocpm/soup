"""
------------------------------------------------------------------------
File : __init__.py
Description: Public surface of soup.core.contracts - the stable
             interfaces between the host (soup/core) and every extension
             (the packages in soup-packages/). Nothing under
             soup/core/contracts imports pandas, neo4j, docker or Flask.
             Report blocks are built with the functions of the `report`
             submodule (from soup.core.contracts import report).
Project : soup-server
------------------------------------------------------------------------
"""

from soup.core.contracts.errors import (
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
    import_phase,
)
from soup.core.contracts.exceptions import (
    ExtensionPointError,
    ExtensionPointNotDeclaredError,
    PluginApiVersionError,
    PluginConflictError,
    PluginCycleError,
    PluginDependencyError,
    PluginError,
    PluginMissingToolsError,
    PluginPythonDependencyError,
    ToolNotDeclaredError,
)
from soup.core.contracts.exporter import Exporter
from soup.core.contracts.fields import Choice, Field, Variant
from soup.core.contracts.importer import Importer, Inspection
from soup.core.contracts.naming import validate_name
from soup.core.contracts.objects import (
    CREATED_BY_IMPORTER,
    CREATED_BY_OPERATION,
    CreatedBy,
    ObjectDraft,
    ObjectRef,
)
from soup.core.contracts.operation import Operation, OperationInput
from soup.core.contracts.plugin import EventHandler, PluginContext, SoupPlugin, contribution_key
from soup.core.contracts.ports import FileStorage
from soup.core.contracts.report import REPORT
from soup.core.contracts.tools import (
    CATALOG_TOOL,
    PREFERENCES_TOOL,
    Catalog,
    Preferences,
    Tool,
    ToolAccess,
)
from soup.core.contracts.upload import Upload
from soup.core.contracts.version import CONTRACTS_API_VERSION, is_api_compatible, parse_api_version
from soup.core.contracts.visualizer import Visualizer

__all__ = [
    "CONTRACTS_API_VERSION",
    "is_api_compatible",
    "parse_api_version",
    "PluginError",
    "PluginApiVersionError",
    "PluginConflictError",
    "PluginCycleError",
    "PluginDependencyError",
    "PluginMissingToolsError",
    "PluginPythonDependencyError",
    "ToolNotDeclaredError",
    "ExtensionPointError",
    "ExtensionPointNotDeclaredError",
    "DomainError",
    "import_phase",
    "ValidationError",
    "NotFoundError",
    "ConflictError",
    "ForbiddenError",
    "ServiceUnavailableError",
    "validate_name",
    "FileStorage",
    "EventHandler",
    "PluginContext",
    "SoupPlugin",
    "contribution_key",
    "Upload",
    "CREATED_BY_IMPORTER",
    "CREATED_BY_OPERATION",
    "CreatedBy",
    "ObjectDraft",
    "ObjectRef",
    "REPORT",
    "Choice",
    "Field",
    "Variant",
    "CATALOG_TOOL",
    "PREFERENCES_TOOL",
    "Catalog",
    "Preferences",
    "Tool",
    "ToolAccess",
    "Importer",
    "Inspection",
    "Operation",
    "OperationInput",
    "Visualizer",
    "Exporter",
]
