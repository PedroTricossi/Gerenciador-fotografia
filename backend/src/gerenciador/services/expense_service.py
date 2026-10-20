"""One-off expenses, trip details for transport, and the events a trip can be linked to."""

import datetime as dt
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, lazyload

from gerenciador.clock import utcnow
from gerenciador.db.models import Contract, Expense
from gerenciador.domain.contract import ContractRuleError
from gerenciador.repositories.contract_repository import ContractRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import NotFoundError, StaleVersionError
from gerenciador.services.expense_type_service import ExpenseTypeService

_ENTITY = "expense"
TRANSPORT_KEY = "transport"
WEDDING = "wedding"
PREWEDDING = "prewedding"


@dataclass(frozen=True)
class TripInput:
    contract_id: str
    event_kind: str
    transport_kind: str
    left_home_at: dt.time
    distance_tenths: int


@dataclass(frozen=True)
class ExpenseInput:
    spent_on: dt.date
    amount_cents: int
    type_id: str
    description: str | None
    trip: TripInput | None
    instalment_count: int = 1


@dataclass(frozen=True)
class ExpenseView:
    id: str
    spent_on: dt.date
    amount_cents: int
    type_id: str
    description: str | None
    trip: TripInput | None
    instalment_count: int
    version: int
    created_at: dt.datetime


@dataclass(frozen=True)
class EventChoice:
    contract_id: str
    event_kind: str
    date: dt.date
    groom_name: str | None
    bride_name: str | None
    venue_name: str
    venue_address: str | None


def _trip(expense: Expense) -> TripInput | None:
    if (
        expense.contract_id is None
        or expense.event_kind is None
        or expense.transport_kind is None
        or expense.left_home_at is None
        or expense.distance_tenths is None
    ):
        return None
    return TripInput(
        expense.contract_id,
        expense.event_kind,
        expense.transport_kind,
        expense.left_home_at,
        expense.distance_tenths,
    )


def _view(expense: Expense) -> ExpenseView:
    return ExpenseView(
        id=expense.id,
        spent_on=expense.spent_on,
        amount_cents=expense.amount_cents,
        type_id=expense.type_id,
        description=expense.description,
        trip=_trip(expense),
        instalment_count=expense.instalment_count,
        version=expense.version,
        created_at=expense.created_at,
    )


def _check_total(data: ExpenseInput) -> None:
    if data.amount_cents < data.instalment_count:
        raise ContractRuleError(
            "amount_cents", "o valor total deve ser de pelo menos 1 centavo por parcela"
        )


def _apply_trip(expense: Expense, trip: TripInput | None) -> None:
    expense.contract_id = trip.contract_id if trip else None
    expense.event_kind = trip.event_kind if trip else None
    expense.transport_kind = trip.transport_kind if trip else None
    expense.left_home_at = trip.left_home_at if trip else None
    expense.distance_tenths = trip.distance_tenths if trip else None


