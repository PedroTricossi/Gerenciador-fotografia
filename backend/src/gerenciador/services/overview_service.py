"""The business overview: money in and out for a period, the statement and the months ahead."""

import calendar
import datetime as dt
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, lazyload

from gerenciador.db.models import Contract, Expense, ExpenseType, FixedCost, Instalment
from gerenciador.domain.contract import ContractRuleError
from gerenciador.domain.instalments import Month, month_of
from gerenciador.domain.overview import palette_slots, period_bounds, upcoming_months
from gerenciador.services.expense_entry_service import ExpenseEntry, ExpenseEntryService

_LEAN = (
    lazyload(Contract.items),
    lazyload(Contract.prewedding),
    lazyload(Contract.instalments),
)


@dataclass(frozen=True)
class TypeShare:
    type_id: str
    type_name: str
    palette_slot: int | None
    amount_cents: int


@dataclass(frozen=True)
class StatementIn:
    date: dt.date
    amount_cents: int
    contract_id: str
    number: int
    count: int
    groom_name: str | None
    bride_name: str | None
    contract_deleted: bool


@dataclass(frozen=True)
class StatementOut:
    date: dt.date
    amount_cents: int
    entry: ExpenseEntry


@dataclass(frozen=True)
class UpcomingMonth:
    month: Month
    rest_of_month: bool
    in_cents: int
    out_cents: int
    projected_free_cents: int


@dataclass(frozen=True)
class OverviewView:
    period_start: dt.date
    period_end: dt.date
    not_started: bool
    in_cents: int
    out_cents: int
    by_type: list[TypeShare]
    missing_fee_count: int
    free_today_cents: int
    opening_cents: int
    statement: list[StatementIn | StatementOut]
    upcoming: list[UpcomingMonth]
    late_cents: int


def _month_end(month: Month) -> dt.date:
    year, mon = int(month[:4]), int(month[5:7])
    return dt.date(year, mon, calendar.monthrange(year, mon)[1])


class OverviewService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._entries = ExpenseEntryService(session)

    def overview(
        self, period: Literal["month", "year"], value: str, today: dt.date
    ) -> OverviewView:
        try:
            start, end = period_bounds(period, value)
        except ValueError as exc:
            raise ContractRuleError("value", str(exc)) from exc
        not_started = start > today
        through = min(end, today)

        contracts = {
            c.id: c for c in self._session.scalars(select(Contract).options(*_LEAN)).unique()
        }
        instalments = list(self._session.scalars(select(Instalment)))
        counts: dict[str, int] = defaultdict(int)
        for row in instalments:
            counts[row.contract_id] += 1

        def live(row: Instalment) -> bool:
            return contracts[row.contract_id].deleted_at is None

        paid = [r for r in instalments if r.paid_on is not None and r.paid_on <= today]
        earliest = self._earliest_outflow()
        past = self._entries.entries_between(earliest, today) if earliest else []

        free_today = sum(r.amount_cents for r in paid) - sum(e.amount_cents for e in past)
        before = min(start - dt.timedelta(days=1), today)
        opening = sum(r.amount_cents for r in paid if r.paid_on and r.paid_on <= before) - sum(
            e.amount_cents for e in past if e.date <= before
        )

        in_rows = sorted(
            (r for r in paid if r.paid_on and start <= r.paid_on <= through),
            key=lambda r: (
                r.paid_on,
                contracts[r.contract_id].event_date,
                r.number,
                r.contract_id,
            ),
        )
        out_entries = [e for e in past if start <= e.date <= through]

        statement: list[StatementIn | StatementOut] = []
        for r in in_rows:
            contract = contracts[r.contract_id]
            deleted = contract.deleted_at is not None
            statement.append(
                StatementIn(
                    date=r.paid_on or start,
                    amount_cents=r.amount_cents,
                    contract_id=r.contract_id,
                    number=r.number,
                    count=counts[r.contract_id],
                    groom_name=None if deleted else contract.groom.full_name,
                    bride_name=None if deleted else contract.bride.full_name,
                    contract_deleted=deleted,
                )
            )
        statement.extend(StatementOut(e.date, e.amount_cents, e) for e in out_entries)
        # Stable: money in comes first within a day, money out keeps the entries order.
        statement.sort(key=lambda row: (row.date, isinstance(row, StatementOut)))

        upcoming = self._upcoming(today, free_today, instalments, live)
        current = month_of(today)
        late = sum(
            r.amount_cents
            for r in instalments
            if r.paid_on is None and r.month < current and live(r)
        )
        return OverviewView(
            period_start=start,
            period_end=end,
            not_started=not_started,
            in_cents=sum(r.amount_cents for r in in_rows),
            out_cents=sum(e.amount_cents for e in out_entries),
            by_type=self._by_type(out_entries),
            missing_fee_count=sum(1 for e in out_entries if e.missing_amount),
            free_today_cents=free_today,
            opening_cents=opening,
            statement=statement,
            upcoming=upcoming,
            late_cents=late,
        )

    def _earliest_outflow(self) -> dt.date | None:
        candidates: list[dt.date] = []
        first_expense = self._session.scalar(select(func.min(Expense.spent_on)))
        if first_expense is not None:
            candidates.append(first_expense)
        first_cost = self._session.scalar(select(func.min(FixedCost.start_month)))
        if first_cost is not None:
            candidates.append(dt.date(int(first_cost[:4]), int(first_cost[5:7]), 1))
        first_wedding = self._session.scalar(
            select(func.min(Contract.event_date)).where(
                Contract.deleted_at.is_(None), Contract.photographer_count >= 2
            )
        )
        if first_wedding is not None:
            candidates.append(first_wedding)
        return min(candidates) if candidates else None

    def _by_type(self, entries: list[ExpenseEntry]) -> list[TypeShare]:
        order = self._session.scalars(
            select(ExpenseType.id).order_by(ExpenseType.created_at, ExpenseType.id)
        ).all()
        slots = palette_slots(order)
        totals: dict[str, int] = defaultdict(int)
        names: dict[str, str] = {}
        for e in entries:
            totals[e.type_id] += e.amount_cents
            names[e.type_id] = e.type_name
        shares = [
            TypeShare(type_id, names[type_id], slots.get(type_id), amount)
            for type_id, amount in totals.items()
            if amount > 0
        ]
        return sorted(shares, key=lambda s: (-s.amount_cents, s.type_name))

    def _upcoming(
        self,
        today: dt.date,
        free_today: int,
        instalments: list[Instalment],
        live: Callable[[Instalment], bool],
    ) -> list[UpcomingMonth]:
        current = month_of(today)
        money_in: dict[Month, int] = defaultdict(int)
        for r in instalments:
            if r.paid_on is None:
                if r.month >= current and live(r):
                    money_in[r.month] += r.amount_cents
            elif r.paid_on > today:
                money_in[month_of(r.paid_on)] += r.amount_cents
        last_due = max(money_in, default=None)
        months = [current, *upcoming_months(current, last_due)]
        money_out: dict[Month, int] = defaultdict(int)
        for e in self._entries.entries_between(
            today + dt.timedelta(days=1), _month_end(months[-1])
        ):
            money_out[month_of(e.date)] += e.amount_cents
        rows: list[UpcomingMonth] = []
        free = free_today
        for month in months:
            free += money_in[month] - money_out[month]
            rows.append(
                UpcomingMonth(month, month == current, money_in[month], money_out[month], free)
            )
        return rows
