"""Store optional biological sex for participant comparisons.

Revision ID: 0017_biological_sex
Revises: 0016_student_nickname
"""
from alembic import op
import sqlalchemy as sa


revision = "0017_biological_sex"
down_revision = "0016_student_nickname"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("biological_sex", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "biological_sex")