class ExpenseService:
    def __init__(self, session: Session, types: ExpenseTypeService, audit: AuditService) -> None:
        self._session = session
        self._types = types
        self._contracts = ContractRepository(session)
        self._audit = audit

    def create(self, ctx: RequestContext, data: ExpenseInput) -> ExpenseView:
        _check_total(data)
        expense_type = self._types.require_active(data.type_id)
        is_transport = expense_type.key == TRANSPORT_KEY
        if data.trip is not None:
            if not is_transport:
                raise ContractRuleError("trip", "só despesas de transporte têm deslocamento")
            self._check_link(data.trip)
        now = utcnow()
        expense = Expense(
            id=str(uuid4()),
            spent_on=data.spent_on,
            amount_cents=data.amount_cents,
            type_id=data.type_id,
            description=data.description,
            instalment_count=data.instalment_count,
            version=1,
            created_at=now,
            updated_at=now,
        )
        expense.type = expense_type
        _apply_trip(expense, data.trip)
        self._session.add(expense)
        self._audit.record(
            ctx,
            "expense.created",
            entity_type=_ENTITY,
            entity_id=expense.id,
            details={"version": 1, "instalment_count": data.instalment_count},
        )
        self._session.commit()
        return _view(expense)

    def get(self, expense_id: str) -> ExpenseView:
        return _view(self._require(expense_id))

    def update(
        self, ctx: RequestContext, expense_id: str, expected_version: int, data: ExpenseInput
    ) -> ExpenseView:
        expense = self._require(expense_id)
        if expense.version != expected_version:
            raise StaleVersionError(_ENTITY)
        _check_total(data)
        # The type it already has stays acceptable even after it was archived.
        if data.type_id == expense.type_id:
            expense_type = expense.type
        else:
            expense_type = self._types.require_active(data.type_id)
        trip = data.trip if expense_type.key == TRANSPORT_KEY else None
        stored = _trip(expense)
        if trip is not None and not _same_link(trip, stored):
            self._check_link(trip)

        changed = [
            name
            for name, differs in (
                ("spent_on", data.spent_on != expense.spent_on),
                ("amount_cents", data.amount_cents != expense.amount_cents),
                ("type_id", data.type_id != expense.type_id),
                ("description", data.description != expense.description),
                ("trip", trip != stored),
                ("instalment_count", data.instalment_count != expense.instalment_count),
            )
            if differs
        ]
        if changed:
            expense.spent_on = data.spent_on
            expense.amount_cents = data.amount_cents
            expense.type_id = data.type_id
            expense.type = expense_type
            expense.description = data.description
            expense.instalment_count = data.instalment_count
            _apply_trip(expense, trip)
            expense.version += 1
            expense.updated_at = utcnow()
            self._audit.record(
                ctx,
                "expense.updated",
                entity_type=_ENTITY,
                entity_id=expense.id,
                details={"fields": changed, "version": expense.version},
            )
        self._session.commit()
        return _view(expense)

    def delete(self, ctx: RequestContext, expense_id: str, expected_version: int) -> None:
        expense = self._require(expense_id)
        if expense.version != expected_version:
            raise StaleVersionError(_ENTITY)
        self._session.delete(expense)
        self._audit.record(
            ctx,
            "expense.deleted",
            entity_type=_ENTITY,
            entity_id=expense.id,
            details={"version": expense.version},
        )
        self._session.commit()

    def list_events(self) -> list[EventChoice]:
        """Weddings and pre-weddings of contracts that are not deleted, by date."""
        stmt = (
            select(Contract).options(lazyload(Contract.items)).where(Contract.deleted_at.is_(None))
        )
        choices: list[EventChoice] = []
        for contract in self._session.scalars(stmt).unique():
            groom, bride = contract.groom.full_name, contract.bride.full_name
            choices.append(
                EventChoice(
                    contract.id,
                    WEDDING,
                    contract.event_date,
                    groom,
                    bride,
                    contract.venue_name,
                    contract.venue_address,
                )
            )
            pre = contract.prewedding
            if pre is not None:
                choices.append(
                    EventChoice(
                        contract.id,
                        PREWEDDING,
                        pre.event_date,
                        groom,
                        bride,
                        pre.venue_name,
                        pre.venue_address,
                    )
                )
        return sorted(choices, key=lambda c: (c.date, c.contract_id, c.event_kind))

    def _check_link(self, trip: TripInput) -> None:
        contract = self._contracts.get(trip.contract_id)
        if contract is None or contract.deleted_at is not None:
            raise ContractRuleError("trip.contract_id", "contrato inexistente ou excluído")
        if trip.event_kind == PREWEDDING and contract.prewedding is None:
            raise ContractRuleError("trip.contract_id", "o contrato não tem pré-wedding")

    def _require(self, expense_id: str) -> Expense:
        expense = self._session.get(Expense, expense_id)
        if expense is None:
            raise NotFoundError(_ENTITY, expense_id)
        return expense


def _same_link(trip: TripInput, stored: TripInput | None) -> bool:
    return (
        stored is not None
        and trip.contract_id == stored.contract_id
        and trip.event_kind == stored.event_kind
    )
