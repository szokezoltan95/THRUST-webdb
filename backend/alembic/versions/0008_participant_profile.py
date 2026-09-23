"""Add optional participant age and piloting profile fields.

Revision ID: 0008_participant_profile
Revises: 0007_student_accounts
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_participant_profile"
down_revision = "0007_student_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column("participants", sa.Column("pilot_experience", sa.String(length=20), nullable=True))
    op.add_column("participants", sa.Column("flight_hours_range", sa.String(length=20), nullable=True))
    op.add_column("participants", sa.Column("pilot_certificate", sa.String(length=20), nullable=True))
    op.add_column("participants", sa.Column("primary_uav_type", sa.String(length=20), nullable=True))
    op.add_column("participants", sa.Column("simulator_experience", sa.String(length=20), nullable=True))
    op.add_column("participants", sa.Column("self_rated_skill", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "self_rated_skill")
    op.drop_column("participants", "simulator_experience")
    op.drop_column("participants", "primary_uav_type")
    op.drop_column("participants", "pilot_certificate")
    op.drop_column("participants", "flight_hours_range")
    op.drop_column("participants", "pilot_experience")
    op.drop_column("participants", "birth_date")
