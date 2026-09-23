"""Add optional demographic and controller experience fields to participant profiles.

Revision ID: 0009_participant_demographics
Revises: 0008_participant_profile
"""

from alembic import op
import sqlalchemy as sa

revision = "0009_participant_demographics"
down_revision = "0008_participant_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("sex", sa.String(length=24), nullable=True))
    op.add_column("participants", sa.Column("dominant_hand", sa.String(length=24), nullable=True))
    op.add_column("participants", sa.Column("vision_correction", sa.String(length=24), nullable=True))
    op.add_column("participants", sa.Column("vision_diopters_left", sa.Float(), nullable=True))
    op.add_column("participants", sa.Column("vision_diopters_right", sa.Float(), nullable=True))
    op.add_column("participants", sa.Column("rc_experience", sa.String(length=20), nullable=True))
    op.add_column("participants", sa.Column("fpv_experience", sa.String(length=20), nullable=True))
    op.add_column("participants", sa.Column("game_controller_experience", sa.String(length=20), nullable=True))
    op.add_column("participants", sa.Column("video_game_experience", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "video_game_experience")
    op.drop_column("participants", "game_controller_experience")
    op.drop_column("participants", "fpv_experience")
    op.drop_column("participants", "rc_experience")
    op.drop_column("participants", "vision_diopters_right")
    op.drop_column("participants", "vision_diopters_left")
    op.drop_column("participants", "vision_correction")
    op.drop_column("participants", "dominant_hand")
    op.drop_column("participants", "sex")
