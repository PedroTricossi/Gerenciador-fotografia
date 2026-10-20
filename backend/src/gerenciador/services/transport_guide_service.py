"""The transport price guide: what recorded trips cost, for a distance and a departure time."""

import datetime as dt
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, lazyload

from gerenciador.db.models import Contract, Expense, ExpenseType
from gerenciador.domain.overview import GuideResult, Leg, Trip, group_trips, guide


@dataclass(frozen=True)
class GuideTrip:
    trip: Trip
    groom_name: str | None
    bride_name: str | None
    contract_deleted: bool


@dataclass(frozen=True)
class GuideView:
    trips_total: int
    similar: list[GuideTrip]
    result: GuideResult


class TransportGuideService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def guide(
        self, today: dt.date, distance_tenths: int | None, left_home_at: dt.time | None
    ) -> GuideView:
        rows = self._session.scalars(
            select(Expense)
            .join(ExpenseType, Expense.type_id == ExpenseType.id)
            .where(
                ExpenseType.key == "transport",
                Expense.contract_id.is_not(None),
                Expense.event_kind.is_not(None),
                Expense.spent_on <= today,
            )
        ).unique()
        legs = [
            Leg(
                row.contract_id,
                row.event_kind,
                row.spent_on,
                row.amount_cents,
                row.distance_tenths,
                row.left_home_at,
                row.transport_kind,
            )
            for row in rows
            if row.contract_id is not None and row.event_kind is not None
        ]
        result = guide(group_trips(legs), distance_tenths, left_home_at)

        ids = {trip.contract_id for trip in result.similar}
        contracts = {
            c.id: c
            for c in self._session.scalars(
                select(Contract)
                .where(Contract.id.in_(ids))
                .options(lazyload(Contract.items), lazyload(Contract.prewedding))
            ).unique()
        }
        similar = []
        for trip in result.similar:
            contract = contracts[trip.contract_id]
            deleted = contract.deleted_at is not None
            similar.append(
                GuideTrip(
                    trip,
                    None if deleted else contract.groom.full_name,
                    None if deleted else contract.bride.full_name,
                    deleted,
                )
            )
        return GuideView(result.trips_total, similar, result)
