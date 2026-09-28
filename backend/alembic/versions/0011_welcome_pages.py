"""Store editable welcome page drafts and published content.

Revision ID: 0011_welcome_pages
Revises: 0010_participant_groups
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_welcome_pages"
down_revision = "0010_participant_groups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "welcome_pages",
        sa.Column("language", sa.String(length=2), primary_key=True),
        sa.Column("draft_blocks", sa.JSON(), nullable=False),
        sa.Column("published_blocks", sa.JSON(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("welcome_pages")
