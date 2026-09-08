"""Store raw measurement files outside PostgreSQL.

Revision ID: 0006_raw_file_metadata
Revises: 0005_measurement_metadata
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_raw_file_metadata"
down_revision = "0005_measurement_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("measurements", sa.Column("raw_storage_path", sa.String(500), nullable=True))
    op.add_column("measurements", sa.Column("raw_sha256", sa.String(64), nullable=True))
    op.add_column("measurements", sa.Column("raw_size_bytes", sa.Integer(), nullable=True))
    op.add_column("measurements", sa.Column("raw_content_type", sa.String(100), nullable=True))
    op.create_index("idx_measurements_raw_sha256", "measurements", ["raw_sha256"])


def downgrade() -> None:
    op.drop_index("idx_measurements_raw_sha256", table_name="measurements")
    op.drop_column("measurements", "raw_content_type")
    op.drop_column("measurements", "raw_size_bytes")
    op.drop_column("measurements", "raw_sha256")
    op.drop_column("measurements", "raw_storage_path")
