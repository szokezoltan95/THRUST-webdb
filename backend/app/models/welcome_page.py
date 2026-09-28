from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WelcomePage(Base):
    __tablename__ = "welcome_pages"

    language: Mapped[str] = mapped_column(String(2), primary_key=True)
    draft_blocks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    published_blocks: Mapped[list | None] = mapped_column(JSON, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
