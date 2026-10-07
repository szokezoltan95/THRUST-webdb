from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.consent_guard import revoked_participant_consents
from app.core.consents import ConsentLanguage
from app.core.privacy_policy import current_documents, current_policy, RETENTION_LABELS
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
async def public_consent_texts(lang: ConsentLanguage = "sk", db: AsyncSession = Depends(get_db)) -> dict[str, object]:
    return await current_documents(db, lang)


@router.get("/privacy-policy")
async def public_privacy_policy(lang: ConsentLanguage = "sk", db: AsyncSession = Depends(get_db)) -> dict:
    revision, content = await current_policy(db)
    return {"revision": revision, "controller_name": content["controller_name"],
            "controller_address": content["controller_address"], "controller_email": content["controller_email"],
            "dpo_contact": content["dpo_contact"], "purposes": content["purposes"][lang],
            "recipients": content["recipients"][lang],
            "retention": [{"key": key, "label": labels[int(lang == "en")], "period": content["retention"][key][lang]} for key, labels in RETENTION_LABELS.items()]}
