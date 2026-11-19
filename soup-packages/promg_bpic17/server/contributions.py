"""SOUP importer: isolated Neo4j target, original PromG construction semantics."""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Mapping
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from typing import Any
from uuid import UUID

from soup.core.contracts import (
    Catalog,
    Importer,
    Inspection,
    ObjectRef,
    ToolAccess,
    Upload,
    import_phase,
    report,
)
from soup.core.contracts.database import Database
from soup.core.contracts.errors import log_error

from .compat import soup_metadata
from .csv_http import validate_url
from .normalize import normalize_graph, timed_phase

KIND = "oced_importer.log"  # normalized SOUP Neo4j EKG representation
ASSETS = Path(__file__).parent / "assets"
REQUIRED = {
    "case",
    "event",
    "time",
    "lifecycle:transition",
    "EventOrigin",
    "EventID",
    "org:resource",
    "ApplicationType",
    "RequestedAmount",
    "Action",
}
MAX_LOG_CHARS = 12000

logger = logging.getLogger(__name__)


def check_csv(upload: Upload) -> dict[str, Any]:
    if not upload.filename.lower().endswith(".csv"):
        raise ValueError(
            "Select the normalized BPIC17 CSV expected by PromG (BPI_Challenge_2017.csv)."
        )
    stream = io.TextIOWrapper(upload.stream, encoding="utf-8-sig", newline="")
    try:
        reader = csv.reader(stream)
        columns = next(reader)
    except (StopIteration, UnicodeError, csv.Error) as exc:
        raise ValueError("Could not read BPIC17 CSV header as UTF-8") from exc
    absent = sorted(REQUIRED - set(columns))
    if absent:
        raise ValueError(
            "Wrong BPIC17 CSV format: missing required columns: " + ", ".join(absent)
        )
    return {
        "original_name": upload.filename,
        "columns": columns,
        "bytes": len(upload.read()),
    }


