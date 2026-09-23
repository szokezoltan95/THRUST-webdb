from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    participant_code: Mapped[str] = mapped_column(String(5), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    pilot_experience: Mapped[str | None] = mapped_column(String(20), nullable=True)
    flight_hours_range: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pilot_certificate: Mapped[str | None] = mapped_column(String(20), nullable=True)
    primary_uav_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    simulator_experience: Mapped[str | None] = mapped_column(String(20), nullable=True)
    self_rated_skill: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
