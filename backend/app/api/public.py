from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models import Measurement, Participant

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/metrics")
async def public_metrics(db: AsyncSession = Depends(get_db)) -> dict:
    participants = await db.scalar(select(func.count()).select_from(Participant)) or 0
    measurements = await db.scalar(select(func.count()).select_from(Measurement)) or 0
    publishable = participants >= settings.public_min_group_size
    return {
        "participant_count": participants if publishable else None,
        "measurement_count": measurements if publishable else None,
        "minimum_group_size": settings.public_min_group_size,
        "publishable": publishable,
    }

