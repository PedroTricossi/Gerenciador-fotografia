"""Read-only access to the audit trail."""

from typing import Annotated

from fastapi import APIRouter, Path, Query

from gerenciador.api.deps import Audit, Limit
from gerenciador.api.v1.schemas import AuditEventOut, PageOut, UtcDatetime

router = APIRouter(prefix="/audit-events", tags=["audit"])

# Largest integer SQLite can bind; anything beyond it cannot be an event id.
EventId = Annotated[int, Path(ge=1, le=2**63 - 1)]


@router.get("")
def list_audit_events(
    service: Audit,
    limit: Limit = 20,
    cursor: str | None = None,
    action: str | None = None,
    entity_id: str | None = None,
    occurred_from: Annotated[UtcDatetime | None, Query(alias="from")] = None,
    occurred_to: Annotated[UtcDatetime | None, Query(alias="to")] = None,
) -> PageOut[AuditEventOut]:
    page = service.list_page(
        limit=limit,
        cursor=cursor,
        action=action,
        entity_id=entity_id,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
    )
    return PageOut(
        items=[AuditEventOut.from_event(event) for event in page.items],
        next_cursor=page.next_cursor,
    )


@router.get("/{event_id}")
def get_audit_event(event_id: EventId, service: Audit) -> AuditEventOut:
    return AuditEventOut.from_event(service.get(event_id))
