from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.auth import utcnow


class SecurityPolicy(Base):
    __tablename__ = "security_policies"

    revision: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    published_by: Mapped[str] = mapped_column(String(36), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class SecurityEvent(Base):
    __tablename__ = "security_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    category: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor_role: Mapped[str] = mapped_column(String(30), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
