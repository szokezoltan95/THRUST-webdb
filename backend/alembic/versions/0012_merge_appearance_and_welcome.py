"""Merge the parallel appearance preference and welcome page migrations.

Revision ID: 0012_merge_appearance_and_welcome
Revises: 0011_user_appearance_preferences, 0011_welcome_pages
"""

revision = "0012_merge_appearance_and_welcome"
down_revision = ("0011_user_appearance_preferences", "0011_welcome_pages")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Both parent migrations contain their own schema changes. This revision
    # only joins their history into a single Alembic head.
    pass


def downgrade() -> None:
    # The parent revisions own all schema changes; no operation is needed here.
    pass
