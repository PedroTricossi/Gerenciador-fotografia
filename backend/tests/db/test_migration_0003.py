"""Migration 0003 adds the pre-wedding table and touches no existing data."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, inspect, text

from gerenciador.db.migrate import migration_config
from gerenciador.db.session import database_url


@pytest.fixture
def db(tmp_path: Path) -> Iterator[tuple[Config, Engine]]:
    url = database_url(tmp_path / "migration.db")
    config = migration_config(url)
    command.upgrade(config, "0002")
    engine = create_engine(url)
    with engine.begin() as conn:
        for role in ("g", "b"):
            conn.execute(
                text(
                    "INSERT INTO clients (id, full_name, created_at, updated_at)"
                    " VALUES (:id, 'Pessoa', '2026-01-01 10:00:00', '2026-01-01 10:00:00')"
                ),
                {"id": f"c1{role}"},
            )
        conn.execute(
            text(
                "INSERT INTO contracts (id, groom_id, bride_id, event_date, venue_name,"
                " photographer_count, signing_city, signing_date, version, created_at,"
                " updated_at) VALUES ('c1', 'c1g', 'c1b', '2027-03-14', 'Igreja', 2,"
                " 'Curitiba', '2026-10-13', 1, '2026-01-01 10:00:00', '2026-01-01 10:00:00')"
            )
        )
    yield config, engine
    engine.dispose()


def _contracts(engine: Engine) -> list[tuple[str, int]]:
    with engine.connect() as conn:
        return [tuple(row) for row in conn.execute(text("SELECT id, version FROM contracts"))]


def test_upgrade_adds_an_empty_table_and_keeps_contracts(
    db: tuple[Config, Engine],
) -> None:
    config, engine = db
    command.upgrade(config, "head")

    inspector = inspect(engine)
    assert "prewedding_events" in inspector.get_table_names()
    assert [c["name"] for c in inspector.get_unique_constraints("prewedding_events")] == [
        "uq_prewedding_events_contract_id"
    ]
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM prewedding_events")).scalar() == 0
    assert _contracts(engine) == [("c1", 1)]


def test_downgrade_drops_the_table_and_keeps_contracts(
    db: tuple[Config, Engine],
) -> None:
    config, engine = db
    command.upgrade(config, "head")
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO prewedding_events (id, contract_id, event_date, venue_name,"
                " version, created_at, updated_at) VALUES ('p1', 'c1', '2027-01-20',"
                " 'Parque', 1, '2026-01-02 10:00:00', '2026-01-02 10:00:00')"
            )
        )
    command.downgrade(config, "0002")

    assert "prewedding_events" not in inspect(engine).get_table_names()
    assert _contracts(engine) == [("c1", 1)]
