"""Versioned privacy policy and security audit events.

Revision ID: 0019_security_dashboard
Revises: 0018_student_account_management
"""
from alembic import op
import sqlalchemy as sa

revision = "0019_security_dashboard"
down_revision = "0018_student_account_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("security_policies",
        sa.Column("revision", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("published_by", sa.String(36), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("security_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("actor_id", sa.String(36), nullable=True),
        sa.Column("actor_role", sa.String(30), nullable=False),
        sa.Column("target_id", sa.String(36), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_security_events_category", "security_events", ["category"])
    op.create_index("ix_security_events_created_at", "security_events", ["created_at"])


def downgrade() -> None:
    op.drop_table("security_events")
    op.drop_table("security_policies")
