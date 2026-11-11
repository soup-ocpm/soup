"""
------------------------------------------------------------------------
File : errors.py
Description: Domain exceptions carrying an HTTP status code. They live
             among the contracts because packages raise them too (an
             importer rejecting its options, a visualizer asked for an
             unknown action): the core and the packages raise them, and
             only soup/api translates them into an HTTP response, in one
             place.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import csv
import json
import logging
import re
import traceback
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from typing import Any


class DomainError(Exception):
    """
    Base class for every domain error; carries the HTTP status to report.
    `details` is optional structured information (e.g. one message per
    invalid field) that the API layer may add to the response.
    """

    http_status_code: int = 500

    def __init__(self, message: str = "", details: Mapping[str, Any] | None = None):
        super().__init__(message)
        self.details: dict[str, Any] = dict(details or {})


class ValidationError(DomainError):
    """The request/input is well-formed but fails a domain rule (400)."""

    http_status_code = 400


class NotFoundError(DomainError):
    """The referenced resource does not exist (404)."""

    http_status_code = 404


class ForbiddenError(DomainError):
    """The operation is not allowed by the server's configuration (403)."""

    http_status_code = 403


class ConflictError(DomainError):
    """The request conflicts with the current state of a resource (409)."""

    http_status_code = 409


class ServiceUnavailableError(DomainError):
    """
    A service cannot answer because a tool it needs is not available,
    e.g. no loaded package provides the object catalog (503).
    """

    http_status_code = 503


def _redact(text: str) -> str:
    text = re.sub(r"(?:https?|neo4j(?:\+s|\+ssc)?|bolt(?:\+s|\+ssc)?)://[^\s\"'<>]+", "[redacted URL]", text)
    # Exception messages can echo cell values, query literals or credentials.
    types = {"list", "dict", "tuple", "set", "str", "int", "float", "bool", "NoneType"}
    text = re.sub(r"(['\"])(.*?)\1", lambda match: match[0] if match[2] in types else "[redacted]", text)
    return re.sub(r"(?i)(password|token|secret|authorization)(\s*[:=]\s*)[^\s,;}]+", r"\1\2[redacted]", text)


def log_error(error: Exception, context: Mapping[str, Any]) -> None:
    """Traceback without frame locals, uploaded contents, parameter values or URLs."""
    allowed = {
        "phase",
        "file",
        "column",
        "row",
        "line",
        "field",
        "importer",
        "step",
        "dataset",
        "error_type",
        "value_type",
        "hint",
        "endpoint",
        "code",
        "query",
    }
    safe = {
        key: _redact(str(value))[:2000] if isinstance(value, (str, int, float, bool)) else type(value).__name__
        for key, value in context.items()
        if key in allowed
    }
    chunks = traceback.TracebackException.from_exception(error, capture_locals=False).format()
    parts = []
    for chunk in chunks:
        lines = chunk.strip("\n").splitlines()
        # Preserve all traceback frames, but never dump a multiline data payload
        # embedded in an exception message. Location details travel separately.
        if not chunk.lstrip().startswith('File "'):
            lines = lines[:1]
        parts.append("\n".join(line if line.lstrip().startswith('File "') else _redact(line) for line in lines)[:2000])
    logging.getLogger("soup.import").error("Import failure %s\n%s", safe, "\n".join(parts))


@contextmanager
def import_phase(phase: str, **context: Any) -> Iterator[None]:
    """Add context to existing errors; unexpected failures keep HTTP 500 and their cause."""
    hint = context.pop("hint", None)
    try:
        yield
    except DomainError as exc:
        for key, value in {"phase": phase, **context, "error_type": type(exc.__cause__ or exc).__name__}.items():
            exc.details.setdefault(key, value)
        if hint:
            exc.details.setdefault("hint", hint)
        raise
    except Exception as exc:
        reason = _redact(str(exc))[:600] or type(exc).__name__
        structured = re.search(r"unhashable type: '(list|dict|set)'", str(exc)) if isinstance(exc, TypeError) else None
        if structured:
            reason = (
                f"A {structured[1]} was supplied where a single value, column name or scalar identifier was required."
            )
            context.setdefault("value_type", structured[1])
        hint = hint or (
            "Check storage/database availability, access permissions and free disk space."
            if isinstance(exc, OSError)
            else "Check the input and backend logs before retrying."
        )
        details = {"phase": phase, **context, "error_type": type(exc).__name__, "hint": hint}
        if isinstance(exc, json.JSONDecodeError):
            details.update(line=exc.lineno, column=exc.colno)
        code = getattr(exc, "code", None)
        if isinstance(code, str):
            details["code"] = code
        error = ValidationError if isinstance(exc, (csv.Error, UnicodeError, json.JSONDecodeError)) else DomainError
        raise error(f"{phase} failed. {reason} {hint}", details=details) from exc
