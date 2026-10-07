"""Support forced password changes and student data requests.

Revision ID: 0018_student_account_management
Revises: 0017_biological_sex
"""
from alembic import op
import sqlalchemy as sa


revision = "0018_student_account_management"
down_revision = "0017_biological_sex"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("must_change_password", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_table(
        "student_data_requests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("request_type", sa.String(length=30), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="received", nullable=False),
        sa.Column("response_note", sa.Text(), nullable=True),
        sa.Column("handled_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["admin_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["handled_by_user_id"], ["admin_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_student_data_requests_user_id", "student_data_requests", ["user_id"] )


def downgrade() -> None:
    op.drop_index("ix_student_data_requests_user_id", table_name="student_data_requests")
    op.drop_table("student_data_requests")
    op.drop_column("admin_users", "must_change_password")
