from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    participant_code: Mapped[str] = mapped_column(String(5), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    research_withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    gdpr_withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    biological_sex: Mapped[str | None] = mapped_column(String(16), nullable=True)
    dominant_hand: Mapped[str | None] = mapped_column(String(24), nullable=True)
    gamepad_used: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    pc_joystick_used: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    rc_transmitter_used: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    uav_flown: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    uav_los: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    uav_fpv: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    uav_stabilized_mode: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    uav_manual_mode: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
