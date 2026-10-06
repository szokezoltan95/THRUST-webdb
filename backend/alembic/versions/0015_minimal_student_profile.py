"""Replace detailed participant demographics with a concise profile.

Revision ID: 0015_minimal_student_profile
Revises: 0014_human_model_results
"""
from alembic import op
import sqlalchemy as sa


revision = "0015_minimal_student_profile"
down_revision = "0014_human_model_results"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE admin_users SET first_name = NULL, last_name = NULL "
        "WHERE role = 'student'"
    )
    op.add_column("participants", sa.Column("birth_year", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE participants SET birth_year = EXTRACT(YEAR FROM birth_date)::integer "
        "WHERE birth_date IS NOT NULL"
    )

    for column in (
        "gamepad_used",
        "pc_joystick_used",
        "rc_transmitter_used",
        "uav_flown",
        "uav_los",
        "uav_fpv",
        "uav_stabilized_mode",
        "uav_manual_mode",
    ):
        op.add_column("participants", sa.Column(column, sa.Boolean(), nullable=True))

    for column in (
        "birth_date",
        "pilot_experience",
        "flight_hours_range",
        "pilot_certificate",
        "primary_uav_type",
        "simulator_experience",
        "self_rated_skill",
        "sex",
        "vision_correction",
        "vision_diopters_left",
        "vision_diopters_right",
        "rc_experience",
        "fpv_experience",
        "game_controller_experience",
        "video_game_experience",
    ):
        op.drop_column("participants", column)


def downgrade() -> None:
    op.add_column("participants", sa.Column("birth_date", sa.Date(), nullable=True))
    for column, type_ in (
        ("pilot_experience", sa.String(length=20)),
        ("flight_hours_range", sa.String(length=20)),
        ("pilot_certificate", sa.String(length=20)),
        ("primary_uav_type", sa.String(length=20)),
        ("simulator_experience", sa.String(length=20)),
        ("self_rated_skill", sa.Integer()),
        ("sex", sa.String(length=24)),
        ("vision_correction", sa.String(length=24)),
        ("vision_diopters_left", sa.Float()),
        ("vision_diopters_right", sa.Float()),
        ("rc_experience", sa.String(length=20)),
        ("fpv_experience", sa.String(length=20)),
        ("game_controller_experience", sa.String(length=20)),
        ("video_game_experience", sa.String(length=20)),
    ):
        op.add_column("participants", sa.Column(column, type_, nullable=True))

    for column in (
        "uav_manual_mode",
        "uav_stabilized_mode",
        "uav_fpv",
        "uav_los",
        "uav_flown",
        "rc_transmitter_used",
        "pc_joystick_used",
        "gamepad_used",
        "birth_year",
    ):
        op.drop_column("participants", column)
