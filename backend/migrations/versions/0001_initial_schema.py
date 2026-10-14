"""initial schema

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

_APPEND_ONLY = "SELECT RAISE(ABORT, 'audit_events is append-only');"


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("full_name", sa.String(200), nullable=True),
        sa.Column("cpf_encrypted", sa.Text, nullable=True),
        sa.Column("cpf_lookup", sa.String(64), nullable=True, unique=True),
        sa.Column("address_encrypted", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("anonymised_at", sa.DateTime, nullable=True),
    )
    op.create_table(
        "contracts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("groom_id", sa.String(36), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("bride_id", sa.String(36), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("event_date", sa.Date, nullable=False),
        sa.Column("venue_name", sa.String(200), nullable=False),
        sa.Column("venue_address", sa.String(300), nullable=True),
        sa.Column("coverage_start", sa.Time, nullable=True),
        sa.Column("coverage_end", sa.Time, nullable=True),
        sa.Column("hours_contracted", sa.Integer, nullable=True),
        sa.Column("photographer_count", sa.Integer, nullable=False),
        sa.Column("pix_discount_cents", sa.Integer, nullable=True),
        sa.Column("signing_city", sa.String(100), nullable=False),
        sa.Column("signing_date", sa.Date, nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
        sa.CheckConstraint("groom_id <> bride_id", name="ck_contracts_distinct_clients"),
    )
    op.create_table(
        "contract_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("contract_id", sa.String(36), sa.ForeignKey("contracts.id"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
    )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("occurred_at", sa.DateTime, nullable=False),
        sa.Column("actor", sa.String(100), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("details", sa.JSON, nullable=False),
    )
    op.execute(
        f"CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events "
        f"BEGIN {_APPEND_ONLY} END;"
    )
    op.execute(
        f"CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events "
        f"BEGIN {_APPEND_ONLY} END;"
    )
    # INSERT OR REPLACE deletes the old row without firing the delete trigger.
    op.execute(
        "CREATE TRIGGER audit_events_no_replace BEFORE INSERT ON audit_events "
        "WHEN EXISTS (SELECT 1 FROM audit_events WHERE id = NEW.id) "
        "BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER audit_events_no_replace")
    op.execute("DROP TRIGGER audit_events_no_delete")
    op.execute("DROP TRIGGER audit_events_no_update")
    op.drop_table("audit_events")
    op.drop_table("contract_items")
    op.drop_table("contracts")
    op.drop_table("clients")
