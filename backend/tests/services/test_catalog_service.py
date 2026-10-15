import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent
from gerenciador.services.catalog_service import (
    CatalogService,
    ServiceChanges,
    ServiceInput,
)
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import (
    ConflictError,
    NotFoundError,
    StaleVersionError,
)

MISSING = "5e7a1c00-0000-4000-8000-0000000000ff"


def _events(session: Session) -> list[tuple[str, dict[str, object]]]:
    rows = session.scalars(select(AuditEvent).order_by(AuditEvent.id))
    return [(row.action, row.details) for row in rows]


def _album(catalog_service: CatalogService, ctx: RequestContext, name: str = "Álbum") -> str:
    return catalog_service.create(ctx, ServiceInput(name, 150000, False)).id


def test_create_stores_and_audits_without_values(
    catalog_service: CatalogService, session: Session, ctx: RequestContext
) -> None:
    view = catalog_service.create(ctx, ServiceInput("Ensaio de pré-wedding", 80000, True))
    assert (view.name, view.default_price_cents, view.is_prewedding) == (
        "Ensaio de pré-wedding",
        80000,
        True,
    )
    assert (view.version, view.archived_at) == (1, None)
    assert catalog_service.get(view.id) == view
    assert _events(session) == [("service.created", {"version": 1})]


def test_list_sorts_ignoring_case_and_accents_and_hides_archived(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    for name in ("diária", "Álbum", "Cerimônia", "bolo"):
        catalog_service.create(ctx, ServiceInput(name, 1000, False))
    archived = catalog_service.create(ctx, ServiceInput("Antigo", 1000, False))
    catalog_service.archive(ctx, archived.id)

    assert [s.name for s in catalog_service.list_services(include_archived=False)] == [
        "Álbum",
        "bolo",
        "Cerimônia",
        "diária",
    ]
    assert [s.name for s in catalog_service.list_services(include_archived=True)] == [
        "Álbum",
        "Antigo",
        "bolo",
        "Cerimônia",
        "diária",
    ]


def test_names_collide_ignoring_case(catalog_service: CatalogService, ctx: RequestContext) -> None:
    _album(catalog_service, ctx)
    with pytest.raises(ConflictError):
        catalog_service.create(ctx, ServiceInput("ÁLBUM", 1000, False))
    other = catalog_service.create(ctx, ServiceInput("Moldura", 1000, False))
    with pytest.raises(ConflictError):
        catalog_service.update(ctx, other.id, 1, ServiceChanges(name="álbum"))


def test_update_changes_only_sent_fields_and_audits_their_names(
    catalog_service: CatalogService, session: Session, ctx: RequestContext
) -> None:
    service_id = _album(catalog_service, ctx)
    view = catalog_service.update(
        ctx,
        service_id,
        1,
        ServiceChanges(default_price_cents=175000, is_prewedding=False),
    )
    assert (view.name, view.default_price_cents, view.version) == ("Álbum", 175000, 2)
    assert _events(session)[-1] == (
        "service.updated",
        {"fields": ["default_price_cents"], "version": 2},
    )


def test_update_keeping_its_own_name_is_not_a_conflict(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    service_id = _album(catalog_service, ctx)
    view = catalog_service.update(ctx, service_id, 1, ServiceChanges(name="ÁLBUM"))
    assert view.name == "ÁLBUM"


def test_update_with_nothing_new_keeps_the_version(
    catalog_service: CatalogService, session: Session, ctx: RequestContext
) -> None:
    service_id = _album(catalog_service, ctx)
    view = catalog_service.update(ctx, service_id, 1, ServiceChanges(name="Álbum"))
    assert view.version == 1
    assert [action for action, _ in _events(session)] == ["service.created"]


def test_update_checks_the_version(catalog_service: CatalogService, ctx: RequestContext) -> None:
    service_id = _album(catalog_service, ctx)
    with pytest.raises(StaleVersionError) as error:
        catalog_service.update(ctx, service_id, 7, ServiceChanges(name="Outro"))
    assert error.value.entity == "service"


def test_archive_and_restore_bump_the_version_and_audit(
    catalog_service: CatalogService, session: Session, ctx: RequestContext
) -> None:
    service_id = _album(catalog_service, ctx)
    archived = catalog_service.archive(ctx, service_id)
    assert archived.archived_at is not None and archived.version == 2
    with pytest.raises(ConflictError):
        catalog_service.archive(ctx, service_id)

    restored = catalog_service.restore(ctx, service_id)
    assert restored.archived_at is None and restored.version == 3
    with pytest.raises(ConflictError):
        catalog_service.restore(ctx, service_id)
    assert [e for e in _events(session) if e[0] != "service.created"] == [
        ("service.archived", {"version": 2}),
        ("service.restored", {"version": 3}),
    ]


def test_restore_refuses_a_name_taken_meanwhile(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    old = _album(catalog_service, ctx)
    catalog_service.archive(ctx, old)
    _album(catalog_service, ctx, "álbum")
    with pytest.raises(ConflictError):
        catalog_service.restore(ctx, old)


def test_an_archived_service_can_be_renamed_to_a_taken_name(
    catalog_service: CatalogService, ctx: RequestContext
) -> None:
    _album(catalog_service, ctx)
    other = catalog_service.create(ctx, ServiceInput("Moldura", 1000, False))
    catalog_service.archive(ctx, other.id)
    view = catalog_service.update(ctx, other.id, 2, ServiceChanges(name="Álbum"))
    assert view.name == "Álbum"


@pytest.mark.parametrize("action", ["get", "archive", "restore", "update"])
def test_unknown_id_is_not_found(
    catalog_service: CatalogService, ctx: RequestContext, action: str
) -> None:
    with pytest.raises(NotFoundError):
        if action == "get":
            catalog_service.get(MISSING)
        elif action == "update":
            catalog_service.update(ctx, MISSING, 1, ServiceChanges(name="x"))
        else:
            getattr(catalog_service, action)(ctx, MISSING)
