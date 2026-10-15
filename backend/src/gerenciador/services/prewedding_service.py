"""Pre-wedding shoots: an optional second event on a contract, scheduled apart from it."""

import datetime as dt
from collections.abc import Iterable
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import Contract, ContractItem, PreweddingEvent
from gerenciador.repositories.contract_repository import ContractRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import (
    ConflictError,
    NotFoundError,
    PreconditionRequiredError,
    StaleVersionError,
)

ENTITY = "prewedding"
_FIELDS = ("event_date", "venue_name", "venue_address", "start_time")


@dataclass(frozen=True)
class PreweddingInput:
    event_date: dt.date
    venue_name: str
    venue_address: str | None
    start_time: dt.time | None


@dataclass(frozen=True)
class PreweddingView:
    id: str
    contract_id: str
    event_date: dt.date
    venue_name: str
    venue_address: str | None
    start_time: dt.time | None
    version: int


def includes_prewedding(items: Iterable[ContractItem]) -> bool:
    """True when any item's service is currently marked as a pre-wedding shoot."""
    return any(item.service.is_prewedding for item in items)


def prewedding_view(row: PreweddingEvent) -> PreweddingView:
    return PreweddingView(
        id=row.id,
        contract_id=row.contract_id,
        event_date=row.event_date,
        venue_name=row.venue_name,
        venue_address=row.venue_address,
        start_time=row.start_time,
        version=row.version,
    )


def new_prewedding(data: PreweddingInput) -> PreweddingEvent:
    """A row to attach with `contract.prewedding = ...`, which sets its contract_id."""
    now = utcnow()
    return PreweddingEvent(
        id=str(uuid4()),
        version=1,
        created_at=now,
        updated_at=now,
        **{field: getattr(data, field) for field in _FIELDS},
    )


def record_scheduled(audit: AuditService, ctx: RequestContext, row: PreweddingEvent) -> None:
    """Call after a flush, so the row knows its contract."""
    audit.record(
        ctx,
        "prewedding.scheduled",
        entity_type=ENTITY,
        entity_id=row.id,
        details={"version": 1, "contract_id": row.contract_id},
    )


def record_cancelled(
    audit: AuditService,
    ctx: RequestContext,
    row: PreweddingEvent,
    *,
    via: str | None = None,
) -> None:
    details: dict[str, object] = {"version": row.version}
    if via is not None:
        details["via"] = via
    audit.record(
        ctx,
        "prewedding.cancelled",
        entity_type=ENTITY,
        entity_id=row.id,
        details=details,
    )


class PreweddingService:
    def __init__(self, session: Session, audit: AuditService) -> None:
        self._session = session
        self._contracts = ContractRepository(session)
        self._audit = audit

    def get(self, contract_id: str) -> PreweddingView:
        return prewedding_view(self._scheduled(self._active(contract_id)))

    def schedule(
        self,
        ctx: RequestContext,
        contract_id: str,
        expected_version: int | None,
        data: PreweddingInput,
    ) -> tuple[PreweddingView, bool]:
        """Create or change the pre-wedding; the flag says whether it was created.

        `expected_version` is ignored while nothing is scheduled and required after.
        Checks run in order: contract found, version, eligibility.
        """
        contract = self._active(contract_id)
        row = contract.prewedding
        if row is not None:
            if expected_version is None:
                raise PreconditionRequiredError
            if row.version != expected_version:
                raise StaleVersionError(ENTITY)
        if not includes_prewedding(contract.items):
            raise ConflictError("este contrato não inclui pré-wedding")
        if row is None:
            return self._create(ctx, contract, data), True
        return self._change(ctx, row, data), False

    def cancel(self, ctx: RequestContext, contract_id: str, expected_version: int) -> None:
        contract = self._active(contract_id)
        row = self._scheduled(contract)
        if row.version != expected_version:
            raise StaleVersionError(ENTITY)
        record_cancelled(self._audit, ctx, row)
        contract.prewedding = None
        self._session.commit()

    def _create(
        self, ctx: RequestContext, contract: Contract, data: PreweddingInput
    ) -> PreweddingView:
        row = new_prewedding(data)
        contract.prewedding = row
        try:
            self._session.flush()
        except IntegrityError as exc:
            # Another request scheduled one after this contract was read.
            self._session.rollback()
            raise PreconditionRequiredError from exc
        record_scheduled(self._audit, ctx, row)
        self._session.commit()
        return prewedding_view(row)

    def _change(
        self, ctx: RequestContext, row: PreweddingEvent, data: PreweddingInput
    ) -> PreweddingView:
        changed = [field for field in _FIELDS if getattr(row, field) != getattr(data, field)]
        if changed:
            for field in changed:
                setattr(row, field, getattr(data, field))
            row.version += 1
            row.updated_at = utcnow()
            self._audit.record(
                ctx,
                "prewedding.updated",
                entity_type=ENTITY,
                entity_id=row.id,
                details={"fields": changed, "version": row.version},
            )
        self._session.commit()
        return prewedding_view(row)

    def _active(self, contract_id: str) -> Contract:
        contract = self._contracts.get(contract_id)
        if contract is None or contract.deleted_at is not None:
            raise NotFoundError("contract", contract_id, "contrato não encontrado")
        return contract

    @staticmethod
    def _scheduled(contract: Contract) -> PreweddingEvent:
        if contract.prewedding is None:
            raise NotFoundError(ENTITY, contract.id, "pré-wedding não agendado")
        return contract.prewedding
