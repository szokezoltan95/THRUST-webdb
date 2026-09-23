"""Add student accounts, participant profiles and research consent.

Revision ID: 0007_student_accounts
Revises: 0006_raw_file_metadata
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_student_accounts"
down_revision = "0006_raw_file_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("admin_users", sa.Column("first_name", sa.String(120), nullable=True))
    op.add_column("admin_users", sa.Column("last_name", sa.String(120), nullable=True))
    op.add_column("admin_users", sa.Column("participant_id", sa.String(36), nullable=True))
    op.create_unique_constraint("uq_admin_users_email", "admin_users", ["email"])
    op.create_unique_constraint("uq_admin_users_participant_id", "admin_users", ["participant_id"])
    op.create_foreign_key(
        "fk_admin_users_participant_id",
        "admin_users",
        "participants",
        ["participant_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "research_consents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("consent_type", sa.String(50), nullable=False),
        sa.Column("version", sa.String(30), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("text_snapshot", sa.Text(), nullable=False),
    )
    op.create_index("idx_research_consents_user_id", "research_consents", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_research_consents_user_id", table_name="research_consents")
    op.drop_table("research_consents")
    op.drop_constraint("fk_admin_users_participant_id", "admin_users", type_="foreignkey")
    op.drop_constraint("uq_admin_users_participant_id", "admin_users", type_="unique")
    op.drop_constraint("uq_admin_users_email", "admin_users", type_="unique")
    op.drop_column("admin_users", "participant_id")
    op.drop_column("admin_users", "last_name")
    op.drop_column("admin_users", "first_name")
    op.drop_column("admin_users", "email")
