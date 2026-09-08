from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, require_admin
from app.db.session import get_db
from app.models import Measurement, Participant

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/overview")
async def overview(
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    participants = await db.scalar(select(func.count()).select_from(Participant)) or 0
    measurements = await db.scalar(select(func.count()).select_from(Measurement)) or 0
    return {
        "username": auth.user.username,
        "role": auth.user.role,
        "participant_count": participants,
        "measurement_count": measurements,
    }

