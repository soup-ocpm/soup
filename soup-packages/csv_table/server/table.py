"""
------------------------------------------------------------------------
File : table.py
Description: The table logic of csv_table, with Python's csv module only:
             decoding (UTF-8, falling back to Latin-1), guessing the
             separator and the header (csv.Sniffer), parsing into
             (columns, rows) with unique column names and rows padded to
             the same width, the canonical CSV kept in the storage, and
             the queries of the visualizers and of the operation: a page
             filtered and sorted, the profile of every column and the
             distribution of the values of one column.
Project : soup-packages/csv_table
------------------------------------------------------------------------
"""

from __future__ import annotations

import csv
import io
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from soup.core.contracts import ValidationError

COMMA, SEMICOLON, TAB = ",", ";", "\t"
SEPARATORS = (COMMA, SEMICOLON, TAB)
SNIFF_BYTES = 64 * 1024
EMPTY_LABEL = "(empty)"
OTHER_LABEL = "(other)"
SORT_DIRECTIONS = ("asc", "desc")

Row = list[str]
# What the queries accept: lists from parse(), tuples from the cache.
Rows = Sequence[Sequence[str]]


def decode(data: bytes) -> tuple[str, str]:
    """(text, encoding): UTF-8 (a BOM is dropped), otherwise Latin-1, which decodes any byte."""

    try:
        return data.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        return data.decode("latin-1"), "latin-1"


@dataclass(frozen=True)
class Guess:
    separator: str
    header: bool


def sniff(text: str, filename: str = "") -> Guess:
    """The separator and whether the first row is a header; fallbacks: tab for .tsv, comma, header."""

    fallback = TAB if filename.lower().endswith(".tsv") else COMMA
    sample = text[:SNIFF_BYTES]
    sniffer = csv.Sniffer()
    try:
        separator = sniffer.sniff(sample, delimiters="".join(SEPARATORS)).delimiter
    except csv.Error:
        separator = fallback
    if separator not in SEPARATORS:
        separator = fallback
    try:
        header = sniffer.has_header(sample)
    except csv.Error:
        header = True
    return Guess(separator, header)


def _unique_columns(names: Sequence[str], width: int) -> list[str]:
    columns: list[str] = []
    seen: set[str] = set()
    for index in range(width):
        base = names[index].strip() if index < len(names) else ""
        base = base or f"column_{index + 1}"
        name, suffix = base, 2
        while name in seen:
            name, suffix = f"{base}_{suffix}", suffix + 1
        seen.add(name)
        columns.append(name)
    return columns


def parse(text: str, separator: str, header: bool) -> tuple[list[str], list[Row]]:
    """
    Columns and rows of `text`. Blank lines are skipped; short rows are
    padded with "" and columns without a name are called column_N.
    """

    reader = csv.reader(io.StringIO(text, newline=""), delimiter=separator)
    try:
        records = [row for row in reader if row]
    except csv.Error as exc:
        raise ValidationError(
            "A CSV record could not be parsed. Check quoting, delimiter and field size.",
            details={"phase": "CSV parsing", "line": reader.line_num},
        ) from exc
    names = records.pop(0) if header and records else []
    width = max([len(names), *(len(row) for row in records)])
    rows = [row + [""] * (width - len(row)) for row in records]
    return _unique_columns(names, width), rows


def write_csv(columns: Sequence[str], rows: Iterable[Sequence[Any]],
    separator: str = COMMA, header: bool = True) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, delimiter=separator, lineterminator="\n")
    if header:
        writer.writerow(columns)
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def read_canonical(data: bytes) -> tuple[list[str], list[Row]]:
    """The stored table: UTF-8, comma, always with its header."""

    return parse(data.decode("utf-8"), COMMA, True)


# Rough CPython sizes: a str object without its characters, a tuple
# without its items, one item reference.
_STR_OVERHEAD = 49
_TUPLE_OVERHEAD = 40
_POINTER = 8


def estimated_size(columns: Sequence[str], rows: Sequence[Sequence[str]]) -> int:
    """Estimated memory, in bytes, of a parsed table kept as tuples of strings."""

    cells = sum(_STR_OVERHEAD + len(cell) for row in rows for cell in row)
    containers = (len(rows) + 1) * _TUPLE_OVERHEAD + (len(rows) + 1) * len(columns) * _POINTER
    return cells + containers + sum(_STR_OVERHEAD + len(name) for name in columns)


# ---------------------------------------------------------------------- #
# Queries
# ---------------------------------------------------------------------- #
def _sort_key(value: str) -> tuple[int, Any]:
    """Numbers by value before the other values as text (case-insensitive)."""

    try:
        return 0, float(value)
    except ValueError:
        return 1, value.casefold()


def sort_rows(rows: Rows, column: int, direction: str) -> list[Sequence[str]]:
    """Stable sort by `column`; empty cells stay last in both directions."""

    filled = [row for row in rows if row[column].strip()]
    empty = [row for row in rows if not row[column].strip()]
    filled.sort(key=lambda row: _sort_key(row[column].strip()), reverse=direction == "desc")
    return filled + empty


def filter_rows(rows: Rows, filters: Sequence[tuple[int, str]], search: str = "") -> list[Sequence[str]]:
    """Rows whose cell contains each filter's text (case-insensitive) and, if any, `search` in some cell."""

    wanted = [(column, value.casefold()) for column, value in filters if value]
    needle = search.strip().casefold()
    return [
        row for row in rows
        if all(value in row[column].casefold() for column, value in wanted)
        and (not needle or any(needle in cell.casefold() for cell in row))
    ]


def page(  # noqa: PLR0913, PLR0917 - public API (soup_pkg_csv_table.api)
    rows: Rows,
    offset: int,
    limit: int,
    sort: tuple[int, str] | None = None,
    filters: Sequence[tuple[int, str]] = (),
    search: str = "",
) -> dict[str, Any]:
    found = filter_rows(rows, filters, search)
    if sort is not None:
        found = sort_rows(found, *sort)
    return {"rows": found[offset:offset + limit], "total": len(found)}


def profile(columns: Sequence[str], rows: Rows, examples: int = 5) -> list[dict[str, Any]]:
    result = []
    for index, name in enumerate(columns):
        values = [row[index] for row in rows]
        filled = [value for value in values if value.strip()]
        result.append({
            "name": name,
            "distinct": len(set(filled)),
            "empty": len(values) - len(filled),
            "examples": list(dict.fromkeys(filled))[:examples],
        })
    return result


def distribution(rows: Rows, column: int, top: int) -> dict[str, Any]:
    """The `top` most frequent values (empty cells as "(vuoto)"), and how many cells the others hold."""

    counts = Counter(row[column].strip() or EMPTY_LABEL for row in rows)
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    shown = ordered[:top]
    return {
        "labels": [value for value, _ in shown],
        "counts": [count for _, count in shown],
        "other": sum(count for _, count in ordered[top:]),
        "total": len(rows),
    }
