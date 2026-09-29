"""Pending e-mail verification before participant creation.

Revision ID: 0013_pending_registration
Revises: 0012_merge_appearance_and_welcome
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_pending_registration"
down_revision = "0012_merge_heads"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("participants", sa.Column("is_test_account", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "pending_registrations",
        sa.Column("email", sa.String(255), primary_key=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("pending_registrations")
    op.drop_column("participants", "is_test_account")
