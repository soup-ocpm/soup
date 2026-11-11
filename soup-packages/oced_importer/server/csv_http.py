"""Temporary, capability-protected CSV downloads for external Neo4j LOAD CSV."""

from __future__ import annotations

import secrets
import threading
import time
from collections.abc import Iterator, Mapping
from contextlib import contextmanager, suppress
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote, urlsplit

from soup.core.contracts import ServiceUnavailableError


class CsvServer:
    def __init__(self, public_url: str, port: int = 8081):
        self.public_url = public_url.rstrip("/")
        self.port = port
        self._server: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._sessions: dict[str, tuple[float, dict[str, bytes]]] = {}

    def _start(self) -> None:
        parsed = urlsplit(self.public_url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.query
            or parsed.fragment
            or parsed.username
        ):
            raise ServiceUnavailableError(
                "Set SOUP_NEO4J_CSV_BASE_URL to an HTTP(S) address reachable FROM Neo4j, including the CSV port. "
                "Use the SOUP host's address; localhost is only correct when Neo4j runs on that host."
            )
        if self._server is not None:
            return
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                with owner._lock:
                    session = owner._sessions.get(self.path.lstrip("/").partition("/")[0])
                    content = None
                    if session is not None and time.monotonic() < session[0]:
                        content = session[1].get(self.path)
                if content is None:
                    self.send_error(404)
                    return
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                with suppress(BrokenPipeError, ConnectionResetError):
                    self.wfile.write(content)

            def log_message(self, format: str, *args: object) -> None:
                # Capability URLs must never enter access logs.
                pass

        try:
            self._server = ThreadingHTTPServer(("0.0.0.0", self.port), Handler)
        except OSError as exc:
            raise ServiceUnavailableError(f"Cannot start temporary CSV serving on port {self.port}: {exc}") from exc
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    @contextmanager
    def publish(self, files: Mapping[str, bytes]) -> Iterator[dict[str, str]]:
        with self._lock:
            self._start()
            token = secrets.token_urlsafe(32)
            paths = {name: f"/{token}/{quote(name, safe='/')}" for name in files if name.endswith(".csv")}
            self._sessions[token] = (time.monotonic() + 3600, {path: files[name] for name, path in paths.items()})
        # Base paths allow a TLS reverse proxy to forward the dedicated CSV port.
        urls = {name: self.public_url + path for name, path in paths.items()}
        try:
            yield urls
        finally:
            with self._lock:
                self._sessions.pop(token, None)

    def close(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread is not None:
            self._thread.join(timeout=5)
        with self._lock:
            self._sessions.clear()
