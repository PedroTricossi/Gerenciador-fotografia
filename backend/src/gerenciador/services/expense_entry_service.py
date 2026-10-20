"""The expenses of a month range, merged from manual entries, fixed costs and the fee."""

import datetime as dt
from dataclasses import dataclass, replace
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, lazyload

from gerenciador.db.models import (
    Contract,
    Expense,
    ExpenseType,
    FixedCost,
    SecondPhotographerFee,
    SecondPhotographerOverride,
)
from gerenciador.domain.contract import ContractRuleError
from gerenciador.domain.expenses import (
    MAX_EXPENSE_INSTALMENTS,
    expense_instalments,
    fee_amount,
    fixed_cost_occurrences,
    months_in,
    occurrence_date,
)
from gerenciador.domain.instalments import Month, add_months, month_of

FEE_TYPE_KEY = "second_photographer"
_WEDDING = "wedding"
_PREWEDDING = "prewedding"
_SOURCE_ORDER = {"fixed": 0, "manual": 1, "second_photographer": 2}

# The couple and the venue are needed; the items and the plan are not.
_LEAN = (lazyload(Contract.items), lazyload(Contract.instalments))


@dataclass(frozen=True)
class ExpenseEntry:
    id: str
    source: str  # "manual" | "fixed" | "second_photographer"
    date: dt.date
    amount_cents: int
    missing_amount: bool
    type_id: str
    type_name: str
    type_key: str | None
    description: str | None
    expense_id: str | None = None
    version: int | None = None
    fixed_cost_id: str | None = None
    contract_id: str | None = None
    event_kind: str | None = None
    groom_name: str | None = None
    bride_name: str | None = None
    link_state: str | None = None  # "ok" | "contract_deleted" | "prewedding_cancelled"
    venue_name: str | None = None
    venue_address: str | None = None
    transport_kind: str | None = None
    left_home_at: dt.time | None = None
    distance_tenths: int | None = None
    override: bool = False
    instalment_number: int | None = None
    instalment_count: int | None = None


def _sort_key(item: tuple[ExpenseEntry, dt.datetime]) -> tuple[dt.date, int, dt.datetime, str]:
    entry, created_at = item
    return (entry.date, _SOURCE_ORDER[entry.source], created_at, entry.id)


