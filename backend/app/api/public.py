from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.consent_guard import revoked_participant_consents
from app.core.consents import ConsentLanguage, consent_texts
from app.db.session import get_db
from app.models import Measurement, Participant

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/metrics")
async def public_metrics(db: AsyncSession = Depends(get_db)) -> dict:
    excluded = set(await revoked_participant_consents(db))
    participants = await db.scalar(select(func.count()).select_from(Participant).where(Participant.id.not_in(excluded))) or 0
    measurements = await db.scalar(select(func.count()).select_from(Measurement).where(Measurement.participant_id.not_in(excluded))) or 0
    publishable = participants >= settings.public_min_group_size
    return {
        "participant_count": participants if publishable else None,
        "measurement_count": measurements if publishable else None,
        "minimum_group_size": settings.public_min_group_size,
        "publishable": publishable,
    }



@router.get("/consent-texts")
async def public_consent_texts(lang: ConsentLanguage = "sk") -> dict[str, object]:
    return consent_texts(lang)
