"""Migration 0002 turns existing free-text items into catalog services."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, create_engine, inspect, text

from gerenciador.db.migrate import migration_config
from gerenciador.db.session import database_url


@pytest.fixture
def db(tmp_path: Path) -> Iterator[tuple[Config, Engine]]:
    url = database_url(tmp_path / "migration.db")
    config = migration_config(url)
    command.upgrade(config, "0001")
    engine = create_engine(url)
    yield config, engine
    engine.dispose()


def _seed(
    conn: Connection,
    contract_id: str,
    created_at: str,
    items: list[tuple[str, int]],
    *,
    deleted_at: str | None = None,
) -> None:
    for role in ("g", "b"):
        conn.execute(
            text(
                "INSERT INTO clients (id, full_name, created_at, updated_at)"
                " VALUES (:id, 'Pessoa', :t, :t)"
            ),
            {"id": f"{contract_id}{role}", "t": created_at},
        )
    conn.execute(
        text(
            "INSERT INTO contracts (id, groom_id, bride_id, event_date, venue_name,"
            " photographer_count, signing_city, signing_date, version, created_at,"
            " updated_at, deleted_at) VALUES (:id, :g, :b, '2027-03-14', 'Igreja', 2,"
            " 'Curitiba', '2026-10-13', 1, :t, :t, :d)"
        ),
        {
            "id": contract_id,
            "g": f"{contract_id}g",
            "b": f"{contract_id}b",
            "t": created_at,
            "d": deleted_at,
        },
    )
    for position, (description, amount) in enumerate(items):
        conn.execute(
            text(
                "INSERT INTO contract_items (id, contract_id, position, description,"
                " amount_cents) VALUES (:id, :c, :p, :d, :a)"
            ),
            {
                "id": f"{contract_id}i{position}",
                "c": contract_id,
                "p": position,
                "d": description,
                "a": amount,
            },
        )


def _services(engine: Engine) -> dict[str, tuple[int, bool, int, object]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT name, default_price_cents, is_prewedding, version, archived_at"
                " FROM services"
            )
        ).all()
    return {
        name: (price, bool(flag), version, archived)
        for name, price, flag, version, archived in rows
    }


def test_one_service_per_description_with_newest_amount(
    db: tuple[Config, Engine],
) -> None:
    config, engine = db
    with engine.begin() as conn:
        _seed(
            conn,
            "c1",
            "2026-01-01 10:00:00",
            [("Cerimônia", 100000), ("Ensaio de Pré-Wedding", 40000)],
        )
        _seed(
            conn,
            "c2",
            "2026-06-01 10:00:00",
            [("Cerimônia", 120000)],
            deleted_at="2026-07-01 10:00:00",
        )
    command.upgrade(config, "head")

    assert _services(engine) == {
        "Cerimônia": (120000, False, 1, None),
        "Ensaio de Pré-Wedding": (40000, True, 1, None),
    }
    with engine.connect() as conn:
        linked = conn.execute(
            text(
                "SELECT i.description, s.name FROM contract_items i"
                " JOIN services s ON s.id = i.service_id"
            )
        ).all()
    assert len(linked) == 3
    assert all(description == name for description, name in linked)


def test_prewedding_guess_ignores_case_and_accents(db: tuple[Config, Engine]) -> None:
    config, engine = db
    with engine.begin() as conn:
        _seed(
            conn,
            "c1",
            "2026-01-01 10:00:00",
            [("PRE-WEDDING curto", 1), ("pré-wedding", 2), ("Casamento", 3)],
        )
    command.upgrade(config, "head")
    flags = {name: flag for name, (_, flag, _, _) in _services(engine).items()}
    assert flags == {"PRE-WEDDING curto": True, "pré-wedding": True, "Casamento": False}


def test_empty_database_gets_an_empty_catalog(db: tuple[Config, Engine]) -> None:
    config, engine = db
    command.upgrade(config, "head")
    assert _services(engine) == {}


def test_repeated_description_stops_and_names_the_contract(
    db: tuple[Config, Engine],
) -> None:
    config, engine = db
    with engine.begin() as conn:
        _seed(conn, "c1", "2026-01-01 10:00:00", [("Cerimônia", 1), ("Cerimônia", 2)])
    with pytest.raises(RuntimeError, match="c1"):
        command.upgrade(config, "head")
    assert "services" not in inspect(engine).get_table_names()


def test_downgrade_keeps_items_intact(db: tuple[Config, Engine]) -> None:
    config, engine = db
    with engine.begin() as conn:
        _seed(conn, "c1", "2026-01-01 10:00:00", [("Cerimônia", 100000)])
    command.upgrade(config, "head")
    command.downgrade(config, "0001")

    inspector = inspect(engine)
    assert "services" not in inspector.get_table_names()
    assert "service_id" not in {c["name"] for c in inspector.get_columns("contract_items")}
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT description, amount_cents FROM contract_items")).all()
    assert [tuple(row) for row in rows] == [("Cerimônia", 100000)]
