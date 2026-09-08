import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, require_admin
from app.db.session import get_db
from app.models import Measurement, Participant, TestDefinition
from app.schemas.participant import ParticipantCreate, ParticipantResponse
from app.schemas.measurement import MeasurementCreate, MeasurementResponse
from app.schemas.test_definition import TestDefinitionCreate, TestDefinitionResponse

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


@router.get("/tests", response_model=list[TestDefinitionResponse])
async def list_tests(
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[TestDefinition]:
    result = await db.scalars(select(TestDefinition).order_by(TestDefinition.test_code, TestDefinition.version))
    return list(result)


@router.get("/tests/{test_id}/configuration")
async def test_configuration(
    test_id: str,
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a version-pinned test manifest for local THRUST/SCoPE clients."""
    test = await db.get(TestDefinition, test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Typ testu neexistuje.")
    return {
        "schema_version": "test-configuration-v1",
        "test": TestDefinitionResponse.model_validate(test).model_dump(mode="json"),
    }


@router.post("/tests", response_model=TestDefinitionResponse, status_code=status.HTTP_201_CREATED)
async def create_test(
    payload: TestDefinitionCreate,
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TestDefinition:
    existing = await db.scalar(
        select(TestDefinition).where(
            TestDefinition.test_code == payload.test_code,
            TestDefinition.version == payload.version,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Táto verzia testu už existuje.")
    test = TestDefinition(**payload.model_dump())
    db.add(test)
    await db.commit()
    await db.refresh(test)
    return test


@router.get("/participants/{participant_id}")
async def participant_detail(
    participant_id: str,
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    participant = await db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Účastník neexistuje.")
    measurements = await db.scalars(
        select(Measurement).where(Measurement.participant_id == participant_id).order_by(Measurement.started_at.desc())
    )
    return {
        "participant": ParticipantResponse.model_validate(participant).model_dump(mode="json"),
        "measurements": [
            {
                "id": item.id,
                "test_type": item.test_type,
                "status": item.status,
                "started_at": item.started_at,
                "created_at": item.created_at,
            }
            for item in measurements
        ],
    }


@router.post("/measurements", response_model=MeasurementResponse, status_code=status.HTTP_201_CREATED)
async def create_measurement(
    payload: MeasurementCreate,
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Measurement:
    participant = await db.get(Participant, payload.participant_id)
    if participant is None or not participant.is_active:
        raise HTTPException(status_code=404, detail="Aktívny účastník neexistuje.")
    test = await db.get(TestDefinition, payload.test_definition_id)
    if test is None or not test.is_active:
        raise HTTPException(status_code=404, detail="Aktívny typ testu neexistuje.")
    measurement = Measurement(
        participant_id=participant.id,
        test_definition_id=test.id,
        test_type=f"{test.test_code} v{test.version}",
        status=payload.status,
        started_at=payload.started_at,
    )
    db.add(measurement)
    await db.commit()
    await db.refresh(measurement)
    return measurement


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
