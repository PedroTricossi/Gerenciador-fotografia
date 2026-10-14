import datetime as dt
from collections.abc import Callable

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent, Client, Contract
from gerenciador.domain.contract import ContractRuleError
from gerenciador.services.audit_service import AuditService
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.contract_service import (
    ContractInput,
    ContractService,
    ItemInput,
    PersonInput,
)
from gerenciador.services.exceptions import ConflictError, NotFoundError, StaleVersionError

MakeInput = Callable[..., ContractInput]


def _actions(session: Session) -> list[str]:
    return list(session.scalars(select(AuditEvent.action).order_by(AuditEvent.id)))


def _last_event(session: Session) -> AuditEvent:
    event = session.scalars(select(AuditEvent).order_by(AuditEvent.id.desc())).first()
    assert event is not None
    return event


def test_create_stores_the_contract_and_both_clients(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    view = contracts.create(ctx, make_input())
    assert view.version == 1
    assert view.total_cents == 200000
    assert view.groom.full_name == "João da Silva"
    assert view.bride.cpf == "98765432100"
    assert view.couple_address == "Rua das Flores 100"
    assert [item.amount_cents for item in view.items] == [50000, 120000, 60000]
    assert view.deleted_at is None
    assert _actions(session) == ["client.created", "client.created", "contract.created"]
    assert _last_event(session).entity_id == view.id
    assert _last_event(session).details == {"version": 1}
    assert contracts.get(view.id) == view


def test_create_reuses_existing_clients(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    first = contracts.create(ctx, make_input())
    second = contracts.create(ctx, make_input(event_date=dt.date(2028, 1, 1)))
    assert second.groom.id == first.groom.id
    assert len(session.scalars(select(Client)).all()) == 2


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"bride": PersonInput("Maria Souza", "12345678909")}, "bride.cpf"),
        ({"items": []}, "payment.items"),
        ({"pix_discount_cents": 230000}, "payment.pix_discount_cents"),
    ],
)
def test_create_enforces_rules_and_stores_nothing(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    overrides: dict[str, object],
    field: str,
) -> None:
    with pytest.raises(ContractRuleError) as error:
        contracts.create(ctx, make_input(**overrides))
    assert error.value.field == field
    session.rollback()
    assert session.scalars(select(Contract)).all() == []
    assert session.scalars(select(Client)).all() == []
    assert _actions(session) == []


