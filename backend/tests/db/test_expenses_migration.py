"""Migration 0005 adds the expense tables and seeds the six expense types."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, inspect, text

from gerenciador.db.migrate import migration_config
from gerenciador.db.session import database_url

TABLES = {
    "expense_types",
    "expenses",
    "fixed_costs",
    "fixed_cost_prices",
    "second_photographer_fees",
    "second_photographer_overrides",
}


@pytest.fixture
def db(tmp_path: Path) -> Iterator[tuple[Config, Engine]]:
    url = database_url(tmp_path / "migration.db")
    config = migration_config(url)
    command.upgrade(config, "0004")
    engine = create_engine(url)
    yield config, engine
    engine.dispose()


def test_upgrade_seeds_the_six_types_in_order(db: tuple[Config, Engine]) -> None:
    config, engine = db
    with engine.connect() as conn:
        audit_before = conn.execute(text("SELECT COUNT(*) FROM audit_events")).scalar_one()

    command.upgrade(config, "0005")

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT name, key, version, archived_at FROM expense_types"
                " ORDER BY created_at, rowid"
            )
        ).all()
        audit_after = conn.execute(text("SELECT COUNT(*) FROM audit_events")).scalar_one()
    assert [(r.name, r.key) for r in rows] == [
        ("Transporte", "transport"),
        ("Equipamento", None),
        ("Café", None),
        ("Assinatura", None),
        ("2º fotógrafo", "second_photographer"),
        ("Outro", None),
    ]
    assert all(r.version == 1 and r.archived_at is None for r in rows)
    assert audit_after == audit_before


def test_downgrade_drops_all_six_tables(db: tuple[Config, Engine]) -> None:
    config, engine = db
    command.upgrade(config, "0005")
    assert set(inspect(engine).get_table_names()) >= TABLES

    command.downgrade(config, "0004")

    assert not TABLES & set(inspect(engine).get_table_names())