class ExpenseEntryService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def entries(self, from_month: Month, to_month: Month) -> list[ExpenseEntry]:
        """Every entry from `from_month` to `to_month` (inclusive), in display order."""
        try:
            months_in(from_month, to_month)  # the 24-month cap
        except ValueError as exc:
            raise ContractRuleError("to", str(exc)) from exc
        return self.entries_between(occurrence_date(from_month, 1), occurrence_date(to_month, 31))

    def entries_between(self, start: dt.date, end: dt.date) -> list[ExpenseEntry]:
        """Every entry dated from `start` to `end` (inclusive), in display order, with no cap."""
        if start > end:
            return []
        months = [month_of(start)]
        while months[-1] < month_of(end):
            months.append(add_months(months[-1], 1))
        found = [
            *(item for item in self._fixed(months) if start <= item[0].date <= end),
            *self._manual(start, end),
            *self._fees(start, end),
        ]
        return [entry for entry, _ in sorted(found, key=_sort_key)]

    def _fixed(self, months: list[Month]) -> list[tuple[ExpenseEntry, dt.datetime]]:
        result: list[tuple[ExpenseEntry, dt.datetime]] = []
        for cost in self._session.scalars(select(FixedCost)).unique():
            history = [(price.from_month, price.amount_cents) for price in cost.prices]
            for month, date, amount in fixed_cost_occurrences(
                cost.start_month, cost.end_month, cost.day_of_month, history, months
            ):
                entry = ExpenseEntry(
                    id=f"fixed:{cost.id}:{month}",
                    source="fixed",
                    date=date,
                    amount_cents=amount,
                    missing_amount=False,
                    type_id=cost.type_id,
                    type_name=cost.type.name,
                    type_key=cost.type.key,
                    description=cost.name,
                    fixed_cost_id=cost.id,
                )
                result.append((entry, cost.created_at))
        return result

    def _manual(self, start: dt.date, end: dt.date) -> list[tuple[ExpenseEntry, dt.datetime]]:
        expenses = list(
            self._session.scalars(
                select(Expense).where(
                    Expense.spent_on <= end,
                    # An instalment plan reaches up to 23 months past the purchase.
                    Expense.spent_on
                    >= occurrence_date(
                        add_months(month_of(start), -(MAX_EXPENSE_INSTALMENTS - 1)), 1
                    ),
                )
            ).unique()
        )
        linked = {e.contract_id for e in expenses if e.contract_id is not None}
        contracts = {
            c.id: c
            for c in self._session.scalars(
                select(Contract).options(*_LEAN).where(Contract.id.in_(linked))
            ).unique()
        }
        result: list[tuple[ExpenseEntry, dt.datetime]] = []
        for expense in expenses:
            count = expense.instalment_count
            for number, date, amount in expense_instalments(
                expense.spent_on, expense.amount_cents, count
            ):
                if not start <= date <= end:
                    continue
                entry = ExpenseEntry(
                    id=f"manual:{expense.id}:{number}" if count > 1 else f"manual:{expense.id}",
                    source="manual",
                    date=date,
                    amount_cents=amount,
                    missing_amount=False,
                    type_id=expense.type_id,
                    type_name=expense.type.name,
                    type_key=expense.type.key,
                    description=expense.description,
                    expense_id=expense.id,
                    version=expense.version,
                    contract_id=expense.contract_id,
                    event_kind=expense.event_kind,
                    transport_kind=expense.transport_kind,
                    left_home_at=expense.left_home_at,
                    distance_tenths=expense.distance_tenths,
                    instalment_number=number if count > 1 else None,
                    instalment_count=count if count > 1 else None,
                )
                entry = replace(entry, **self._link(expense, contracts))
                result.append((entry, expense.created_at))
        return result

    @staticmethod
    def _link(expense: Expense, contracts: dict[str, Contract]) -> dict[str, Any]:
        if expense.contract_id is None:
            return {}
        contract = contracts.get(expense.contract_id)
        if contract is None or contract.deleted_at is not None:
            return {"link_state": "contract_deleted"}
        if expense.event_kind == _PREWEDDING:
            pre = contract.prewedding
            if pre is None:
                # The contract is live, so the couple is still known; only the venue is gone.
                return {
                    "link_state": "prewedding_cancelled",
                    "groom_name": contract.groom.full_name,
                    "bride_name": contract.bride.full_name,
                }
            venue_name, venue_address = pre.venue_name, pre.venue_address
        else:
            venue_name, venue_address = contract.venue_name, contract.venue_address
        return {
            "link_state": "ok",
            "groom_name": contract.groom.full_name,
            "bride_name": contract.bride.full_name,
            "venue_name": venue_name,
            "venue_address": venue_address,
        }

    def _fees(self, start: dt.date, end: dt.date) -> list[tuple[ExpenseEntry, dt.datetime]]:
        fee_type = self._session.scalars(
            select(ExpenseType).where(ExpenseType.key == FEE_TYPE_KEY)
        ).one()
        standard = [
            (row.from_month, row.amount_cents)
            for row in self._session.scalars(select(SecondPhotographerFee))
        ]
        overrides = {
            row.contract_id: row.amount_cents
            for row in self._session.scalars(select(SecondPhotographerOverride))
        }
        contracts = self._session.scalars(
            select(Contract)
            .options(*_LEAN)
            .where(
                Contract.deleted_at.is_(None),
                Contract.photographer_count >= 2,
                Contract.event_date >= start,
                Contract.event_date <= end,
            )
        ).unique()
        result: list[tuple[ExpenseEntry, dt.datetime]] = []
        for contract in contracts:
            month = contract.event_date.strftime("%Y-%m")
            override = overrides.get(contract.id)
            amount = fee_amount(standard, override, month)
            entry = ExpenseEntry(
                id=f"fee:{contract.id}",
                source="second_photographer",
                date=contract.event_date,
                amount_cents=amount or 0,
                missing_amount=amount is None,
                type_id=fee_type.id,
                type_name=fee_type.name,
                type_key=fee_type.key,
                description=None,
                contract_id=contract.id,
                event_kind=_WEDDING,
                groom_name=contract.groom.full_name,
                bride_name=contract.bride.full_name,
                link_state="ok",
                venue_name=contract.venue_name,
                venue_address=contract.venue_address,
                override=override is not None,
            )
            result.append((entry, contract.created_at))
        return result
