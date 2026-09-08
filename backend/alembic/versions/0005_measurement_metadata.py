"""Link measurements to test definitions and reserve result payloads.

Revision ID: 0005_measurement_metadata
Revises: 0004_test_configuration
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_measurement_metadata"
down_revision = "0004_test_configuration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("measurements", sa.Column("test_definition_id", sa.String(36), nullable=True))
    op.add_column("measurements", sa.Column("source_file_name", sa.String(255), nullable=True))
    op.add_column("measurements", sa.Column("raw_data", sa.JSON(), nullable=True))
    op.add_column("measurements", sa.Column("analysis_data", sa.JSON(), nullable=True))
    op.create_foreign_key(
        "fk_measurements_test_definition_id",
        "measurements",
        "test_definitions",
        ["test_definition_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("idx_measurements_test_definition", "measurements", ["test_definition_id"])


def downgrade() -> None:
    op.drop_index("idx_measurements_test_definition", table_name="measurements")
    op.drop_constraint("fk_measurements_test_definition_id", "measurements", type_="foreignkey")
    op.drop_column("measurements", "analysis_data")
    op.drop_column("measurements", "raw_data")
    op.drop_column("measurements", "source_file_name")
    op.drop_column("measurements", "test_definition_id")
