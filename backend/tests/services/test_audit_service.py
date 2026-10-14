import datetime as dt

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from gerenciador.db.models import AuditEvent
from gerenciador.services.audit_service import AuditService
from gerenciador.services.context import RequestContext
from gerenciador.services.exceptions import InvalidCursorError, NotFoundError
from gerenciador.services.pagination import decode_cursor, encode_cursor


def _count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(AuditEvent)) or 0


def test_record_stores_the_event(
    session: Session, audit: AuditService, ctx: RequestContext
) -> None:
    event = audit.record(
        ctx, "contract.created", entity_type="contract", entity_id="abc", details={"version": 1}
    )
    session.commit()
    stored = audit.get(event.id)
    assert stored.actor == "owner"
    assert stored.action == "contract.created"
    assert stored.entity_type == "contract"
    assert stored.entity_id == "abc"
    assert stored.outcome == "success"
    assert stored.request_id == "test-request"
    assert stored.details == {"version": 1}
    assert stored.occurred_at.tzinfo is dt.UTC


def test_record_does_not_commit(session: Session, audit: AuditService, ctx: RequestContext) -> None:
    audit.record(ctx, "contract.created")
    session.rollback()
    assert _count(session) == 0


def test_get_missing_event(audit: AuditService) -> None:
    with pytest.raises(NotFoundError):
        audit.get(999)


def test_list_page_is_newest_first_and_paginates(
    session: Session, audit: AuditService, ctx: RequestContext
) -> None:
    for index in range(5):
        audit.record(ctx, "contract.created", entity_id=f"e{index}")
    session.commit()

    first = audit.list_page(limit=2, cursor=None)
    assert [event.entity_id for event in first.items] == ["e4", "e3"]
    assert first.next_cursor is not None

    second = audit.list_page(limit=2, cursor=first.next_cursor)
    assert [event.entity_id for event in second.items] == ["e2", "e1"]

    third = audit.list_page(limit=2, cursor=second.next_cursor)
    assert [event.entity_id for event in third.items] == ["e0"]
    assert third.next_cursor is None


def test_list_page_filters(session: Session, audit: AuditService, ctx: RequestContext) -> None:
    audit.record(ctx, "contract.created", entity_id="a")
    audit.record(ctx, "contract.deleted", entity_id="a")
    audit.record(ctx, "contract.created", entity_id="b")
    session.commit()

    by_action = audit.list_page(limit=10, cursor=None, action="contract.created")
    assert [event.entity_id for event in by_action.items] == ["b", "a"]

    by_entity = audit.list_page(limit=10, cursor=None, entity_id="a")
    assert [event.action for event in by_entity.items] == ["contract.deleted", "contract.created"]

    future = dt.datetime.now(dt.UTC) + dt.timedelta(days=1)
    assert audit.list_page(limit=10, cursor=None, occurred_from=future).items == []
    assert len(audit.list_page(limit=10, cursor=None, occurred_to=future).items) == 3


@pytest.mark.parametrize("cursor", ["abc", "1.5", "-", ""])
def test_audit_rejects_malformed_cursor(audit: AuditService, cursor: str) -> None:
    with pytest.raises(InvalidCursorError):
        audit.list_page(limit=10, cursor=cursor)


def test_cursor_round_trip() -> None:
    moment = dt.datetime(2026, 10, 13, 12, 30, 15, 123456, tzinfo=dt.UTC)
    assert decode_cursor(encode_cursor(moment, "row-id")) == (moment, "row-id")


@pytest.mark.parametrize("cursor", ["garbage", "!!!", "YWJj", "MjAyNi0xMC0xM1QxMjowMDowMHxpZA=="])
def test_decode_rejects_malformed_cursor(cursor: str) -> None:
    with pytest.raises(InvalidCursorError):
        decode_cursor(cursor)
