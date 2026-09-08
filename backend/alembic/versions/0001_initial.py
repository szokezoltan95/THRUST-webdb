"""Initial pseudonymous data and authentication schema."""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("username", name="uq_admin_users_username"),
    )
    op.create_table(
        "participants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("participant_code", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("participant_code", name="uq_participants_code"),
    )
    op.create_table(
        "admin_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("csrf_token", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("idx_admin_sessions_user_id", "admin_sessions", ["user_id"])
    op.create_index("idx_admin_sessions_expires_at", "admin_sessions", ["expires_at"])
    op.create_table(
        "measurements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("participant_id", sa.String(36), sa.ForeignKey("participants.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("test_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("idx_measurements_participant_started", "measurements", ["participant_id", "started_at"])
    op.create_index("idx_measurements_test_type", "measurements", ["test_type"])


def downgrade() -> None:
    op.drop_table("measurements")
    op.drop_table("admin_sessions")
    op.drop_table("participants")
    op.drop_table("admin_users")

