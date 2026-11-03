"""
------------------------------------------------------------------------
File : security.py
Description: Who may change data through /api/v3. SOUP is for local
             use: the API answers on 127.0.0.1, and the only page that
             may call it from a browser is the SOUP app. A site open in
             the same browser could still send requests to it; so every
             request that changes data (POST, PUT, PATCH, DELETE under
             /api/v3) must carry the header X-Soup-Client: 1, which the
             app adds (its HTTP interceptor). A page of another site
             cannot add a custom header without a CORS preflight, which
             the backend refuses for origins outside SOUP_CORS_ORIGINS.
             In depth: a request with an Origin header that is neither
             one of those origins nor the backend's own is refused even
             with the header. Requests without Origin (curl, scripts,
             the tests) are governed by the header only.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Collection, Mapping

CLIENT_HEADER = "X-Soup-Client"
CLIENT_VALUE = "1"
API_PREFIX = "/api/v3"
CHANGING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def mutation_refusal(method: str, path: str, headers: Mapping[str, str], own_origin: str,
                     allowed_origins: Collection[str]) -> str | None:
    """
    The reason to refuse (403) a request, or None to let it through.
    Only requests that change data under /api/v3 are checked: GET, HEAD
    and OPTIONS (the CORS preflight) always pass.
    """

    if method.upper() not in CHANGING_METHODS or not (path == API_PREFIX or path.startswith(API_PREFIX + "/")):
        return None
    if headers.get(CLIENT_HEADER, "").strip() != CLIENT_VALUE:
        return (f"Missing header {CLIENT_HEADER}: {CLIENT_VALUE}: "
                "requests that change data are accepted only from the SOUP app")
    origin = headers.get("Origin", "").strip().rstrip("/")
    if origin and origin != own_origin.rstrip("/") and origin not in allowed_origins:
        return f"Origin {origin} not allowed: requests that change data are accepted only from the SOUP app"
    return None
