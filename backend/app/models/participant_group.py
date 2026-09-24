from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


participant_group_members = Table(
    "participant_group_members",
    Base.metadata,
    Column("group_id", String(36), ForeignKey("participant_groups.id", ondelete="CASCADE"), primary_key=True),
    Column("participant_id", String(36), ForeignKey("participants.id", ondelete="CASCADE"), primary_key=True),
    Column("added_at", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)),
)


class ParticipantGroup(Base):
    __tablename__ = "participant_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    members = relationship("Participant", secondary=participant_group_members, lazy="selectin")
