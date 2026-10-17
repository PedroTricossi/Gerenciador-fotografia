"""Marking a contract's instalments paid or unpaid, and listing them across contracts."""

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, lazyload

from gerenciador.db.models import Contract, Instalment
from gerenciador.repositories.contract_repository import ContractRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_service import InstalmentView
from gerenciador.services.exceptions import ConflictError, NotFoundError

ALREADY_PAID = "already paid"
NOT_PAID = "not paid"

# Only the couple and the plan are needed: skip loading the items and the pre-wedding.
_LEAN = (lazyload(Contract.items), lazyload(Contract.prewedding))


@dataclass(frozen=True)
class InstalmentListEntry:
    contract_id: str
    groom_name: str | None
    bride_name: str | None
    number: int
    count: int
    month: str
    amount_cents: int
    paid_on: dt.date | None
    plan_needs_review: bool


def _view(row: Instalment) -> InstalmentView:
    return InstalmentView(row.number, row.month, row.amount_cents, row.paid_on)


class InstalmentService:
    def __init__(self, session: Session, audit: AuditService) -> None:
        self._session = session
        self._contracts = ContractRepository(session)
        self._audit = audit

    def mark_paid(
        self, ctx: RequestContext, contract_id: str, number: int, paid_on: dt.date
    ) -> InstalmentView:
        row = self._row(contract_id, number)
        if row.paid_on is not None:
            raise ConflictError(ALREADY_PAID)
        row.paid_on = paid_on
        return self._save(ctx, "instalment.paid", row)

    def mark_unpaid(self, ctx: RequestContext, contract_id: str, number: int) -> InstalmentView:
        row = self._row(contract_id, number)
        if row.paid_on is None:
            raise ConflictError(NOT_PAID)
        row.paid_on = None
        return self._save(ctx, "instalment.unpaid", row)

    def list(self, unpaid_through: str | None) -> list[InstalmentListEntry]:
        """Instalments of contracts that are not deleted, by month, event date, then number.

        With `unpaid_through` ("YYYY-MM"), only unpaid ones due up to that month.
        """
        stmt = (
            select(Contract)
            .options(*_LEAN)
            .where(Contract.deleted_at.is_(None))
            .order_by(Contract.event_date, Contract.id)
        )
        entries = [
            InstalmentListEntry(
                contract_id=contract.id,
                groom_name=contract.groom.full_name,
                bride_name=contract.bride.full_name,
                number=row.number,
                count=len(contract.instalments),
                month=row.month,
                amount_cents=row.amount_cents,
                paid_on=row.paid_on,
                plan_needs_review=contract.plan_needs_review,
            )
            for contract in self._session.scalars(stmt)
            for row in contract.instalments
            if unpaid_through is None or (row.paid_on is None and row.month <= unpaid_through)
        ]
        # Stable: the contracts already come by event date, the rows by number.
        return sorted(entries, key=lambda entry: entry.month)

    def _row(self, contract_id: str, number: int) -> Instalment:
        contract = self._contracts.get(contract_id)
        if contract is None:
            raise NotFoundError("contract", contract_id, "contrato não encontrado")
        if contract.deleted_at is not None:
            raise ConflictError("contrato excluído")
        for row in contract.instalments:
            if row.number == number:
                return row
        raise NotFoundError("instalment", contract_id, "parcela não encontrada")

    def _save(self, ctx: RequestContext, action: str, row: Instalment) -> InstalmentView:
        self._audit.record(
            ctx,
            action,
            entity_type="contract",
            entity_id=row.contract_id,
            details={"number": row.number, "month": row.month},
        )
        self._session.commit()
        return _view(row)
