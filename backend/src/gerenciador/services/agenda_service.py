"""The agenda: every wedding and scheduled pre-wedding in a date range."""

import datetime as dt
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, lazyload

from gerenciador.db.models import Contract, PreweddingEvent
from gerenciador.domain.contract import ContractRuleError

MAX_DAYS = 120
TO_BEFORE_FROM = "a data final não pode ser anterior à inicial"
TOO_LONG = "o intervalo máximo é de 120 dias"

Kind = Literal["wedding", "prewedding"]

# Only the couple is needed: skip loading the items and the pre-wedding.
_LEAN = (lazyload(Contract.items), lazyload(Contract.prewedding))


@dataclass(frozen=True)
class AgendaEntry:
    contract_id: str
    kind: Kind
    date: dt.date
    start_time: dt.time | None
    venue_name: str
    groom_name: str | None
    bride_name: str | None


def _entry(
    contract: Contract,
    kind: Kind,
    date: dt.date,
    start_time: dt.time | None,
    venue_name: str,
) -> AgendaEntry:
    return AgendaEntry(
        contract_id=contract.id,
        kind=kind,
        date=date,
        start_time=start_time,
        venue_name=venue_name,
        groom_name=contract.groom.full_name,
        bride_name=contract.bride.full_name,
    )


def _order(entry: AgendaEntry) -> tuple[dt.date, bool, dt.time, bool, str]:
    # Untimed first, then by time; at the same time a wedding before a pre-wedding.
    return (
        entry.date,
        entry.start_time is not None,
        entry.start_time or dt.time.min,
        entry.kind != "wedding",
        entry.contract_id,
    )


class AgendaService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def between(self, start: dt.date, end: dt.date) -> list[AgendaEntry]:
        """Shoots from `start` to `end`, both included, on contracts that are not deleted."""
        if end < start:
            raise ContractRuleError("query.to", TO_BEFORE_FROM)
        if (end - start).days >= MAX_DAYS:
            raise ContractRuleError("query.to", TOO_LONG)
        return sorted(self._weddings(start, end) + self._preweddings(start, end), key=_order)

    def _weddings(self, start: dt.date, end: dt.date) -> list[AgendaEntry]:
        stmt = (
            select(Contract)
            .options(*_LEAN)
            .where(Contract.deleted_at.is_(None), Contract.event_date.between(start, end))
        )
        return [
            _entry(
                contract,
                "wedding",
                contract.event_date,
                contract.coverage_start,
                contract.venue_name,
            )
            for contract in self._session.scalars(stmt)
        ]

    def _preweddings(self, start: dt.date, end: dt.date) -> list[AgendaEntry]:
        stmt = (
            select(PreweddingEvent, Contract)
            .join(Contract, Contract.id == PreweddingEvent.contract_id)
            .options(*_LEAN)
            .where(
                Contract.deleted_at.is_(None),
                PreweddingEvent.event_date.between(start, end),
            )
        )
        return [
            _entry(contract, "prewedding", row.event_date, row.start_time, row.venue_name)
            for row, contract in self._session.execute(stmt)
        ]
