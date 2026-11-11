"""
------------------------------------------------------------------------
File : multiplicity.py
Description: The multiplicities between entity columns (1 to 1, 1 to N,
             N to 1, N to N), moved here from the old frontend's
             NewDatasetComponent.calculateMultiplicity /
             calculateAllMultiplicities, which drew them as a UML
             diagram before the import; here they are a "graph" block
             (the format of soup_base/README.md, section Dati) drawn by
             <soup-graph-view> in the import preview: one node per entity
             column, one edge per pair of columns whose `group` (the
             relationship type) is the multiplicity. Multi-valued cells
             are split on ',' (as the :CORR query does); empty cells are
             skipped. Corrected: the last if/else of the old
             calculateMultiplicity overwrote every result except "N to 1"
             with "1 to 1" ("1 to N" and "N to N" were never shown).
Project : soup-packages/csv_ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from soup_pkg_ekg.api import Table

from soup.core.contracts import report

NONE = "0"
ONE = "1"
MANY = "N"
# A multiplicity needs two columns.
MIN_COLUMNS = 2


def _values(cell: str | None) -> list[str]:
    if cell is None:
        return []
    return [part.strip() for part in cell.split(",") if part.strip() and part.strip() != "null"]


def _side(links: dict[str, set[str]]) -> str:
    """'0' without links, 'N' if some value is linked to several others, else '1'."""

    if not links:
        return NONE
    return MANY if any(len(others) > 1 for others in links.values()) else ONE


def multiplicity(table: Table, first: str, second: str) -> tuple[str, str, str]:
    """
    (multiplicity of `first`, multiplicity of `second`, global), e.g.
    ("1", "N", "1 to N"): every `second` value goes with one `first`
    value, and some `first` value goes with several `second` values.
    """

    first_index, second_index = table.column_index(first), table.column_index(second)
    first_to_second: dict[str, set[str]] = {}
    second_to_first: dict[str, set[str]] = {}
    for row in table.rows:
        firsts, seconds = _values(row[first_index]), _values(row[second_index])
        for value in firsts:
            first_to_second.setdefault(value, set()).update(seconds)
        for value in seconds:
            second_to_first.setdefault(value, set()).update(firsts)

    # The multiplicity on the side of `first` is how many `first` values
    # one `second` value goes with, and vice versa.
    left, right = _side(second_to_first), _side(first_to_second)
    if NONE in (left, right):
        overall = NONE
    elif left == MANY and right == MANY:
        overall = "N to N"
    elif left == ONE and right == MANY:
        overall = "1 to N"
    elif left == MANY and right == ONE:
        overall = "N to 1"
    else:
        overall = "1 to 1"
    return left, right, overall


def multiplicity_block(table: Table, columns: Sequence[str]) -> dict[str, Any] | None:
    """The "graph" block of the multiplicities between `columns`, or None with fewer than two."""

    columns = list(dict.fromkeys(column for column in columns if column in table.columns))
    if len(columns) < MIN_COLUMNS:
        return None
    edges = []
    for index, first in enumerate(columns):
        for second in columns[index + 1:]:
            left, right, overall = multiplicity(table, first, second)
            if overall == NONE:
                continue
            edges.append({
                "id": f"{first}~{second}",
                "source": first,
                "target": second,
                "label": f"{left} : {right}",
                "group": overall,
                "props": {"multiplicity": overall, "source_side": left, "target_side": right},
            })
    nodes = [{"id": column, "label": column, "group": "entity", "props": {}} for column in columns]
    return report.graph(nodes, edges, directed=False, title="Multiplicity between entity columns")
