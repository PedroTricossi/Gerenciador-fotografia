"""Migration 0004 adds instalments and gives every contract a one-instalment plan to review."""

import datetime as dt
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, create_engine, inspect, text

from gerenciador.db.migrate import migration_config
from gerenciador.db.session import database_url
from gerenciador.domain.instalments import month_of


@pytest.fixture
def db(tmp_path: Path) -> Iterator[tuple[Config, Engine]]:
    url = database_url(tmp_path / "migration.db")
    config = migration_config(url)
    command.upgrade(config, "0003")
    engine = create_engine(url)
    yield config, engine
    engine.dispose()


def _seed(
    conn: Connection,
    contract_id: str,
    items: list[int],
    *,
    pix: int | None = None,
    deleted_at: str | None = None,
) -> None:
    stamp = "2026-01-01 10:00:00"
    for role in ("g", "b"):
        conn.execute(
            text(
                "INSERT INTO clients (id, full_name, created_at, updated_at)"
                " VALUES (:id, 'Pessoa', :t, :t)"
            ),
            {"id": f"{contract_id}{role}", "t": stamp},
        )
    conn.execute(
        text(
            "INSERT INTO contracts (id, groom_id, bride_id, event_date, venue_name,"
            " photographer_count, pix_discount_cents, signing_city, signing_date, version,"
            " created_at, updated_at, deleted_at) VALUES (:id, :g, :b, '2027-03-14', 'Igreja',"
            " 2, :pix, 'Curitiba', '2026-10-13', 3, :t, :t, :d)"
        ),
        {
            "id": contract_id,
            "g": f"{contract_id}g",
            "b": f"{contract_id}b",
            "pix": pix,
            "t": stamp,
            "d": deleted_at,
        },
    )
    for position, amount in enumerate(items):
        conn.execute(
            text(
                "INSERT INTO services (id, name, default_price_cents, is_prewedding, version,"
                " created_at, updated_at) VALUES (:id, 'Serviço', 1, 0, 1, :t, :t)"
            ),
            {"id": f"{contract_id}s{position}", "t": stamp},
        )
        conn.execute(
            text(
                "INSERT INTO contract_items (id, contract_id, service_id, position,"
                " description, amount_cents) VALUES (:id, :c, :s, :p, 'Item', :a)"
            ),
            {
                "id": f"{contract_id}i{position}",
                "c": contract_id,
                "s": f"{contract_id}s{position}",
                "p": position,
                "a": amount,
            },
        )


def _upgraded(db: tuple[Config, Engine]) -> Engine:
    config, engine = db
    with engine.begin() as conn:
        _seed(conn, "plain", [100_000, 50_000])
        _seed(conn, "pix", [200_000, 30_000], pix=10_000)
        _seed(conn, "gone", [80_000], deleted_at="2026-02-01 10:00:00")
    command.upgrade(config, "0004")
    return engine


def test_every_contract_gets_one_unpaid_instalment_for_the_total(
    db: tuple[Config, Engine],
) -> None:
    engine = _upgraded(db)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT contract_id, number, month, amount_cents, paid_on FROM instalments"
                " ORDER BY contract_id"
            )
        ).all()
    month = month_of(dt.date.today())
    assert [tuple(r) for r in rows] == [
        ("gone", 1, month, 80_000, None),
        ("pix", 1, month, 220_000, None),
        ("plain", 1, month, 150_000, None),
    ]


def test_contracts_are_flagged_for_review_without_other_changes(
    db: tuple[Config, Engine],
) -> None:
    config, engine = db
    with engine.begin() as conn:
        _seed(conn, "plain", [100_000])
        _seed(conn, "gone", [80_000], deleted_at="2026-02-01 10:00:00")
    with engine.connect() as conn:
        before = conn.execute(text("SELECT id, version, updated_at FROM contracts")).all()
        audit_before = conn.execute(text("SELECT COUNT(*) FROM audit_events")).scalar()
    command.upgrade(config, "0004")
    with engine.connect() as conn:
        after = conn.execute(text("SELECT id, version, updated_at FROM contracts")).all()
        flags = conn.execute(text("SELECT plan_needs_review FROM contracts")).scalars().all()
        audit_after = conn.execute(text("SELECT COUNT(*) FROM audit_events")).scalar()
    assert after == before
    assert [bool(f) for f in flags] == [True, True]
    assert audit_after == audit_before


def test_downgrade_drops_the_table_and_the_column(db: tuple[Config, Engine]) -> None:
    config, engine = db
    _upgraded(db)
    command.downgrade(config, "0003")
    inspector = inspect(engine)
    assert "instalments" not in inspector.get_table_names()
    assert "plan_needs_review" not in {c["name"] for c in inspector.get_columns("contracts")}
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM contracts")).scalar() == 3
