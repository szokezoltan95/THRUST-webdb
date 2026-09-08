import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, require_admin
from app.db.session import get_db
from app.models import Measurement, Participant
from app.schemas.participant import ParticipantCreate, ParticipantResponse

router = APIRouter(prefix="/admin", tags=["administration"])

CODE_ALPHABET = string.ascii_uppercase + string.digits


def generate_participant_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))


@router.get("/participants", response_model=list[ParticipantResponse])
async def list_participants(
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[Participant]:
    result = await db.scalars(select(Participant).order_by(Participant.created_at.desc()))
    return list(result)


@router.post("/participants", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
async def create_participant(
    payload: ParticipantCreate,
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Participant:
    existing = await db.scalar(select(Participant).where(Participant.participant_code == payload.participant_code))
    if existing:
        raise HTTPException(status_code=409, detail="Toto ID už existuje.")
    participant = Participant(participant_code=payload.participant_code)
    db.add(participant)
    await db.commit()
    await db.refresh(participant)
    return participant


@router.get("/participants/generate-code")
async def generate_code(
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    for _ in range(20):
        code = generate_participant_code()
        existing = await db.scalar(select(Participant.id).where(Participant.participant_code == code))
        if existing is None:
            return {"participant_code": code}
    raise HTTPException(status_code=503, detail="Nové ID sa nepodarilo vygenerovať.")


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
