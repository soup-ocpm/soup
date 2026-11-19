"""Explicit, in-place migration of previously imported PromG BPIC17 datasets."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from typing import Any

from soup.core.contracts import (
    Catalog,
    Field,
    ObjectDraft,
    ObjectRef,
    Operation,
    OperationInput,
    ToolAccess,
    ValidationError,
    import_phase,
    report,
)
from soup.core.contracts.database import Database

from .compat import soup_metadata
from .normalize import normalize_graph, timed_phase


class NormalizeLegacyPromg(Operation):
    id = "normalize_legacy"
    label = "Normalize existing PromG BPIC17 EKG for SOUP"
    description = (
        "Preserve the original PromG graph, add SOUP-compatible properties/DF edges, "
        "and update this workspace dataset to the shared Neo4j EKG kind. "
        "This runs on the existing database, without reimporting CSVs."
    )
    group = "EKG interoperability"
    inputs = (OperationInput("dataset", ("promg_bpic17.ekg",)),)
    produces = (report.REPORT,)
    requires_tools = ("catalog",)

    def __init__(self, database: Database):
        self.database = database

    def fields(self, inputs: Mapping[str, ObjectRef], tools: ToolAccess) -> list[Field]:
        return [Field("confirm", "Normalize this existing graph in place", type="bool", required=True)]

    def run(self, inputs: Mapping[str, ObjectRef], params: Mapping[str, Any], tools: ToolAccess) -> list[ObjectDraft]:
        if params.get("confirm") is not True:
            raise ValidationError("Confirm in-place graph normalization")
        source = inputs["dataset"]
        if source.meta.get("import_status") != "complete":
            raise ValidationError("Only completed PromG imports may be normalized")
        if source.created_by.package != "promg_bpic17" or source.meta.get("source") != "PromG-dev/ekg_bpic17":
            raise ValidationError("Not a PromG BPIC17 dataset")
        if source.meta.get("backend") != "neo4j":
            raise ValidationError("The existing PromG dataset must use Neo4j")
        db = self.database.for_dataset(source.id)
        info = {**source.meta.get("process_info", {})}
        info["duration_seconds"] = dict(info.get("duration_seconds", {}))
        with import_phase("PromG BPIC17 SOUP schema normalization"), timed_phase(info, "normalization"):
            summary = normalize_graph(db, source.id, process_info=info)
        # The graph and catalog entry keep the original ID, owning importer,
        # provenance and managed Neo4j database; no duplicate dataset is made.
        metadata = {
            **source.meta,
            "process_info": info,
            **soup_metadata(summary, filename=source.meta.get("source_filename", "BPI_Challenge_2017.csv")),
        }
        catalog = tools.typed("catalog", Catalog)
        with import_phase("PromG BPIC17 workspace metadata migration"):
            catalog.update(replace(source, kind="oced_importer.log", meta=metadata))
        return [report.report(
            f"SOUP EKG compatibility: {source.name}",
            [report.text(
                "Normalized the existing PromG graph and changed its workspace kind to "
                "oced_importer.log. Refresh Workspace to open the standard EKG visualizers. "
                "The native PromG graph remains present."
            ), report.keyvalue({"Events": summary["events"], "DF edges by type": str(summary["df_by_type"])})],
        )]
