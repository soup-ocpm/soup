"""
------------------------------------------------------------------------
File : operation_router.py
Description: OperationRouter - offers, for a selection of objects, the
             operations whose inputs they fill (same number of objects,
             each of a kind its input slot accepts) and whose tools are
             loaded; runs one of them after validating its parameters,
             and registers every produced object with parents = the input
             ids and created_by = the operation. If an output is invalid
             or its registration fails, the outputs already registered
             are removed and op.dispose() is called on every output, then
             the error is re-raised. An operation that does not exist or
             does not apply to the given objects is a 404. Operations
             are addressed by their full key "<package>.<id>"
             (operations_for() lists them with their key and package),
             which is also what created_by.contributor_id records.
Project : soup-server
------------------------------------------------------------------------
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import replace
from datetime import datetime
from itertools import permutations
from typing import Any

from soup.core.contracts import (
    CREATED_BY_OPERATION,
    REPORT,
    CreatedBy,
    Field,
    NotFoundError,
    ObjectDraft,
    ObjectRef,
    Operation,
    validate_name,
)
from soup.core.contracts.report import validate_blocks
from soup.core.event_bus import EventBus
from soup.core.events import OBJECT_CREATED
from soup.core.field_validation import validate_values
from soup.core.registry import Registered, Registry
from soup.core.services.catalog_ports import CatalogWriter
from soup.core.services.core_tools import CoreTools, ObjectLike, new_object_id, timestamp
from soup.core.toolbox import ToolBox

_LOGGER = logging.getLogger("soup.operations")

# Beyond this many inputs only the positional assignment is tried.
_MAX_PERMUTED_INPUTS = 6

InputIds = Sequence[ObjectLike] | Mapping[str, ObjectLike]


def assign_inputs(operation: Operation, objects: Sequence[ObjectRef]) -> dict[str, ObjectRef] | None:
    """
    Map `objects` onto the operation's input slots, or None if they do not
    fit. The given order is preferred; otherwise any order whose kinds fit.
    """

    slots = list(operation.inputs)
    if len(slots) != len(objects):
        return None
    orders = [tuple(objects)]
    if len(objects) <= _MAX_PERMUTED_INPUTS:
        orders.extend(order for order in permutations(objects) if order != tuple(objects))
    for order in orders:
        if all(obj.kind in slot.kinds for slot, obj in zip(slots, order, strict=False)):
            return {slot.name: obj for slot, obj in zip(slots, order, strict=False)}
    return None


class OperationRouter:
    def __init__(
        self,
        operations: Registry[Operation],
        core_tools: CoreTools,
        event_bus: EventBus,
        clock: Callable[[], datetime] = datetime.now,
    ):
        self._operations = operations
        self._core_tools = core_tools
        self._event_bus = event_bus
        self._clock = clock

    def operations_for(self, objects: Sequence[ObjectLike]) -> list[Registered[Operation]]:
        refs = [self._core_tools.object(obj) for obj in objects]
        applicable = [
            entry for entry in self._operations.entries()
            if self._core_tools.available(entry.item.requires_tools) and self._core_tools.supports(entry.package, refs)
            and assign_inputs(entry.item, refs) is not None
        ]
        return sorted(applicable, key=lambda entry: (entry.item.group.lower(), entry.item.label.lower(), entry.key))

    def package_of(self, operation_id: str) -> str:
        return self._operations.owner_of(operation_id) or ""

    def fields(self, operation_id: str, input_ids: InputIds) -> list[Field]:
        operation, inputs = self._resolve(operation_id, input_ids)
        with self._core_tools.graph_scope(inputs.values()):
            return self._fields(operation, inputs, self._toolbox(operation_id, operation))

    def run(
        self, operation_id: str, input_ids: InputIds, params: Mapping[str, Any] | None = None
    ) -> list[ObjectRef]:
        """
        `input_ids` is a list of object ids (matched to the input slots as
        in operations_for) or a {slot name: object id} mapping.

        :raises NotFoundError: unknown object, or operation unknown/not applicable to them
        :raises ValidationError: params do not match the operation's fields
        """

        operation, inputs = self._resolve(operation_id, input_ids)
        tools = self._toolbox(operation_id, operation)
        with self._core_tools.graph_scope(inputs.values(), memgraph="memgraph" in operation.requires_tools):
            cleaned = validate_values(self._fields(operation, inputs, tools), params)
            drafts = list(operation.run(inputs, cleaned, tools) or [])

        parents = tuple(dict.fromkeys(inputs[slot.name].id for slot in operation.inputs))
        created_by = CreatedBy(CREATED_BY_OPERATION, operation_id, self.package_of(operation_id))
        created_at = timestamp(self._clock)
        outputs = [
            ObjectRef(
                id=new_object_id(),
                name=getattr(draft, "name", ""),
                kind=getattr(draft, "kind", ""),
                created_by=created_by,
                parents=parents,
                created_at=created_at,
                description=getattr(draft, "description", "") or "",
                meta=dict(getattr(draft, "meta", None) or {}),
            )
            for draft in drafts
        ]

        catalog = self._core_tools.catalog_writer()
        registered: list[str] = []
        try:
            outputs = [self._checked(operation, draft, output) for draft, output in zip(drafts, outputs, strict=False)]
            for output in outputs:
                catalog.add(output)
                registered.append(output.id)
        except Exception:
            self._compensate(operation, outputs, registered, catalog, tools)
            raise

        for output in outputs:
            self._event_bus.publish(OBJECT_CREATED, {"object": output.to_dict()})
        return outputs

    # ------------------------------------------------------------------ #
    def _resolve(self, operation_id: str, input_ids: InputIds) -> tuple[Operation, dict[str, ObjectRef]]:
        operation = self._operations.get(operation_id)
        if operation is None or not self._core_tools.available(operation.requires_tools):
            raise NotFoundError(f"Operation '{operation_id}' not found")

        if isinstance(input_ids, Mapping):
            inputs = {name: self._core_tools.object(obj) for name, obj in input_ids.items()}
            fits = set(inputs) == {slot.name for slot in operation.inputs} and all(
                inputs[slot.name].kind in slot.kinds for slot in operation.inputs
            )
            assigned: dict[str, ObjectRef] | None = inputs if fits else None
        else:
            assigned = assign_inputs(operation, [self._core_tools.object(obj) for obj in input_ids])

        if assigned is None or not self._core_tools.supports(self.package_of(operation_id), assigned.values()):
            raise NotFoundError(f"Operation '{operation_id}' is not available for the given objects")
        return operation, assigned

    def _toolbox(self, key: str, operation: Operation) -> ToolBox:
        return self._core_tools.toolbox(f"operation '{key}'", operation.requires_tools)

    @staticmethod
    def _fields(operation: Operation, inputs: Mapping[str, ObjectRef], tools: ToolBox) -> list[Field]:
        fields = list(operation.fields(inputs, tools) or [])
        for item in fields:
            if not isinstance(item, Field):
                raise TypeError(f"Operation '{operation.id}'.fields() must return Fields, got {type(item).__name__}")
        return fields

    @staticmethod
    def _checked(operation: Operation, draft: Any, output: ObjectRef) -> ObjectRef:
        if not isinstance(draft, ObjectDraft):
            raise TypeError(f"Operation '{operation.id}'.run() must return ObjectDrafts, got {type(draft).__name__}")
        validate_name(draft.name)
        if draft.kind not in tuple(operation.produces):
            raise ValueError(
                f"Operation '{operation.id}' produced kind {draft.kind!r}, "
                f"not among its produces {tuple(operation.produces)}"
            )
        if draft.kind == REPORT:
            blocks = validate_blocks(output.meta.get("blocks"))
            return replace(output, meta={**output.meta, "blocks": blocks})
        return output

    @staticmethod
    def _compensate(
        operation: Operation, outputs: list[ObjectRef], registered: list[str], catalog: CatalogWriter, tools: ToolBox
    ) -> None:
        for object_id in reversed(registered):
            try:
                catalog.remove(object_id)
            except Exception:  # noqa: BLE001 - the original error is the one to report
                _LOGGER.exception("Compensation failed: could not remove object '%s' from the catalog", object_id)
        for output in outputs:
            try:
                operation.dispose(output, tools)
            except Exception:  # noqa: BLE001 - the original error is the one to report
                _LOGGER.exception(
                    "Compensation failed: operation '%s' could not dispose of object '%s'", operation.id, output.id
                )
