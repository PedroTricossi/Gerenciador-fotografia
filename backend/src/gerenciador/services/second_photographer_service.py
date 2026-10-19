"""The standard second-photographer fee by month, and per-contract overrides."""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import SecondPhotographerFee, SecondPhotographerOverride
from gerenciador.repositories.contract_repository import ContractRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import ConflictError, NotFoundError
from gerenciador.services.fixed_cost_service import PriceView

_FEE = "second_photographer_fee"
_OVERRIDE = "second_photographer_override"


class SecondPhotographerService:
    def __init__(self, session: Session, audit: AuditService) -> None:
        self._session = session
        self._contracts = ContractRepository(session)
        self._audit = audit

    def standard(self) -> list[PriceView]:
        rows = self._session.scalars(
            select(SecondPhotographerFee).order_by(SecondPhotographerFee.from_month)
        )
        return [PriceView(row.from_month, row.amount_cents) for row in rows]

    def set_standard(
        self, ctx: RequestContext, from_month: str, amount_cents: int
    ) -> list[PriceView]:
        row = self._session.scalars(
            select(SecondPhotographerFee).where(SecondPhotographerFee.from_month == from_month)
        ).one_or_none()
        if row is None:
            row = SecondPhotographerFee(
                id=str(uuid4()), from_month=from_month, amount_cents=amount_cents
            )
            self._session.add(row)
        else:
            row.amount_cents = amount_cents
        self._audit.record(
            ctx,
            f"{_FEE}.set",
            entity_type=_FEE,
            entity_id=row.id,
            details={"from_month": from_month},
        )
        self._session.commit()
        return self.standard()

    def set_override(self, ctx: RequestContext, contract_id: str, amount_cents: int) -> int:
        self._require_contract(contract_id)
        row = self._session.get(SecondPhotographerOverride, contract_id)
        if row is None:
            self._session.add(
                SecondPhotographerOverride(contract_id=contract_id, amount_cents=amount_cents)
            )
        else:
            row.amount_cents = amount_cents
        self._audit.record(
            ctx, f"{_OVERRIDE}.set", entity_type="contract", entity_id=contract_id, details={}
        )
        self._session.commit()
        return amount_cents

    def clear_override(self, ctx: RequestContext, contract_id: str) -> None:
        if self._contracts.get(contract_id) is None:
            raise NotFoundError("contract", contract_id)
        row = self._session.get(SecondPhotographerOverride, contract_id)
        if row is not None:
            self._session.delete(row)
            self._audit.record(
                ctx,
                f"{_OVERRIDE}.cleared",
                entity_type="contract",
                entity_id=contract_id,
                details={},
            )
        self._session.commit()

    def _require_contract(self, contract_id: str) -> None:
        contract = self._contracts.get(contract_id)
        if contract is None:
            raise NotFoundError("contract", contract_id)
        if contract.deleted_at is not None:
            raise ConflictError("contrato excluído")
        if contract.photographer_count < 2:
            raise ConflictError("o contrato não tem segundo fotógrafo")
