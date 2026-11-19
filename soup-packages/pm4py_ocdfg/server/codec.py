"""JSON codec retaining PM4Py's tuple keys and sets; never executes stored data."""

from __future__ import annotations

import json
from typing import Any


def encode(value: Any) -> Any:
    if isinstance(value, dict):
        return {"t": "dict", "v": [[encode(k), encode(v)] for k, v in value.items()]}
    if isinstance(value, (set, frozenset)):
        items = [encode(item) for item in value]
        return {"t": "set", "v": sorted(items, key=lambda x: json.dumps(x, sort_keys=True))}
    if isinstance(value, tuple):
        return {"t": "tuple", "v": [encode(item) for item in value]}
    if isinstance(value, list):
        return [encode(item) for item in value]
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    # NumPy scalars returned by statistical routines.
    if hasattr(value, "item"):
        return encode(value.item())
    raise TypeError(f"Unsupported model value: {type(value).__name__}")


def decode(value: Any) -> Any:
    if isinstance(value, list):
        return [decode(item) for item in value]
    if not isinstance(value, dict):
        return value
    tag, items = value["t"], value["v"]
    if tag == "dict":
        return {decode(k): decode(v) for k, v in items}
    if tag == "tuple":
        return tuple(decode(item) for item in items)
    if tag == "set":
        return set(decode(item) for item in items)
    raise ValueError(f"Unknown model tag: {tag}")
