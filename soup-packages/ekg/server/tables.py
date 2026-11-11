"""
------------------------------------------------------------------------
File : tables.py
Description: Table - the plain, textual data structure an importer hands
             to the event log (moved here from soup/core/contracts/
             tables.py). Every cell is a string or None: type coercion/
             parsing is EventLog.from_data's job, not the reader's. Plus
             to_dataframe()/from_dataframe(), the conversion between a
             pandas DataFrame and a Table (moved here from the csv_reader
             package, removed in commit 8).
Project : soup-packages/ekg
------------------------------------------------------------------------
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass, field

import pandas as pd

from soup.core.contracts import ValidationError


@dataclass(frozen=True)
class Table:
    """
    Immutable, rectangular table of text (or None) cells.

    :raises ValueError: if `columns` is empty, contains duplicates, or any
        row's length does not match the number of columns.
    """

    columns: tuple[str, ...]
    rows: tuple[tuple[str | None, ...], ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if not isinstance(self.columns, tuple):
            object.__setattr__(self, "columns", tuple(self.columns))
        if not isinstance(self.rows, tuple):
            object.__setattr__(self, "rows", tuple(tuple(row) for row in self.rows))

        if len(self.columns) == 0:
            raise ValueError("Table must have at least one column")
        if len(set(self.columns)) != len(self.columns):
            raise ValueError(f"Table columns must be unique, got {self.columns!r}")

        expected_length = len(self.columns)
        for index, row in enumerate(self.rows):
            if len(row) != expected_length:
                raise ValueError(
                    f"Row {index} has {len(row)} cells, expected {expected_length} (one per column {self.columns!r})"
                )

    # ------------------------------------------------------------------ #
    # Constructors
    # ------------------------------------------------------------------ #
    @classmethod
    def from_records(cls, records: Iterable[Mapping[str, str | None]], columns: Sequence[str] | None = None) -> Table:
        """Build a Table from an iterable of {column: value} dicts."""

        records = list(records)
        if columns is None:
            if not records:
                raise ValueError("Cannot infer columns from an empty list of records; pass `columns` explicitly")
            columns = list(records[0].keys())

        rows = tuple(tuple(record.get(column) for column in columns) for record in records)
        return cls(tuple(columns), rows)

    @classmethod
    def from_rows(cls, columns: Sequence[str], rows: Iterable[Sequence[str | None]]) -> Table:
        """Build a Table from an explicit column list and row-tuples/lists."""

        return cls(tuple(columns), tuple(tuple(row) for row in rows))

    # ------------------------------------------------------------------ #
    # Access helpers
    # ------------------------------------------------------------------ #
    def column_index(self, name: str) -> int:
        return self.columns.index(name)

    def iter_records(self) -> Iterator[dict[str, str | None]]:
        for row in self.rows:
            yield dict(zip(self.columns, row, strict=False))

    def __len__(self) -> int:
        return len(self.rows)

    def __iter__(self) -> Iterator[tuple[str | None, ...]]:
        return iter(self.rows)

    def __contains__(self, column: object) -> bool:
        return column in self.columns


def to_dataframe(table: Table) -> pd.DataFrame:
    """Convert a Table into a pandas DataFrame of strings/NaN."""

    return pd.DataFrame(list(table.rows), columns=list(table.columns))


def from_dataframe(frame: pd.DataFrame) -> Table:
    """
    Convert a pandas DataFrame into a Table: every cell becomes a string
    or None (NaN/NA -> None). Column names are coerced to str.
    """

    columns = tuple(str(column) for column in frame.columns)
    rows = []
    for row_number, record in enumerate(frame.itertuples(index=False, name=None), start=1):
        cells = []
        for column, value in zip(columns, record, strict=True):
            try:
                cells.append(None if pd.isna(value) else str(value))
            except (TypeError, ValueError) as exc:
                raise ValidationError(
                    f"Column '{column}', data row {row_number} cannot be converted from "
                    f"{type(value).__name__} to scalar text. Flatten structured values first.",
                    details={
                        "phase": "table conversion",
                        "column": column,
                        "row": row_number,
                        "value_type": type(value).__name__,
                    },
                ) from exc
        rows.append(tuple(cells))
    return Table(columns, tuple(rows))
