"""Constrain participant identifiers to five characters.

Revision ID: 0002_participant_code_length
Revises: 0001_initial
"""

from alembic import op

revision = "0002_participant_code_length"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("participants", "participant_code", type_=__import__("sqlalchemy").String(length=5))


def downgrade() -> None:
    op.alter_column("participants", "participant_code", type_=__import__("sqlalchemy").String(length=32))