def test_a_failed_audit_write_rolls_back_the_contract(
    contracts: ContractService,
    session: Session,
    ctx: RequestContext,
    make_input: MakeInput,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _fail(*args: object, **kwargs: object) -> None:
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(AuditService, "record", _fail)
    with pytest.raises(RuntimeError):
        contracts.create(ctx, make_input())
    session.rollback()
    assert session.scalars(select(Contract)).all() == []
    assert session.scalars(select(Client)).all() == []


def test_get_missing_contract(contracts: ContractService) -> None:
    with pytest.raises(NotFoundError):
        contracts.get("missing")


def test_update_changes_fields_bumps_version_and_audits_names(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    updated = contracts.update(
        ctx,
        created.id,
        1,
        make_input(venue_name="Catedral", items=[ItemInput("Cobertura completa", 250000)]),
    )
    assert updated.version == 2
    assert updated.venue_name == "Catedral"
    assert [(item.description, item.amount_cents) for item in updated.items] == [
        ("Cobertura completa", 250000)
    ]
    assert updated.total_cents == 220000
    assert updated.updated_at >= created.updated_at
    event = _last_event(session)
    assert event.action == "contract.updated"
    assert event.details == {"fields": ["venue_name", "items"], "version": 2}


def test_update_with_no_changes_keeps_version_and_records_nothing(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    before = _actions(session)
    updated = contracts.update(ctx, created.id, 1, make_input())
    assert updated.version == 1
    assert _actions(session) == before


def test_update_with_a_stale_version_is_refused(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.update(ctx, created.id, 1, make_input(venue_name="Catedral"))
    with pytest.raises(StaleVersionError):
        contracts.update(ctx, created.id, 1, make_input(venue_name="Capela"))
    assert contracts.get(created.id).venue_name == "Catedral"


def test_update_can_point_to_a_different_person(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    updated = contracts.update(
        ctx, created.id, 1, make_input(groom=PersonInput("Pedro Lima", "11144477735"))
    )
    assert updated.groom.id != created.groom.id
    assert updated.groom.full_name == "Pedro Lima"
    assert _last_event(session).details == {"fields": ["groom"], "version": 2}


def test_delete_is_soft_and_idempotent(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    assert contracts.get(created.id).deleted_at is not None
    assert _actions(session)[-1] == "contract.deleted"

    count = len(_actions(session))
    contracts.delete(ctx, created.id)
    assert len(_actions(session)) == count


def test_deleted_contract_cannot_be_edited(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    with pytest.raises(ConflictError):
        contracts.update(ctx, created.id, 1, make_input(venue_name="Catedral"))


def test_restore(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    with pytest.raises(ConflictError):
        contracts.restore(ctx, created.id)
    contracts.delete(ctx, created.id)
    restored = contracts.restore(ctx, created.id)
    assert restored.deleted_at is None
    assert _actions(session)[-1] == "contract.restored"


def test_list_page_hides_deleted_unless_asked(
    contracts: ContractService, ctx: RequestContext, make_input: MakeInput
) -> None:
    first = contracts.create(ctx, make_input())
    second = contracts.create(ctx, make_input(event_date=dt.date(2028, 1, 1)))
    third = contracts.create(ctx, make_input(event_date=dt.date(2029, 1, 1)))
    contracts.delete(ctx, second.id)

    page = contracts.list_page(limit=10, cursor=None, include_deleted=False)
    assert [view.id for view in page.items] == [third.id, first.id]

    everything = contracts.list_page(limit=2, cursor=None, include_deleted=True)
    assert [view.id for view in everything.items] == [third.id, second.id]
    rest = contracts.list_page(limit=2, cursor=everything.next_cursor, include_deleted=True)
    assert [view.id for view in rest.items] == [first.id]
    assert rest.next_cursor is None


def test_anonymise_is_refused_while_a_contract_is_active(
    contracts: ContractService, clients: ClientService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    with pytest.raises(ConflictError, match="active contract"):
        clients.anonymise(ctx, created.groom.id)


def test_restore_is_refused_once_a_client_is_anonymised(
    contracts: ContractService, clients: ClientService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.delete(ctx, created.id)
    clients.anonymise(ctx, created.groom.id)
    with pytest.raises(ConflictError, match="anonymised"):
        contracts.restore(ctx, created.id)
    view = contracts.get(created.id)
    assert view.groom.full_name is None
    assert view.couple_address is None


def test_export_lists_the_clients_contracts(
    contracts: ContractService, clients: ClientService, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    exported = clients.export(ctx, created.bride.id)
    assert [(ref.contract_id, ref.role) for ref in exported.contracts] == [(created.id, "bride")]


def test_update_of_only_the_couple_address_bumps_the_version(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    updated = contracts.update(ctx, created.id, 1, make_input(couple_address="Rua Nova 5"))
    assert updated.version == 2
    assert updated.couple_address == "Rua Nova 5"
    event = _last_event(session)
    assert event.action == "contract.updated"
    assert event.details == {"fields": ["couple_address"], "version": 2}
    with pytest.raises(StaleVersionError):
        contracts.update(ctx, created.id, 1, make_input(couple_address="Rua Outra 9"))


def test_update_of_only_a_name_bumps_the_version_without_logging_the_name(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    updated = contracts.update(
        ctx, created.id, 1, make_input(bride=PersonInput("Maria Souza Lima", "98765432100"))
    )
    assert updated.version == 2
    assert updated.bride.full_name == "Maria Souza Lima"
    event = _last_event(session)
    assert event.details == {"fields": ["bride"], "version": 2}
    assert "Maria" not in str(event.details)


def test_update_reports_client_and_contract_fields_in_order(
    contracts: ContractService, session: Session, ctx: RequestContext, make_input: MakeInput
) -> None:
    created = contracts.create(ctx, make_input())
    contracts.update(
        ctx,
        created.id,
        1,
        make_input(
            groom=PersonInput("João Silva Neto", "12345678909"),
            couple_address="Rua Nova 5",
            venue_name="Catedral",
        ),
    )
    assert _last_event(session).details == {
        "fields": ["groom", "couple_address", "venue_name"],
        "version": 2,
    }
