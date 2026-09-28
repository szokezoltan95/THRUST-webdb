"""Store theme preferences per WebDB account.

Revision ID: 0011_user_appearance_preferences
Revises: 0010_participant_groups
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_user_appearance_preferences"
down_revision = "0010_participant_groups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "admin_users",
        sa.Column("accent_theme", sa.String(length=20), nullable=False, server_default="blue"),
    )
    op.add_column(
        "admin_users",
        sa.Column("color_mode", sa.String(length=10), nullable=False, server_default="dark"),
    )


def downgrade() -> None:
    op.drop_column("admin_users", "color_mode")
    op.drop_column("admin_users", "accent_theme")
