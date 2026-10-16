import datetime as dt
from collections.abc import Callable

import pytest
from sqlalchemy import update
from sqlalchemy.orm import Session

from gerenciador.db.models import Client, Service
from gerenciador.domain.contract import ContractRuleError
from gerenciador.services.agenda_service import (
    TO_BEFORE_FROM,
    TOO_LONG,
    AgendaEntry,
    AgendaService,
)
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    ItemInput,
)
from gerenciador.services.prewedding_service import PreweddingInput, PreweddingService

MakeInput = Callable[..., ContractInput]
OCT_1 = dt.date(2026, 10, 1)
OCT_31 = dt.date(2026, 10, 31)


@pytest.fixture
def agenda(session: Session) -> AgendaService:
    return AgendaService(session)


@pytest.fixture
def create(
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> Callable[..., str]:
    def _create(
        on: dt.date,
        *,
        at: dt.time | None = dt.time(16, 0),
        prewedding_item: bool = True,
    ) -> str:
        items = [ItemInput(catalog["ceremony"], 120000)]
        if prewedding_item:
            items.append(ItemInput(catalog["prewedding"], 80000))
        return contracts.create(ctx, make_input(event_date=on, coverage_start=at, items=items)).id

    return _create


@pytest.fixture
def schedule(preweddings: PreweddingService, ctx: RequestContext) -> Callable[..., None]:
    def _schedule(contract_id: str, on: dt.date, at: dt.time | None = None) -> None:
        preweddings.schedule(
            ctx, contract_id, None, PreweddingInput(on, "Parque Barigui", None, at)
        )

    return _schedule


def _brief(entries: list[AgendaEntry]) -> list[tuple[str, str]]:
    return [(entry.contract_id, entry.kind) for entry in entries]


def test_entries_in_range_with_both_bounds_included(
    agenda: AgendaService, create: Callable[..., str], schedule: Callable[..., None]
) -> None:
    inside = create(OCT_1)
    schedule(inside, OCT_31)
    outside = create(dt.date(2026, 9, 30))
    schedule(outside, dt.date(2026, 11, 1))

    assert agenda.between(OCT_1, OCT_31) == [
        AgendaEntry(
            inside,
            "wedding",
            OCT_1,
            dt.time(16, 0),
            "Igreja Matriz",
            "João da Silva",
            "Maria Souza",
        ),
        AgendaEntry(
            inside,
            "prewedding",
            OCT_31,
            None,
            "Parque Barigui",
            "João da Silva",
            "Maria Souza",
        ),
    ]


def test_a_deleted_contract_hides_both_entries_until_restored(
    agenda: AgendaService,
    contracts: ContractService,
    ctx: RequestContext,
    create: Callable[..., str],
    schedule: Callable[..., None],
) -> None:
    contract_id = create(dt.date(2026, 10, 10))
    schedule(contract_id, dt.date(2026, 10, 3))

    contracts.delete(ctx, contract_id)
    assert agenda.between(OCT_1, OCT_31) == []

    contracts.restore(ctx, contract_id)
    assert _brief(agenda.between(OCT_1, OCT_31)) == [
        (contract_id, "prewedding"),
        (contract_id, "wedding"),
    ]


def test_an_unscheduled_prewedding_adds_nothing(
    agenda: AgendaService, create: Callable[..., str]
) -> None:
    create(dt.date(2027, 3, 14))
    assert agenda.between(OCT_1, OCT_31) == []


def test_a_schedule_whose_service_was_unmarked_still_appears(
    agenda: AgendaService,
    session: Session,
    catalog: dict[str, str],
    create: Callable[..., str],
    schedule: Callable[..., None],
) -> None:
    contract_id = create(dt.date(2027, 3, 14))
    schedule(contract_id, dt.date(2026, 10, 20))
    session.execute(
        update(Service).where(Service.id == catalog["prewedding"]).values(is_prewedding=False)
    )
    session.commit()

    assert _brief(agenda.between(OCT_1, OCT_31)) == [(contract_id, "prewedding")]


def test_order_is_date_time_kind_then_contract(
    agenda: AgendaService, create: Callable[..., str], schedule: Callable[..., None]
) -> None:
    day = dt.date(2026, 10, 10)
    untimed = create(day, at=None, prewedding_item=False)
    early_prewedding = create(day)
    schedule(early_prewedding, day, dt.time(10, 0))
    same_time = create(day)
    schedule(same_time, day, dt.time(16, 0))

    at_four = [(contract_id, "wedding") for contract_id in sorted([early_prewedding, same_time])]
    assert _brief(agenda.between(day, day)) == [
        (untimed, "wedding"),
        (early_prewedding, "prewedding"),
        *at_four,
        (same_time, "prewedding"),
    ]


def test_an_untimed_wedding_comes_before_an_untimed_prewedding_on_the_same_day(
    agenda: AgendaService, create: Callable[..., str], schedule: Callable[..., None]
) -> None:
    day = dt.date(2026, 10, 10)
    contract_id = create(day, at=None)
    schedule(contract_id, day)

    assert _brief(agenda.between(day, day)) == [
        (contract_id, "wedding"),
        (contract_id, "prewedding"),
    ]


def test_an_anonymised_name_comes_back_as_none(
    agenda: AgendaService, session: Session, create: Callable[..., str]
) -> None:
    create(dt.date(2026, 10, 10))
    session.execute(
        update(Client).where(Client.full_name == "João da Silva").values(full_name=None)
    )
    session.commit()
    session.expire_all()

    [entry] = agenda.between(OCT_1, OCT_31)
    assert (entry.groom_name, entry.bride_name) == (None, "Maria Souza")


def test_range_rules(agenda: AgendaService) -> None:
    assert agenda.between(OCT_1, OCT_1) == []
    assert agenda.between(OCT_1, OCT_1 + dt.timedelta(days=119)) == []

    with pytest.raises(ContractRuleError) as backwards:
        agenda.between(OCT_31, OCT_1)
    assert (backwards.value.field, backwards.value.message) == (
        "query.to",
        TO_BEFORE_FROM,
    )

    with pytest.raises(ContractRuleError) as too_long:
        agenda.between(OCT_1, OCT_1 + dt.timedelta(days=120))
    assert (too_long.value.field, too_long.value.message) == ("query.to", TOO_LONG)
