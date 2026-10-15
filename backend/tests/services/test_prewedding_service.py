import datetime as dt
from collections.abc import Callable

import pytest
from sqlalchemy import insert, select, update
from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import AuditEvent, Contract, PreweddingEvent, Service
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    ItemInput,
)
from gerenciador.services.exceptions import (
    ConflictError,
    NotFoundError,
    PreconditionRequiredError,
    StaleVersionError,
)
from gerenciador.services.prewedding_service import PreweddingInput, PreweddingService

MakeInput = Callable[..., ContractInput]
MISSING = "5e7a1c00-0000-4000-8000-0000000000ff"
PARK = PreweddingInput(dt.date(2027, 1, 20), "Parque Barigui", None, dt.time(16, 0))


@pytest.fixture
def contract_id(
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
    catalog: dict[str, str],
) -> str:
    items = [
        ItemInput(catalog["ceremony"], 120000),
        ItemInput(catalog["prewedding"], 80000),
    ]
    return contracts.create(ctx, make_input(items=items)).id


def _events(session: Session) -> list[tuple[str, dict[str, object]]]:
    rows = session.scalars(
        select(AuditEvent).where(AuditEvent.entity_type == "prewedding").order_by(AuditEvent.id)
    )
    return [(row.action, row.details) for row in rows]


def test_schedule_creates_version_1_and_audits_without_values(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    view, created = preweddings.schedule(ctx, contract_id, None, PARK)

    assert created is True
    assert (view.contract_id, view.event_date, view.venue_name) == (
        contract_id,
        dt.date(2027, 1, 20),
        "Parque Barigui",
    )
    assert (view.venue_address, view.start_time, view.version) == (
        None,
        dt.time(16, 0),
        1,
    )
    assert preweddings.get(contract_id) == view
    assert _events(session) == [
        ("prewedding.scheduled", {"version": 1, "contract_id": contract_id})
    ]


def test_changing_needs_the_current_version(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    preweddings.schedule(ctx, contract_id, None, PARK)
    moved = PreweddingInput(dt.date(2027, 1, 20), "Jardim Botânico", "Rua A, 1", dt.time(16, 0))

    with pytest.raises(PreconditionRequiredError):
        preweddings.schedule(ctx, contract_id, None, moved)
    with pytest.raises(StaleVersionError) as stale:
        preweddings.schedule(ctx, contract_id, 9, moved)
    assert stale.value.entity == "prewedding"

    view, created = preweddings.schedule(ctx, contract_id, 1, moved)
    assert (created, view.version, view.venue_name) == (False, 2, "Jardim Botânico")
    assert _events(session)[-1] == (
        "prewedding.updated",
        {"fields": ["venue_name", "venue_address"], "version": 2},
    )


def test_saving_the_same_values_changes_nothing(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    preweddings.schedule(ctx, contract_id, None, PARK)
    view, created = preweddings.schedule(ctx, contract_id, 1, PARK)
    assert (created, view.version) == (False, 1)
    assert [action for action, _ in _events(session)] == ["prewedding.scheduled"]


def test_a_contract_without_a_prewedding_item_is_refused(
    preweddings: PreweddingService,
    contracts: ContractService,
    ctx: RequestContext,
    make_input: MakeInput,
) -> None:
    plain = contracts.create(ctx, make_input())
    with pytest.raises(ConflictError) as error:
        preweddings.schedule(ctx, plain.id, None, PARK)
    assert error.value.message == "este contrato não inclui pré-wedding"


def test_missing_or_deleted_contracts_are_not_found(
    preweddings: PreweddingService,
    contracts: ContractService,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    for call in (
        lambda: preweddings.get(MISSING),
        lambda: preweddings.schedule(ctx, MISSING, None, PARK),
        lambda: preweddings.cancel(ctx, MISSING, 1),
    ):
        with pytest.raises(NotFoundError) as missing:
            call()
        assert str(missing.value) == "contrato não encontrado"

    preweddings.schedule(ctx, contract_id, None, PARK)
    contracts.delete(ctx, contract_id)
    with pytest.raises(NotFoundError) as deleted:
        preweddings.get(contract_id)
    assert str(deleted.value) == "contrato não encontrado"
    with pytest.raises(NotFoundError):
        preweddings.schedule(ctx, contract_id, 1, PARK)


def test_reading_when_nothing_is_scheduled(
    preweddings: PreweddingService, contract_id: str
) -> None:
    with pytest.raises(NotFoundError) as error:
        preweddings.get(contract_id)
    assert str(error.value) == "pré-wedding não agendado"


def test_cancel_checks_the_version_and_allows_a_fresh_schedule(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    with pytest.raises(NotFoundError) as nothing:
        preweddings.cancel(ctx, contract_id, 1)
    assert str(nothing.value) == "pré-wedding não agendado"

    preweddings.schedule(ctx, contract_id, None, PARK)
    with pytest.raises(StaleVersionError):
        preweddings.cancel(ctx, contract_id, 2)
    preweddings.cancel(ctx, contract_id, 1)

    assert session.scalars(select(PreweddingEvent)).all() == []
    assert _events(session)[-1] == ("prewedding.cancelled", {"version": 1})
    view, created = preweddings.schedule(ctx, contract_id, None, PARK)
    assert (created, view.version) == (True, 1)


def test_unmarking_the_service_keeps_the_schedule_but_blocks_changes(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
    catalog: dict[str, str],
) -> None:
    preweddings.schedule(ctx, contract_id, None, PARK)
    session.execute(
        update(Service).where(Service.id == catalog["prewedding"]).values(is_prewedding=False)
    )
    session.commit()

    assert preweddings.get(contract_id).venue_name == "Parque Barigui"
    with pytest.raises(ConflictError):
        preweddings.schedule(ctx, contract_id, 1, PARK)
    preweddings.cancel(ctx, contract_id, 1)


def test_the_contract_version_never_moves(
    preweddings: PreweddingService,
    contracts: ContractService,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    preweddings.schedule(ctx, contract_id, None, PARK)
    moved = PreweddingInput(dt.date(2027, 2, 2), "Jardim Botânico", None, None)
    preweddings.schedule(ctx, contract_id, 1, moved)
    preweddings.cancel(ctx, contract_id, 2)
    assert contracts.get(contract_id).version == 1


def test_a_schedule_that_loses_the_insert_race_asks_for_a_version(
    preweddings: PreweddingService,
    session: Session,
    ctx: RequestContext,
    contract_id: str,
) -> None:
    # Load the contract with no pre-wedding, then insert one behind the ORM's back,
    # as a concurrent request would.
    contract = session.get(Contract, contract_id)
    assert contract is not None
    assert contract.prewedding is None
    now = utcnow()
    session.execute(
        insert(PreweddingEvent).values(
            id="other",
            contract_id=contract_id,
            event_date=dt.date(2027, 2, 1),
            venue_name="Outro",
            version=1,
            created_at=now,
            updated_at=now,
        )
    )
    with pytest.raises(PreconditionRequiredError):
        preweddings.schedule(ctx, contract_id, None, PARK)
