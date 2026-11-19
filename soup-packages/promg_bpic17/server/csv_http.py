"""Capability-protected, file-backed temporary CSV transport (OCED approach)."""

from __future__ import annotations

import os
import shutil
import threading
from contextlib import contextmanager, suppress
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import perf_counter
from urllib.parse import quote, urlsplit


def validate_url(value: str) -> str:
    url = value.rstrip("/")
    parsed = urlsplit(url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or any(c in url for c in "\"'\\\n\r")
        or not url.isascii()
    ):
        raise ValueError(
            "Set SOUP_NEO4J_CSV_BASE_URL to an HTTP(S) URL reachable from Neo4j, "
            "including the CSV port. Localhost only works if Neo4j runs on the SOUP host."
        )
    return url


@contextmanager
def serve_csv(directory: Path, public_url: str, token: str, port: int, *, metrics=None):
    """Publish only explicitly requested CSVs; never expose the working directory."""
    public_url = validate_url(public_url)
    paths: dict[str, Path] = {}
    lock = threading.Lock()
    metrics = metrics if metrics is not None else {}
    metrics.setdefault("requests", 0)
    metrics.setdefault("send_seconds", 0.0)

    def url_for(filename: str) -> str:
        if Path(filename).name != filename or not filename.endswith(".csv"):
            raise ValueError("Invalid intermediate CSV filename")
        path = directory / filename
        if not path.is_file() or path.is_symlink():
            raise ValueError("Intermediate CSV is missing or is not a regular file")
        route = "/" + token + "/" + quote(filename, safe="")
        with lock:
            paths[route] = path
        return public_url + route

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            with lock:
                path = paths.get(self.path)
            if path is None:
                self.send_error(404)
                return
            try:
                handle = path.open("rb")
            except FileNotFoundError:
                self.send_error(404)
                return
            with handle:
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header(
                    "Content-Length", str(os.fstat(handle.fileno()).st_size)
                )
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                started = perf_counter()
                try:
                    with suppress(BrokenPipeError, ConnectionResetError):
                        shutil.copyfileobj(handle, self.wfile)
                finally:
                    with lock:
                        metrics["requests"] = metrics.get("requests", 0) + 1
                        metrics["send_seconds"] = (
                            metrics.get("send_seconds", 0.0) + perf_counter() - started
                        )

        def log_message(self, format, *args):
            pass  # Never log capability URLs or CSV contents.

    try:
        server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    except OSError as exc:
        raise RuntimeError(
            f"Cannot serve PromG CSVs on port {port}; it may already be used by OCED. "
            "Use a separately reachable SOUP_PROMG_CSV_PORT and SOUP_PROMG_CSV_BASE_URL."
        ) from exc
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield url_for
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        paths.clear()
