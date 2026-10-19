"""Expense types: list, create, rename, archive and restore."""

import datetime as dt
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import ExpenseType
from gerenciador.domain.contract import ContractRuleError
from gerenciador.domain.text import fold
from gerenciador.repositories.expense_type_repository import ExpenseTypeRepository
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import (
    ConflictError,
    NotFoundError,
    StaleVersionError,
)

_ENTITY = "expense_type"


@dataclass(frozen=True)
class ExpenseTypeView:
    id: str
    name: str
    key: str | None
    archived_at: dt.datetime | None
    version: int
    created_at: dt.datetime
    updated_at: dt.datetime


def _view(expense_type: ExpenseType) -> ExpenseTypeView:
    return ExpenseTypeView(
        id=expense_type.id,
        name=expense_type.name,
        key=expense_type.key,
        archived_at=expense_type.archived_at,
        version=expense_type.version,
        created_at=expense_type.created_at,
        updated_at=expense_type.updated_at,
    )


class ExpenseTypeService:
    def __init__(self, session: Session, audit: AuditService) -> None:
        self._session = session
        self._repo = ExpenseTypeRepository(session)
        self._audit = audit

    def list_types(self, *, include_archived: bool) -> list[ExpenseTypeView]:
        rows = self._repo.all(include_archived=include_archived)
        return [_view(row) for row in sorted(rows, key=lambda row: (fold(row.name), row.id))]

    def get(self, type_id: str) -> ExpenseTypeView:
        return _view(self._require(type_id))

    def require_active(self, type_id: str) -> ExpenseType:
        expense_type = self._repo.get(type_id)
        if expense_type is None or expense_type.archived_at is not None:
            raise ContractRuleError("type_id", "tipo de despesa arquivado ou inexistente")
        return expense_type

    def create(self, ctx: RequestContext, name: str) -> ExpenseTypeView:
        self._check_name_free(name, except_id=None)
        now = utcnow()
        expense_type = ExpenseType(
            id=str(uuid4()),
            name=name,
            key=None,
            archived_at=None,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self._repo.add(expense_type)
        self._audit.record(
            ctx,
            "expense_type.created",
            entity_type=_ENTITY,
            entity_id=expense_type.id,
            details={"version": 1},
        )
        self._session.commit()
        return _view(expense_type)

    def rename(
        self, ctx: RequestContext, type_id: str, expected_version: int, name: str
    ) -> ExpenseTypeView:
        expense_type = self._require(type_id)
        if expense_type.version != expected_version:
            raise StaleVersionError(_ENTITY)
        if name != expense_type.name:
            if expense_type.archived_at is None:
                self._check_name_free(name, except_id=expense_type.id)
            expense_type.name = name
            self._bump(expense_type)
            self._audit.record(
                ctx,
                "expense_type.updated",
                entity_type=_ENTITY,
                entity_id=expense_type.id,
                details={"fields": ["name"], "version": expense_type.version},
            )
        self._session.commit()
        return _view(expense_type)

    def archive(self, ctx: RequestContext, type_id: str) -> ExpenseTypeView:
        expense_type = self._require(type_id)
        if expense_type.key is not None:
            raise ConflictError("this type cannot be archived")
        if expense_type.archived_at is not None:
            raise ConflictError("expense type is already archived")
        expense_type.archived_at = utcnow()
        return self._record_state(ctx, expense_type, "expense_type.archived")

    def restore(self, ctx: RequestContext, type_id: str) -> ExpenseTypeView:
        expense_type = self._require(type_id)
        if expense_type.archived_at is None:
            raise ConflictError("expense type is not archived")
        self._check_name_free(expense_type.name, except_id=expense_type.id)
        expense_type.archived_at = None
        return self._record_state(ctx, expense_type, "expense_type.restored")

    def _record_state(
        self, ctx: RequestContext, expense_type: ExpenseType, action: str
    ) -> ExpenseTypeView:
        self._bump(expense_type)
        self._audit.record(
            ctx,
            action,
            entity_type=_ENTITY,
            entity_id=expense_type.id,
            details={"version": expense_type.version},
        )
        self._session.commit()
        return _view(expense_type)

    @staticmethod
    def _bump(expense_type: ExpenseType) -> None:
        expense_type.version += 1
        expense_type.updated_at = utcnow()

    def _check_name_free(self, name: str, *, except_id: str | None) -> None:
        key = name.casefold()
        for other in self._repo.all(include_archived=False):
            if other.id != except_id and other.name.casefold() == key:
                raise ConflictError("an active expense type already has this name")

    def _require(self, type_id: str) -> ExpenseType:
        expense_type = self._repo.get(type_id)
        if expense_type is None:
            raise NotFoundError(_ENTITY, type_id)
        return expense_type
