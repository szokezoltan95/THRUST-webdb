from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TestDefinition(Base):
    __tablename__ = "test_definitions"
    __table_args__ = (UniqueConstraint("test_code", "version", name="uq_test_definitions_code_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    test_code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(30), nullable=False, default="1.0")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    analysis_profile: Mapped[str] = mapped_column(String(80), nullable=False, default="SCOPE_STEP_RESPONSE_V1")
    configuration: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
