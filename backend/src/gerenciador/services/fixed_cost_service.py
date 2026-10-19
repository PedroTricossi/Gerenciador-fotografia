"""Monthly fixed costs and the price history each one carries."""

from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import FixedCost, FixedCostPrice
from gerenciador.domain.contract import ContractRuleError
from gerenciador.domain.text import fold
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import ConflictError, NotFoundError, StaleVersionError
from gerenciador.services.expense_type_service import ExpenseTypeService

_ENTITY = "fixed_cost"
SECOND_PHOTOGRAPHER_KEY = "second_photographer"


@dataclass(frozen=True)
class PriceView:
    from_month: str
    amount_cents: int


@dataclass(frozen=True)
class FixedCostView:
    id: str
    name: str
    type_id: str
    type_name: str
    day_of_month: int
    start_month: str
    end_month: str | None
    prices: list[PriceView]
    version: int


def _view(cost: FixedCost) -> FixedCostView:
    return FixedCostView(
        id=cost.id,
        name=cost.name,
        type_id=cost.type_id,
        type_name=cost.type.name,
        day_of_month=cost.day_of_month,
        start_month=cost.start_month,
        end_month=cost.end_month,
        prices=[PriceView(p.from_month, p.amount_cents) for p in cost.prices],
        version=cost.version,
    )


class FixedCostService:
    def __init__(self, session: Session, types: ExpenseTypeService, audit: AuditService) -> None:
        self._session = session
        self._types = types
        self._audit = audit

    def list_fixed_costs(self) -> list[FixedCostView]:
        costs = self._session.scalars(select(FixedCost)).unique()
        return [_view(c) for c in sorted(costs, key=lambda c: (fold(c.name), c.id))]

    def create(
        self,
        ctx: RequestContext,
        name: str,
        type_id: str,
        day_of_month: int,
        start_month: str,
        amount_cents: int,
    ) -> FixedCostView:
        expense_type = self._types.require_active(type_id)
        if expense_type.key == SECOND_PHOTOGRAPHER_KEY:
            raise ContractRuleError("type_id", "o 2º fotógrafo tem valor próprio")
        now = utcnow()
        cost = FixedCost(
            id=str(uuid4()),
            name=name,
            type_id=type_id,
            day_of_month=day_of_month,
            start_month=start_month,
            end_month=None,
            version=1,
            created_at=now,
            updated_at=now,
        )
        cost.type = expense_type
        cost.prices = [
            FixedCostPrice(id=str(uuid4()), from_month=start_month, amount_cents=amount_cents)
        ]
        self._session.add(cost)
        self._record(ctx, "fixed_cost.created", cost, {"version": 1})
        self._session.commit()
        return _view(cost)

    def rename(
        self, ctx: RequestContext, cost_id: str, expected_version: int, name: str
    ) -> FixedCostView:
        cost = self._require(cost_id)
        if cost.version != expected_version:
            raise StaleVersionError(_ENTITY)
        if name != cost.name:
            cost.name = name
            self._bump(cost)
            self._record(ctx, "fixed_cost.renamed", cost, {"version": cost.version})
        self._session.commit()
        return _view(cost)

    def set_price(
        self, ctx: RequestContext, cost_id: str, from_month: str, amount_cents: int
    ) -> FixedCostView:
        cost = self._require(cost_id)
        if from_month < cost.start_month:
            raise ContractRuleError("from_month", "o preço não pode começar antes do início")
        existing = next((p for p in cost.prices if p.from_month == from_month), None)
        if existing is not None:
            existing.amount_cents = amount_cents
        else:
            cost.prices.append(
                FixedCostPrice(id=str(uuid4()), from_month=from_month, amount_cents=amount_cents)
            )
        self._session.flush()
        self._session.refresh(cost, ["prices"])
        self._bump(cost)
        self._record(
            ctx, "fixed_cost.price_set", cost, {"from_month": from_month, "version": cost.version}
        )
        self._session.commit()
        return _view(cost)

    def stop(self, ctx: RequestContext, cost_id: str, end_month: str) -> FixedCostView:
        cost = self._require(cost_id)
        if cost.end_month is not None:
            raise ConflictError("o custo já foi encerrado")
        if end_month < cost.start_month:
            raise ContractRuleError("end_month", "o fim não pode ser antes do início")
        cost.end_month = end_month
        self._bump(cost)
        self._record(
            ctx, "fixed_cost.stopped", cost, {"end_month": end_month, "version": cost.version}
        )
        self._session.commit()
        return _view(cost)

    def resume(self, ctx: RequestContext, cost_id: str) -> FixedCostView:
        cost = self._require(cost_id)
        if cost.end_month is None:
            raise ConflictError("o custo não está encerrado")
        cost.end_month = None
        self._bump(cost)
        self._record(ctx, "fixed_cost.resumed", cost, {"version": cost.version})
        self._session.commit()
        return _view(cost)

    def delete(self, ctx: RequestContext, cost_id: str, expected_version: int) -> None:
        cost = self._require(cost_id)
        if cost.version != expected_version:
            raise StaleVersionError(_ENTITY)
        self._session.delete(cost)
        self._record(ctx, "fixed_cost.deleted", cost, {"version": cost.version})
        self._session.commit()

    def _bump(self, cost: FixedCost) -> None:
        cost.version += 1
        cost.updated_at = utcnow()

    def _record(
        self, ctx: RequestContext, action: str, cost: FixedCost, details: dict[str, object]
    ) -> None:
        self._audit.record(ctx, action, entity_type=_ENTITY, entity_id=cost.id, details=details)

    def _require(self, cost_id: str) -> FixedCost:
        cost = self._session.get(FixedCost, cost_id)
        if cost is None:
            raise NotFoundError(_ENTITY, cost_id)
        return cost
