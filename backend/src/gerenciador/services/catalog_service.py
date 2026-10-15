"""Services offered in contracts: list, create, edit, archive and restore."""

import datetime as dt
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import Service
from gerenciador.domain.text import fold
from gerenciador.repositories.service_repository import ServiceRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import (
    ConflictError,
    NotFoundError,
    StaleVersionError,
)

_ENTITY = "service"
_FIELDS = ("name", "default_price_cents", "is_prewedding")


@dataclass(frozen=True)
class ServiceInput:
    name: str
    default_price_cents: int
    is_prewedding: bool


@dataclass(frozen=True)
class ServiceChanges:
    """Fields left as None are not changed."""

    name: str | None = None
    default_price_cents: int | None = None
    is_prewedding: bool | None = None


@dataclass(frozen=True)
class ServiceView:
    id: str
    name: str
    default_price_cents: int
    is_prewedding: bool
    archived_at: dt.datetime | None
    version: int
    created_at: dt.datetime
    updated_at: dt.datetime


def _view(service: Service) -> ServiceView:
    return ServiceView(
        id=service.id,
        name=service.name,
        default_price_cents=service.default_price_cents,
        is_prewedding=service.is_prewedding,
        archived_at=service.archived_at,
        version=service.version,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


class CatalogService:
    def __init__(self, session: Session, audit: AuditService) -> None:
        self._session = session
        self._repo = ServiceRepository(session)
        self._audit = audit

    def list_services(self, *, include_archived: bool) -> list[ServiceView]:
        rows = self._repo.all(include_archived=include_archived)
        return [_view(row) for row in sorted(rows, key=lambda row: (fold(row.name), row.id))]

    def get(self, service_id: str) -> ServiceView:
        return _view(self._require(service_id))

    def create(self, ctx: RequestContext, data: ServiceInput) -> ServiceView:
        self._check_name_free(data.name, except_id=None)
        now = utcnow()
        service = Service(
            id=str(uuid4()),
            name=data.name,
            default_price_cents=data.default_price_cents,
            is_prewedding=data.is_prewedding,
            archived_at=None,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self._repo.add(service)
        self._audit.record(
            ctx,
            "service.created",
            entity_type=_ENTITY,
            entity_id=service.id,
            details={"version": 1},
        )
        self._session.commit()
        return _view(service)

    def update(
        self,
        ctx: RequestContext,
        service_id: str,
        expected_version: int,
        changes: ServiceChanges,
    ) -> ServiceView:
        service = self._require(service_id)
        if service.version != expected_version:
            raise StaleVersionError(_ENTITY)
        changed = [
            field
            for field in _FIELDS
            if getattr(changes, field) is not None
            and getattr(changes, field) != getattr(service, field)
        ]
        if changes.name is not None and "name" in changed and service.archived_at is None:
            self._check_name_free(changes.name, except_id=service.id)
        if changed:
            for field in changed:
                setattr(service, field, getattr(changes, field))
            self._bump(service)
            self._audit.record(
                ctx,
                "service.updated",
                entity_type=_ENTITY,
                entity_id=service.id,
                details={"fields": changed, "version": service.version},
            )
        self._session.commit()
        return _view(service)

    def archive(self, ctx: RequestContext, service_id: str) -> ServiceView:
        service = self._require(service_id)
        if service.archived_at is not None:
            raise ConflictError("service is already archived")
        service.archived_at = utcnow()
        return self._record_state(ctx, service, "service.archived")

    def restore(self, ctx: RequestContext, service_id: str) -> ServiceView:
        service = self._require(service_id)
        if service.archived_at is None:
            raise ConflictError("service is not archived")
        self._check_name_free(service.name, except_id=service.id)
        service.archived_at = None
        return self._record_state(ctx, service, "service.restored")

    def _record_state(self, ctx: RequestContext, service: Service, action: str) -> ServiceView:
        self._bump(service)
        self._audit.record(
            ctx,
            action,
            entity_type=_ENTITY,
            entity_id=service.id,
            details={"version": service.version},
        )
        self._session.commit()
        return _view(service)

    @staticmethod
    def _bump(service: Service) -> None:
        service.version += 1
        service.updated_at = utcnow()

    def _check_name_free(self, name: str, *, except_id: str | None) -> None:
        key = name.casefold()
        for other in self._repo.all(include_archived=False):
            if other.id != except_id and other.name.casefold() == key:
                raise ConflictError("an active service already has this name")

    def _require(self, service_id: str) -> Service:
        service = self._repo.get(service_id)
        if service is None:
            raise NotFoundError(_ENTITY, service_id)
        return service
