"""Migration 0006 adds expenses.instalment_count (1-24, default 1)."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from gerenciador.db.migrate import migration_config
from gerenciador.db.session import database_url


@pytest.fixture
def db(tmp_path: Path) -> Iterator[tuple[Config, Engine]]:
    url = database_url(tmp_path / "migration.db")
    config = migration_config(url)
    command.upgrade(config, "0005")
    engine = create_engine(url)
    yield config, engine
    engine.dispose()


def _insert_expense(engine: Engine, expense_id: str, instalment_count: int | None = None) -> None:
    columns = "id, spent_on, amount_cents, type_id, version, created_at, updated_at"
    values = ":id, '2026-01-10', 12000, :type_id, 1, '2026-01-10', '2026-01-10'"
    params: dict[str, object] = {"id": expense_id}
    if instalment_count is not None:
        columns += ", instalment_count"
        values += ", :n"
        params["n"] = instalment_count
    with engine.begin() as conn:
        params["type_id"] = conn.execute(text("SELECT id FROM expense_types LIMIT 1")).scalar_one()
        conn.execute(text(f"INSERT INTO expenses ({columns}) VALUES ({values})"), params)  # noqa: S608


def test_upgrade_gives_existing_expenses_one_instalment(db: tuple[Config, Engine]) -> None:
    config, engine = db
    _insert_expense(engine, "e1")

    command.upgrade(config, "0006")

    with engine.connect() as conn:
        count = conn.execute(text("SELECT instalment_count FROM expenses")).scalar_one()
    assert count == 1


@pytest.mark.parametrize("bad", [0, 25])
def test_count_outside_1_to_24_is_rejected(db: tuple[Config, Engine], bad: int) -> None:
    config, engine = db
    command.upgrade(config, "0006")

    with pytest.raises(IntegrityError):
        _insert_expense(engine, "e2", bad)


def test_downgrade_drops_the_column(db: tuple[Config, Engine]) -> None:
    config, engine = db
    command.upgrade(config, "0006")

    command.downgrade(config, "0005")

    columns = {c["name"] for c in inspect(engine).get_columns("expenses")}
    assert "instalment_count" not in columns
