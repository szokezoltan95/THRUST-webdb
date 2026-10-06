"""Add an optional nickname for the student portal greeting.

Revision ID: 0016_student_nickname
Revises: 0015_minimal_student_profile
"""
from alembic import op
import sqlalchemy as sa


revision = "0016_student_nickname"
down_revision = "0015_minimal_student_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("nickname", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("admin_users", "nickname")
