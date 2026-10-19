"""instalments: a payment plan per contract, backfilled with one instalment

Revision ID: 0004
Revises: 0003
"""

import datetime as dt
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "instalments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "contract_id",
            sa.String(36),
            sa.ForeignKey("contracts.id", name="fk_instalments_contract_id_contracts"),
            nullable=False,
        ),
        sa.Column("number", sa.Integer, nullable=False),
        sa.Column("month", sa.String(7), nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("paid_on", sa.Date, nullable=True),
        sa.UniqueConstraint("contract_id", "number", name="uq_instalments_contract_number"),
        sa.CheckConstraint("amount_cents > 0", name="ck_instalments_amount_positive"),
        sa.CheckConstraint("number BETWEEN 1 AND 4", name="ck_instalments_number_range"),
    )
    op.add_column(
        "contracts",
        sa.Column("plan_needs_review", sa.Boolean, nullable=False, server_default=sa.false()),
    )

    # One unpaid instalment per contract (deleted ones included) for the whole total.
    # Neither `version`, `updated_at` nor the audit trail is touched.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT c.id, COALESCE(SUM(i.amount_cents), 0) - COALESCE(c.pix_discount_cents, 0)"
            " FROM contracts c LEFT JOIN contract_items i ON i.contract_id = c.id"
            " GROUP BY c.id, c.pix_discount_cents"
        )
    ).all()
    # Computed inline, not imported: a migration never changes when app code does (see 0002).
    today = dt.date.today()
    month = f"{today.year:04d}-{today.month:02d}"
    for contract_id, total in rows:
        if total <= 0:
            # Cannot satisfy amount_cents > 0 (a contract with no items); it is still flagged
            # for review below, and saving it will require a valid plan.
            continue
        conn.execute(
            sa.text(
                "INSERT INTO instalments (id, contract_id, number, month, amount_cents)"
                " VALUES (:id, :contract_id, 1, :month, :amount)"
            ),
            {
                "id": str(uuid.uuid4()),
                "contract_id": contract_id,
                "month": month,
                "amount": total,
            },
        )
    conn.execute(sa.text("UPDATE contracts SET plan_needs_review = :flag"), {"flag": True})


def downgrade() -> None:
    op.drop_column("contracts", "plan_needs_review")
    op.drop_table("instalments")
