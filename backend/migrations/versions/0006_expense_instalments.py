"""expenses: instalment_count

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("expenses") as batch:
        batch.add_column(
            sa.Column("instalment_count", sa.Integer, nullable=False, server_default="1")
        )
        batch.create_check_constraint(
            "ck_expenses_instalment_count_range", "instalment_count BETWEEN 1 AND 24"
        )


def downgrade() -> None:
    with op.batch_alter_table("expenses") as batch:
        batch.drop_constraint("ck_expenses_instalment_count_range", type_="check")
        batch.drop_column("instalment_count")
