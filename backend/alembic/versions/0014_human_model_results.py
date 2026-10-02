"""Store accepted human-model revisions independently from raw analyses.

Revision ID: 0014_human_model_results
Revises: 0013_consent_withdrawal
"""
from alembic import op
import sqlalchemy as sa

revision = "0014_human_model_results"
down_revision = "0013_consent_withdrawal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("measurements", sa.Column("compute_quality_status", sa.String(length=20), nullable=False, server_default="unreviewed"))
    op.add_column("measurements", sa.Column("compute_quality_note", sa.String(length=500), nullable=True))
    op.create_table(
        "human_model_results",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("measurement_id", sa.String(length=36), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("source_raw_sha256", sa.String(length=64), nullable=False),
        sa.Column("algorithm_version", sa.String(length=100), nullable=False),
        sa.Column("review_status", sa.String(length=20), nullable=False, server_default="accepted"),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["admin_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["measurement_id"], ["measurements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("measurement_id", "revision", name="uq_human_model_measurement_revision"),
    )
    op.create_index("ix_human_model_results_measurement_id", "human_model_results", ["measurement_id"])


def downgrade() -> None:
    op.drop_index("ix_human_model_results_measurement_id", table_name="human_model_results")
    op.drop_table("human_model_results")
    op.drop_column("measurements", "compute_quality_note")
    op.drop_column("measurements", "compute_quality_status")

