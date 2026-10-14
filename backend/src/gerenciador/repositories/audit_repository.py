"""The only code that reads or writes audit_events. It never updates or deletes."""

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent


class AuditRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, event: AuditEvent) -> None:
        self._session.add(event)
        self._session.flush()

    def get(self, event_id: int) -> AuditEvent | None:
        return self._session.get(AuditEvent, event_id)

    def find_page(
        self,
        *,
        limit: int,
        before_id: int | None,
        action: str | None,
        entity_id: str | None,
        occurred_from: dt.datetime | None,
        occurred_to: dt.datetime | None,
    ) -> list[AuditEvent]:
        stmt = select(AuditEvent)
        if before_id is not None:
            stmt = stmt.where(AuditEvent.id < before_id)
        if action is not None:
            stmt = stmt.where(AuditEvent.action == action)
        if entity_id is not None:
            stmt = stmt.where(AuditEvent.entity_id == entity_id)
        if occurred_from is not None:
            stmt = stmt.where(AuditEvent.occurred_at >= occurred_from)
        if occurred_to is not None:
            stmt = stmt.where(AuditEvent.occurred_at <= occurred_to)
        return list(self._session.scalars(stmt.order_by(AuditEvent.id.desc()).limit(limit)))
