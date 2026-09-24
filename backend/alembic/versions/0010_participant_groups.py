"""Create research participant groups.

Revision ID: 0010_participant_groups
Revises: 0009_participant_demographics
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_participant_groups"
down_revision = "0009_participant_demographics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "participant_groups",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "participant_group_members",
        sa.Column("group_id", sa.String(length=36), sa.ForeignKey("participant_groups.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("participant_id", sa.String(length=36), sa.ForeignKey("participants.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("participant_group_members")
    op.drop_table("participant_groups")
