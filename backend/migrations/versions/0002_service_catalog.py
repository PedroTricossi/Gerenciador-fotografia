"""service catalog: services table, contract items linked to a service

Revision ID: 0002
Revises: 0001
"""

import datetime as dt
import unicodedata
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _fold(text: str) -> str:
    # Copied, not imported, so this migration never changes when app code does.
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold()


def upgrade() -> None:
    conn = op.get_bind()
    # Checked before any change: SQLite DDL is not rolled back if this fails later.
    repeated = conn.execute(
        sa.text(
            "SELECT contract_id FROM contract_items GROUP BY contract_id, description"
            " HAVING COUNT(*) > 1 ORDER BY contract_id LIMIT 1"
        )
    ).scalar()
    if repeated is not None:
        raise RuntimeError(
            f"contract {repeated} has two items with the same description. Give them"
            " different descriptions, or merge them, and run the migration again."
        )

    op.create_table(
        "services",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("default_price_cents", sa.Integer, nullable=False),
        sa.Column("is_prewedding", sa.Boolean, nullable=False),
        sa.Column("archived_at", sa.DateTime, nullable=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.add_column("contract_items", sa.Column("service_id", sa.String(36), nullable=True))

    rows = conn.execute(
        sa.text(
            "SELECT i.description, i.amount_cents FROM contract_items i"
            " JOIN contracts c ON c.id = i.contract_id"
            " ORDER BY c.created_at DESC, c.id DESC, i.position"
        )
    ).all()
    newest: dict[str, int] = {}
    for description, amount in rows:
        newest.setdefault(description, amount)

    # Raw SQL bypasses SQLAlchemy's DateTime type, so write SQLite's own text format.
    now = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d %H:%M:%S.%f")
    for name, price in newest.items():
        service_id = str(uuid4())
        folded = _fold(name)
        conn.execute(
            sa.text(
                "INSERT INTO services (id, name, default_price_cents, is_prewedding,"
                " archived_at, version, created_at, updated_at)"
                " VALUES (:id, :name, :price, :flag, NULL, 1, :now, :now)"
            ),
            {
                "id": service_id,
                "name": name,
                "price": price,
                "flag": "pre-wedding" in folded,
                "now": now,
            },
        )
        conn.execute(
            sa.text("UPDATE contract_items SET service_id = :id WHERE description = :name"),
            {"id": service_id, "name": name},
        )

    with op.batch_alter_table("contract_items", recreate="always") as batch:
        batch.alter_column("service_id", existing_type=sa.String(36), nullable=False)
        batch.create_foreign_key(
            "fk_contract_items_service_id_services", "services", ["service_id"], ["id"]
        )
        batch.create_unique_constraint("uq_contract_items_service", ["contract_id", "service_id"])


def downgrade() -> None:
    with op.batch_alter_table("contract_items", recreate="always") as batch:
        batch.drop_constraint("uq_contract_items_service", type_="unique")
        batch.drop_column("service_id")
    op.drop_table("services")
