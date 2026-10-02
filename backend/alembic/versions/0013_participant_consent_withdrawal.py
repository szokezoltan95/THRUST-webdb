"""Preserve withdrawal flags when an account is anonymized.

Revision ID: 0013_consent_withdrawal
Revises: 0012_merge_heads
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_consent_withdrawal"
down_revision = "0012_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("research_withdrawn_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("participants", sa.Column("gdpr_withdrawn_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("""UPDATE participants SET research_withdrawn_at = (
        SELECT MAX(c.revoked_at) FROM admin_users u JOIN research_consents c ON c.user_id = u.id
        WHERE u.participant_id = participants.id AND c.consent_type = 'research' AND c.revoked_at IS NOT NULL
    ), gdpr_withdrawn_at = (
        SELECT MAX(c.revoked_at) FROM admin_users u JOIN research_consents c ON c.user_id = u.id
        WHERE u.participant_id = participants.id AND c.consent_type = 'gdpr' AND c.revoked_at IS NOT NULL
    )""")


def downgrade() -> None:
    op.drop_column("participants", "gdpr_withdrawn_at")
    op.drop_column("participants", "research_withdrawn_at")
