"""
------------------------------------------------------------------------
File : values.py
Description: The values read from Memgraph made JSON-ready, and the
             checks of the params of the visualizers' actions and of the
             queries (the core validates only the fields of operations
             and exporters):
             - clean(value): a Memgraph date-time (any object with year,
               month, day, hour, minute, second - duck typed, no neo4j
               import) becomes the ISO string of the legacy
               memgraph_datetime_to_string (Shared/support_config.py), a
               NaN becomes None, lists and dicts are cleaned recursively;
             - as_limit(value, default, maximum): an integer limit in
               1..maximum (C22) - it always travels as $limit;
             - as_int, as_text, as_choice, as_list.
Project : soup-packages/ekg_views
------------------------------------------------------------------------
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from typing import Any, cast

from soup.core.contracts import ValidationError

_DATETIME_PARTS = ("year", "month", "day", "hour", "minute", "second")


def is_datetime(value: Any) -> bool:
    return not isinstance(value, (str, bytes, Mapping)) and all(hasattr(value, part) for part in _DATETIME_PARTS)


def datetime_to_string(value: Any) -> str:
    """Like memgraph_datetime_to_string: "YYYY-MM-DDTHH:MM:SS[.ffffff]"."""

    text = (f"{value.year:04d}-{value.month:02d}-{value.day:02d}T"
            f"{value.hour:02d}:{value.minute:02d}:{int(value.second):02d}")
    nanosecond = getattr(value, "nanosecond", None)
    if nanosecond is None:
        nanosecond = getattr(value, "microsecond", None)
        nanosecond = nanosecond * 1000 if isinstance(nanosecond, int) else None
    if isinstance(nanosecond, int):
        text += f".{nanosecond // 1000:06d}"
    return text


def clean(value: Any, *, neo4j: bool = False) -> Any:
    if neo4j and callable(getattr(value, "iso_format", None)):
        return value.iso_format()
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, Mapping):
        return {str(key): clean(item, neo4j=neo4j) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(item, neo4j=neo4j) for item in value]
    if is_datetime(value):
        return datetime_to_string(value)
    return value


def as_int(value: Any, name: str, default: int, low: int, high: int | None = None) -> int:
    """An integer in low..high (clamped); missing -> default."""

    if value is None or value == "":
        return default
    if isinstance(value, bool):
        raise ValidationError(f"'{name}' must be an integer")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"'{name}' must be an integer, got {value!r}") from None
    if isinstance(value, float) and value != number:
        raise ValidationError(f"'{name}' must be an integer, got {value!r}")
    number = max(number, low)
    return number if high is None else min(number, high)


def as_limit(value: Any, default: int, maximum: int) -> int:
    """The LIMIT of a query: an integer in 1..maximum (C22)."""

    return as_int(value, "limit", min(default, maximum), 1, maximum)


def as_text(value: Any, name: str, default: str = "", required: bool = False) -> str:
    if value is None:
        value = default
    if not isinstance(value, str):
        raise ValidationError(f"'{name}' must be a text")
    if required and not value.strip():
        raise ValidationError(f"'{name}' is required")
    return value


def as_choice(value: Any, name: str, choices: Sequence[str], default: str | None = None) -> str:
    if value is None or value == "":
        if default is None:
            raise ValidationError(f"'{name}' is required; expected one of {list(choices)}")
        return default
    if value not in choices:
        raise ValidationError(f"'{name}' must be one of {list(choices)}, got {value!r}")
    return cast(str, value)


def as_list(value: Any, name: str, choices: Iterable[str], default: Sequence[str]) -> list[str]:
    """A list of distinct values among `choices`, in the order given."""

    if value is None:
        return list(default)
    if isinstance(value, str):
        value = [item for item in value.split(",") if item]
    if not isinstance(value, (list, tuple)):
        raise ValidationError(f"'{name}' must be a list")
    allowed = set(choices)
    result: list[str] = []
    for item in value:
        if item not in allowed:
            raise ValidationError(f"'{name}': unknown value {item!r}; expected some of {sorted(allowed)}")
        if item not in result:
            result.append(item)
    return result
