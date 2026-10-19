"""expenses: types, expenses, fixed costs and second-photographer fees

Revision ID: 0005
Revises: 0004
"""

import datetime as dt
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

# (name, key), in display order.
SEEDED_TYPES = [
    ("Transporte", "transport"),
    ("Equipamento", None),
    ("Café", None),
    ("Assinatura", None),
    ("2º fotógrafo", "second_photographer"),
    ("Outro", None),
]


def upgrade() -> None:
    op.create_table(
        "expense_types",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("key", sa.String(30), nullable=True),
        sa.Column("archived_at", sa.DateTime, nullable=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("key", name="uq_expense_types_key"),
    )
    op.create_table(
        "expenses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("spent_on", sa.Date, nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column(
            "type_id",
            sa.String(36),
            sa.ForeignKey("expense_types.id", name="fk_expenses_type_id_expense_types"),
            nullable=False,
        ),
        sa.Column("description", sa.String(200), nullable=True),
        sa.Column(
            "contract_id",
            sa.String(36),
            sa.ForeignKey("contracts.id", name="fk_expenses_contract_id_contracts"),
            nullable=True,
        ),
        sa.Column("event_kind", sa.String(10), nullable=True),
        sa.Column("transport_kind", sa.String(20), nullable=True),
        sa.Column("left_home_at", sa.Time, nullable=True),
        sa.Column("distance_tenths", sa.Integer, nullable=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.CheckConstraint("amount_cents > 0", name="ck_expenses_amount_positive"),
        sa.CheckConstraint(
            "(contract_id IS NULL) = (event_kind IS NULL)", name="ck_expenses_event_link_paired"
        ),
        sa.CheckConstraint(
            "event_kind IN ('wedding','prewedding')", name="ck_expenses_event_kind_known"
        ),
        sa.CheckConstraint(
            "distance_tenths BETWEEN 1 AND 50000", name="ck_expenses_distance_range"
        ),
    )
    op.create_table(
        "fixed_costs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "type_id",
            sa.String(36),
            sa.ForeignKey("expense_types.id", name="fk_fixed_costs_type_id_expense_types"),
            nullable=False,
        ),
        sa.Column("day_of_month", sa.Integer, nullable=False),
        sa.Column("start_month", sa.String(7), nullable=False),
        sa.Column("end_month", sa.String(7), nullable=True),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.CheckConstraint("day_of_month BETWEEN 1 AND 31", name="ck_fixed_costs_day_range"),
    )
    op.create_table(
        "fixed_cost_prices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "fixed_cost_id",
            sa.String(36),
            sa.ForeignKey("fixed_costs.id", name="fk_fixed_cost_prices_fixed_cost_id_fixed_costs"),
            nullable=False,
        ),
        sa.Column("from_month", sa.String(7), nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.UniqueConstraint("fixed_cost_id", "from_month", name="uq_fixed_cost_prices_cost_month"),
        sa.CheckConstraint("amount_cents > 0", name="ck_fixed_cost_prices_amount_positive"),
    )
    op.create_table(
        "second_photographer_fees",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("from_month", sa.String(7), nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.UniqueConstraint("from_month", name="uq_second_photographer_fees_from_month"),
        sa.CheckConstraint("amount_cents > 0", name="ck_second_photographer_fees_amount_positive"),
    )
    op.create_table(
        "second_photographer_overrides",
        sa.Column(
            "contract_id",
            sa.String(36),
            sa.ForeignKey(
                "contracts.id", name="fk_second_photographer_overrides_contract_id_contracts"
            ),
            primary_key=True,
        ),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.CheckConstraint(
            "amount_cents > 0", name="ck_second_photographer_overrides_amount_positive"
        ),
    )

    # Seeded with fresh UUIDs; created_at is 1 microsecond apart to keep the display order.
    # No audit event is written: these rows are part of the schema, not an action.
    conn = op.get_bind()
    start = dt.datetime.now(dt.UTC).replace(tzinfo=None)
    for position, (name, key) in enumerate(SEEDED_TYPES):
        stamp = start + dt.timedelta(microseconds=position)
        conn.execute(
            sa.text(
                "INSERT INTO expense_types (id, name, key, version, created_at, updated_at)"
                " VALUES (:id, :name, :key, 1, :t, :t)"
            ),
            {"id": str(uuid.uuid4()), "name": name, "key": key, "t": str(stamp)},
        )


def downgrade() -> None:
    op.drop_table("second_photographer_overrides")
    op.drop_table("second_photographer_fees")
    op.drop_table("fixed_cost_prices")
    op.drop_table("fixed_costs")
    op.drop_table("expenses")
    op.drop_table("expense_types")
