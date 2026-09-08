"""Add configuration and analysis metadata to test definitions.

Revision ID: 0004_test_configuration
Revises: 0003_test_definitions
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_test_configuration"
down_revision = "0003_test_definitions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("test_definitions", sa.Column("status", sa.String(20), nullable=False, server_default="draft"))
    op.add_column(
        "test_definitions",
        sa.Column("analysis_profile", sa.String(80), nullable=False, server_default="SCOPE_STEP_RESPONSE_V1"),
    )
    op.add_column("test_definitions", sa.Column("configuration", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    op.drop_column("test_definitions", "configuration")
    op.drop_column("test_definitions", "analysis_profile")
    op.drop_column("test_definitions", "status")
