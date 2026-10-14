import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent, Client
from gerenciador.services.client_service import ClientService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import ConflictError, InvalidCursorError, NotFoundError

GROOM_CPF = "12345678909"
BRIDE_CPF = "98765432100"


def _actions(session: Session) -> list[str]:
    return list(session.scalars(select(AuditEvent.action).order_by(AuditEvent.id)))


def _last_details(session: Session) -> dict[str, object]:
    event = session.scalars(select(AuditEvent).order_by(AuditEvent.id.desc())).first()
    assert event is not None
    return event.details


def _create(
    clients: ClientService, session: Session, ctx: RequestContext, cpf: str = GROOM_CPF
) -> str:
    client = clients.upsert_for_contract(
        ctx, full_name="João da Silva", cpf=cpf, address="Rua das Flores 100"
    )
    session.commit()
    return client.id


def test_upsert_creates_a_client_with_encrypted_fields(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    row = session.get(Client, client_id)
    assert row is not None
    assert row.full_name == "João da Silva"
    assert row.cpf_encrypted is not None and GROOM_CPF not in row.cpf_encrypted
    assert row.address_encrypted is not None and "Flores" not in row.address_encrypted
    assert row.cpf_lookup is not None and GROOM_CPF not in row.cpf_lookup

    view = clients.get(client_id)
    assert view.cpf == GROOM_CPF
    assert view.address == "Rua das Flores 100"
    assert _actions(session) == ["client.created"]


def test_upsert_reuses_a_client_with_the_same_cpf_and_updates_it(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    first_id = _create(clients, session, ctx)
    again = clients.upsert_for_contract(
        ctx, full_name="João Silva", cpf=GROOM_CPF, address="Rua Nova 5"
    )
    session.commit()
    assert again.id == first_id
    view = clients.get(first_id)
    assert view.full_name == "João Silva"
    assert view.address == "Rua Nova 5"
    assert _actions(session) == ["client.created", "client.updated"]
    assert _last_details(session) == {"fields": ["full_name", "address"]}


def test_upsert_with_identical_data_records_nothing(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    _create(clients, session, ctx)
    clients.upsert_for_contract(
        ctx, full_name="João da Silva", cpf=GROOM_CPF, address="Rua das Flores 100"
    )
    session.commit()
    assert _actions(session) == ["client.created"]


def test_upsert_does_not_commit(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    clients.upsert_for_contract(ctx, full_name="A", cpf=GROOM_CPF, address="B")
    session.rollback()
    assert session.scalars(select(Client)).all() == []
    assert _actions(session) == []


def test_get_missing_client(clients: ClientService) -> None:
    with pytest.raises(NotFoundError):
        clients.get("missing")


def test_update_changes_fields_and_audits_their_names_only(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    view = clients.update(ctx, client_id, full_name="João Souza", cpf="11144477735")
    assert view.full_name == "João Souza"
    assert view.cpf == "11144477735"
    assert view.address == "Rua das Flores 100"
    assert _last_details(session) == {"fields": ["full_name", "cpf"]}
    assert "Souza" not in str(_last_details(session))


def test_update_to_another_clients_cpf_conflicts(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    first = _create(clients, session, ctx, GROOM_CPF)
    _create(clients, session, ctx, BRIDE_CPF)
    with pytest.raises(ConflictError):
        clients.update(ctx, first, cpf=BRIDE_CPF)


def test_export_returns_the_data_and_is_audited(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    exported = clients.export(ctx, client_id)
    assert exported.client.cpf == GROOM_CPF
    assert exported.contracts == []
    assert exported.exported_at.tzinfo is not None
    assert _actions(session)[-1] == "client.exported"


def test_anonymise_blanks_all_personal_data(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    view = clients.anonymise(ctx, client_id)
    assert view.full_name is None
    assert view.cpf is None
    assert view.address is None
    assert view.anonymised_at is not None

    session.expire_all()
    row = session.get(Client, client_id)
    assert row is not None
    assert (row.full_name, row.cpf_encrypted, row.cpf_lookup, row.address_encrypted) == (
        None,
        None,
        None,
        None,
    )
    assert _actions(session)[-1] == "client.anonymised"


def test_anonymised_client_cannot_be_anonymised_or_updated_again(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    client_id = _create(clients, session, ctx)
    clients.anonymise(ctx, client_id)
    with pytest.raises(ConflictError):
        clients.anonymise(ctx, client_id)
    with pytest.raises(ConflictError):
        clients.update(ctx, client_id, full_name="X")


def test_an_anonymised_cpf_can_be_registered_again_as_a_new_client(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    first = _create(clients, session, ctx)
    clients.anonymise(ctx, first)
    second = _create(clients, session, ctx)
    assert second != first


def test_list_page_paginates_newest_first(
    clients: ClientService, session: Session, ctx: RequestContext
) -> None:
    ids = [_create(clients, session, ctx, cpf) for cpf in (GROOM_CPF, BRIDE_CPF, "11144477735")]
    first = clients.list_page(limit=2, cursor=None)
    assert [view.id for view in first.items] == [ids[2], ids[1]]
    assert first.next_cursor is not None
    second = clients.list_page(limit=2, cursor=first.next_cursor)
    assert [view.id for view in second.items] == [ids[0]]
    assert second.next_cursor is None


def test_list_page_rejects_malformed_cursor(clients: ClientService) -> None:
    with pytest.raises(InvalidCursorError):
        clients.list_page(limit=2, cursor="garbage")
