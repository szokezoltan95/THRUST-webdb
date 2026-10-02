"""Consent withdrawal flags shared by uploads, research views and admin review."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Participant


async def revoked_participant_consents(db: AsyncSession) -> dict[str, dict[str, object]]:
    participants = await db.scalars(select(Participant).where(
        (Participant.research_withdrawn_at.is_not(None)) | (Participant.gdpr_withdrawn_at.is_not(None))))
    flags: dict[str, dict[str, object]] = {}
    for participant in participants:
        revoked = {kind: timestamp for kind, timestamp in
                   (("research", participant.research_withdrawn_at),
                    ("gdpr", participant.gdpr_withdrawn_at)) if timestamp is not None}
        if revoked:
            flags[participant.id] = revoked
    return flags


async def require_active_consents(db: AsyncSession, participant_id: str) -> None:
    if participant_id in await revoked_participant_consents(db):
        raise HTTPException(status_code=409, detail="Účastník odvolal súhlas. Nové meranie je pozastavené do vyriešenia v administrácii.")
