"""Add extensible test definitions.

Revision ID: 0003_test_definitions
Revises: 0002_participant_code_length
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_test_definitions"
down_revision = "0002_participant_code_length"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "test_definitions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("test_code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("version", sa.String(30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("test_code", "version", name="uq_test_definitions_code_version"),
    )


def downgrade() -> None:
    op.drop_table("test_definitions")