class Bpic17Importer(Importer):
    id = "bpic17"
    label = "PromG — BPI Challenge 2017 (Neo4j)"
    description = "Run the original PromG BPIC'17 graph creation pipeline on a new SOUP-managed Neo4j database."
    extensions = (".csv",)
    produces = KIND
    requires_tools = ("catalog",)

    def __init__(self, database: Database):
        self.database = database

    def inspect(self, upload: Upload, tools: ToolAccess) -> Inspection:
        with import_phase("BPIC17 CSV header validation"):
            data = check_csv(upload)
        return Inspection(
            preview=(
                report.keyvalue(
                    {
                        "Dataset": "BPIC 2017",
                        "Importer": "PromG 2.2.3",
                        "CSV bytes": data["bytes"],
                        "Columns": len(data["columns"]),
                    },
                    title="PromG BPIC17",
                ),
            )
        )

    def import_(
        self,
        upload: Upload,
        obj: ObjectRef,
        options: Mapping[str, Any],
        tools: ToolAccess,
    ) -> dict[str, Any]:
        started = perf_counter()
        object_id = str(UUID(obj.id))
        info = {"init_time": datetime.now(UTC).isoformat(), "dataset_id": object_id}
        with timed_phase(info, "csv_preparation"):
            check_csv(upload)
        public_url = validate_url(
            os.environ.get("SOUP_PROMG_CSV_BASE_URL")
            or os.environ.get("SOUP_NEO4J_CSV_BASE_URL", "")
        )
        port = int(os.environ.get("SOUP_PROMG_CSV_PORT", "8081"))
        if not 1 <= port <= 65535:
            raise ValueError("SOUP_PROMG_CSV_PORT must be between 1 and 65535")
        token = secrets.token_urlsafe(32)
        catalog = tools.typed("catalog", Catalog)
        with (
            import_phase("Neo4j dataset creation"),
            timed_phase(info, "database_creation"),
        ):
            name = self.database.create_dataset(object_id, obj.name)
        metadata = {
            "backend": "neo4j",
            "neo4j_database": name,
            "neo4j_database_owner": obj.id,
            "neo4j_managed": True,
            "source": "PromG-dev/ekg_bpic17",
            "promg_version": "2.2.3",
        }
        staged = replace(
            obj, meta={**metadata, "import_status": "loading", "process_info": info}
        )
        with import_phase("dataset catalog registration"):
            catalog.add(staged)
        try:
            # Credentials are exclusively obtained from SOUP's configured backend.
            config = self.database.config
            with tempfile.TemporaryDirectory(prefix="soup-promg-bpic17-") as directory:
                base = Path(directory)
                with timed_phase(info, "csv_preparation"):
                    (base / "data").mkdir()
                    (base / "csv").mkdir()
                    (base / "json_files").mkdir()
                    # Stream the upload once; generated partitions are served directly from temporary storage.
                    with (base / "data" / "BPI_Challenge_2017.csv").open(
                        "wb"
                    ) as target:
                        shutil.copyfileobj(upload.stream, target)
                    (base / "json_files" / "BPIC17.json").write_bytes(
                        (ASSETS / "BPIC17.json").read_bytes()
                    )
                    ds = json.loads(
                        (ASSETS / "BPIC17_DS.json").read_text(encoding="utf-8")
                    )
                    for item in ds:
                        item["file_directory"] = str(base / "data") + os.sep
                    (base / "json_files" / "BPIC17_DS.json").write_text(
                        json.dumps(ds), encoding="utf-8"
                    )
                run_config = {
                    "db_name": name,
                    "uri": config.uri,
                    "user": config.username,
                    "password": config.password,
                    "semantic_header_path": str(base / "json_files" / "BPIC17.json"),
                    "dataset_description_path": str(
                        base / "json_files" / "BPIC17_DS.json"
                    ),
                    "import_directory": str(base / "csv"),
                    "csv_public_url": public_url,
                    "csv_port": port,
                    "csv_token": token,
                    "dataset_name": "BPIC17",
                    "use_sample": False,
                    "verbose": False,
                    "batch_size": 10000,
                    "use_preprocessed_files": False,
                }
                # File is private and removed after the isolated worker exits.
                from yaml import safe_dump

                config_path = base / "config.yaml"
                with os.fdopen(
                    os.open(config_path, os.O_CREAT | os.O_WRONLY, 0o600), "w"
                ) as handle:
                    safe_dump(run_config, handle)

                def diagnostic_tail(path: Path) -> str:
                    with path.open("rb") as handle:
                        handle.seek(0, os.SEEK_END)
                        handle.seek(max(0, handle.tell() - MAX_LOG_CHARS))
                        text = handle.read().decode("utf-8", errors="replace")
                    for secret in (config.password, config.uri, token):
                        if secret:
                            text = text.replace(secret, "[redacted]")
                    return text

                def collect_metrics():
                    path = base / "worker-metrics.json"
                    if path.is_file():
                        metrics = json.loads(path.read_text(encoding="utf-8"))
                        durations = info.setdefault("duration_seconds", {})
                        for phase_name, seconds in metrics["duration_seconds"].items():
                            durations[phase_name] = (
                                durations.get(phase_name, 0.0) + seconds
                            )
                        info["promg_queries"] = metrics["queries"]
                        info["http"] = metrics.get("http", {})
                        info["duration_seconds"]["http_transfer"] = info["http"].get(
                            "send_seconds", 0.0
                        )

                # Keep verbose PromG output on disk rather than accumulating it in RAM.
                stdout_path, stderr_path = base / "stdout.log", base / "stderr.log"
                with import_phase("PromG BPIC17 EKG construction"):
                    try:
                        with (
                            stdout_path.open("w") as stdout,
                            stderr_path.open("w") as stderr,
                        ):
                            process = subprocess.run(
                                [
                                    sys.executable,
                                    str(Path(__file__).parent / "worker.py"),
                                    str(config_path),
                                ],
                                cwd=base,
                                stdout=stdout,
                                stderr=stderr,
                                timeout=60 * 60 * 6,
                                check=False,
                            )
                    except subprocess.TimeoutExpired as exc:
                        collect_metrics()
                        logger.error(
                            "PromG timeout dataset=%s database=%s\n%s\n%s",
                            object_id,
                            name,
                            diagnostic_tail(stdout_path),
                            diagnostic_tail(stderr_path),
                        )
                        raise RuntimeError(
                            "PromG BPIC17 exceeded the six-hour timeout; see backend logs. "
                            "The dataset is incomplete; no database was cleared."
                        ) from exc
                    collect_metrics()
                    if process.returncode != 0:
                        error = diagnostic_tail(stderr_path)
                        logger.error(
                            "PromG failed dataset=%s database=%s exit=%s\nSTDOUT:\n%s\nSTDERR:\n%s",
                            object_id,
                            name,
                            process.returncode,
                            diagnostic_tail(stdout_path),
                            error,
                        )
                        summary = (
                            error.strip().splitlines()[-1]
                            if error.strip()
                            else "Worker exited without an error message"
                        )
                        raise RuntimeError(
                            f"PromG BPIC17 failed (exit {process.returncode}): {summary[:1000]}. "
                            "See backend logs for the failing phase and traceback. "
                            "For CSV access errors, check server-side HTTP access and Neo4j LOAD CSV permissions."
                        )
            # Project the native PromG graph into SOUP's common Neo4j EKG
            # vocabulary. No PromG labels or native edges are deleted.
            with (
                import_phase("PromG BPIC17 SOUP schema normalization"),
                timed_phase(info, "normalization"),
            ):
                summary = normalize_graph(
                    self.database.for_dataset(obj.id), obj.id, process_info=info
                )
            info.setdefault("duration_seconds", {})["total"] = round(
                perf_counter() - started, 3
            )
            return {
                **metadata,
                "import_status": "complete",
                "process_info": info,
                "source_filename": upload.filename,
                "source_bytes": len(upload.read()),
                **soup_metadata(summary, filename=upload.filename),
            }
        except Exception:
            info.setdefault("duration_seconds", {})["total"] = round(
                perf_counter() - started, 3
            )
            try:
                catalog.update(
                    replace(
                        staged,
                        meta={
                            **metadata,
                            "import_status": "failed",
                            "process_info": info,
                        },
                    )
                )
            except Exception as exc:  # noqa: BLE001 -- preserve the original import failure
                log_error(
                    exc,
                    {"phase": "promg failed-import catalog update", "dataset": obj.id},
                )
            raise

    def dispose(self, obj: ObjectRef, tools: ToolAccess) -> None:
        # SOUP Workspace owns graph deletion and requests explicit confirmation.
        pass
