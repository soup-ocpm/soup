"""
------------------------------------------------------------------------
File : exporter.py
Description: AnalysisConfigExporter ("config", "Configurazione
             dell'analisi"): the configuration of an "ekg" object derived
             from an analysis, as the JSON file of the legacy format (the
             one saved in <dataset>/Analyses/ and read back by "Importa
             configurazione di analisi"). It applies only to the analyses
             (Exporter.applies, contracts "3.1"): it is not offered for
             the other "ekg" objects.
Project : soup-packages/ekg_analysis
------------------------------------------------------------------------
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

import soup_pkg_ekg.api as ekg

from soup.core.contracts import Exporter, ObjectRef, ToolAccess

from .analysis import Analysis, analysis_file, is_analysis


class AnalysisConfigExporter(Exporter):
    id = "config"
    label = "Analysis configuration"
    accepts = (ekg.EKG_KIND,)
    extension = ".json"
    mime = "application/json"

    def applies(self, obj: ObjectRef, tools: ToolAccess) -> bool:
        return is_analysis(obj)

    def export(self, obj: ObjectRef, params: Mapping[str, Any], tools: ToolAccess) -> bytes:
        analysis = Analysis.from_spec(obj.meta["state"].get("spec") or {})
        found = analysis_file(obj)
        dataset = found[0] if found else ekg.root_of(obj).meta.get("dataset", "")
        based_on = (obj.meta.get("analysis") or {}).get("based_on")
        return json.dumps(analysis.to_legacy(dataset, based_on), ensure_ascii=False, indent=4).encode("utf-8")
