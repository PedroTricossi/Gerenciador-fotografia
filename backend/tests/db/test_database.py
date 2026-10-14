import datetime as dt
import stat
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from gerenciador.clock import utcnow
from gerenciador.config import Settings
from gerenciador.db.migrate import init_database
from gerenciador.db.models import AuditEvent, Base, Client


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def test_migrations_create_all_tables(engine: Engine) -> None:
    tables = set(inspect(engine).get_table_names())
    assert {"clients", "contracts", "contract_items", "audit_events"} <= tables


def test_models_match_migrations(engine: Engine) -> None:
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": False})
        assert compare_metadata(context, Base.metadata) == []


def test_database_file_is_owner_only(engine: Engine, settings: Settings) -> None:
    assert _mode(settings.database_path) == 0o600
    assert _mode(settings.database_path.parent) == 0o700


def test_existing_loose_permissions_are_tightened(tmp_path: Path) -> None:
    path = tmp_path / "existing.db"
    path.touch(mode=0o644)
    init_database(path).dispose()
    assert _mode(path) == 0o600


def test_utcnow_is_timezone_aware() -> None:
    assert utcnow().tzinfo is dt.UTC


def test_timestamps_round_trip_as_utc(session: Session) -> None:
    now = utcnow()
    session.add(Client(id="c1", full_name="A", created_at=now, updated_at=now))
    session.commit()
    session.expire_all()
    loaded = session.get(Client, "c1")
    assert loaded is not None
    assert loaded.created_at == now
    assert loaded.created_at.tzinfo is dt.UTC


def test_naive_datetimes_are_rejected(session: Session) -> None:
    naive = dt.datetime(2026, 1, 1)
    session.add(Client(id="c2", full_name="A", created_at=naive, updated_at=naive))
    with pytest.raises(Exception, match="naive"):
        session.flush()


def test_foreign_keys_are_enforced(session: Session) -> None:
    with pytest.raises(DBAPIError):
        session.execute(
            text(
                "INSERT INTO contract_items (id, contract_id, position, description, amount_cents)"
                " VALUES ('i1', 'missing', 0, 'x', 100)"
            )
        )


def _add_event(session: Session) -> int:
    event = AuditEvent(
        occurred_at=utcnow(),
        actor="owner",
        action="contract.created",
        outcome="success",
        request_id="r1",
        details={},
    )
    session.add(event)
    session.commit()
    return event.id


def test_audit_events_cannot_be_updated(session: Session) -> None:
    event_id = _add_event(session)
    with pytest.raises(DBAPIError, match="append-only"):
        session.execute(
            text("UPDATE audit_events SET actor = 'x' WHERE id = :id"), {"id": event_id}
        )


def test_audit_events_cannot_be_deleted(session: Session) -> None:
    event_id = _add_event(session)
    with pytest.raises(DBAPIError, match="append-only"):
        session.execute(text("DELETE FROM audit_events WHERE id = :id"), {"id": event_id})
