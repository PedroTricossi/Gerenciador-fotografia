"""Records one audit event per action, inside the caller's transaction."""

import datetime as dt
from typing import Any

from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.db.models import AuditEvent
from gerenciador.repositories.audit_repository import AuditRepository
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import InvalidCursorError, NotFoundError
from gerenciador.services.pagination import Page

_MAX_ID = 2**63 - 1  # largest integer SQLite can bind


class AuditService:
    def __init__(self, session: Session) -> None:
        self._repo = AuditRepository(session)

    def record(
        self,
        ctx: RequestContext,
        action: str,
        *,
        entity_type: str | None = None,
        entity_id: str | None = None,
        outcome: str = "success",
        details: dict[str, Any] | None = None,
    ) -> AuditEvent:
        """Add the event to the current transaction. The caller commits.

        `details` must never contain personal values.
        """
        event = AuditEvent(
            occurred_at=utcnow(),
            actor=ctx.actor,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            outcome=outcome,
            request_id=ctx.request_id,
            details=details or {},
        )
        self._repo.add(event)
        return event

    def get(self, event_id: int) -> AuditEvent:
        event = self._repo.get(event_id)
        if event is None:
            raise NotFoundError("audit event", str(event_id))
        return event

    def list_page(
        self,
        *,
        limit: int,
        cursor: str | None,
        action: str | None = None,
        entity_id: str | None = None,
        occurred_from: dt.datetime | None = None,
        occurred_to: dt.datetime | None = None,
    ) -> Page[AuditEvent]:
        before_id: int | None = None
        if cursor is not None:
            if not (cursor.isascii() and cursor.isdecimal()):
                raise InvalidCursorError
            before_id = int(cursor)
            if before_id > _MAX_ID:
                raise InvalidCursorError
        rows = self._repo.find_page(
            limit=limit + 1,
            before_id=before_id,
            action=action,
            entity_id=entity_id,
            occurred_from=occurred_from,
            occurred_to=occurred_to,
        )
        next_cursor = str(rows[limit - 1].id) if len(rows) > limit else None
        return Page(items=rows[:limit], next_cursor=next_cursor)
