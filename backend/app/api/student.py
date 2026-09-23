from collections import defaultdict
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, require_authenticated
from app.core.config import settings
from app.db.session import get_db
from app.models import Measurement, Participant, TestDefinition
from app.schemas.auth import StudentProfileResponse
from app.schemas.measurement import MeasurementResponse
from app.schemas.test_definition import TestDefinitionResponse

router = APIRouter(prefix="/student", tags=["student"])


def require_student(auth: AuthContext) -> AuthContext:
    if auth.user.role != "student" or not auth.user.participant_id:
        raise HTTPException(status_code=403, detail="Student access required")
    return auth


@router.get("/profile", response_model=StudentProfileResponse)
async def profile(
    auth: AuthContext = Depends(require_authenticated),
) -> StudentProfileResponse:
    student = require_student(auth).user
    participant = student.participant
    if participant is None or student.first_name is None or student.last_name is None:
        raise HTTPException(status_code=409, detail="Student profile is incomplete.")
    return StudentProfileResponse(
        username=student.username,
        email=student.email,
        role=student.role,
        participant_code=participant.participant_code,
        first_name=student.first_name,
        last_name=student.last_name,
        created_at=participant.created_at,
    )


@router.get("/measurements", response_model=list[MeasurementResponse])
async def measurements(
    auth: AuthContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> list[Measurement]:
    student = require_student(auth).user
    result = await db.scalars(
        select(Measurement)
        .where(Measurement.participant_id == student.participant_id)
        .order_by(Measurement.started_at.desc())
    )
    return list(result)


def numeric_metrics(analysis_data: dict | None) -> dict[str, float]:
    if not isinstance(analysis_data, dict):
        return {}
    source = analysis_data.get("metrics")
    if not isinstance(source, dict):
        source = analysis_data.get("summary")
    if not isinstance(source, dict):
        return {}
    return {key: float(value) for key, value in source.items() if isinstance(value, (int, float))}


@router.get("/comparison")
async def comparison(
    auth: AuthContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> dict:
    student = require_student(auth).user
    own_result = await db.scalars(
        select(Measurement)
        .where(Measurement.participant_id == student.participant_id)
        .order_by(Measurement.started_at.desc())
    )
    own = list(own_result)
    cohort_result = await db.scalars(select(Measurement).where(Measurement.status.in_(["completed", "recorded"])))
    cohort = list(cohort_result)
    eligible = len({item.participant_id for item in cohort}) >= settings.public_min_group_size
    own_values: dict[str, list[float]] = defaultdict(list)
    cohort_values: dict[str, list[float]] = defaultdict(list)
    for item in own:
        for key, value in numeric_metrics(item.analysis_data).items():
            own_values[key].append(value)
    for item in cohort:
        for key, value in numeric_metrics(item.analysis_data).items():
            cohort_values[key].append(value)
    return {
        "available": eligible,
        "minimum_group_size": settings.public_min_group_size,
        "cohort_participant_count": len({item.participant_id for item in cohort}),
        "own_measurement_count": len(own),
        "own_average": {key: mean(values) for key, values in own_values.items()},
        "cohort_average": {key: mean(values) for key, values in cohort_values.items()} if eligible else {},
    }


@router.get("/tests", response_model=list[TestDefinitionResponse])
async def available_tests(
    auth: AuthContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> list[TestDefinition]:
    require_student(auth)
    result = await db.scalars(
        select(TestDefinition)
        .where(TestDefinition.is_active.is_(True))
        .order_by(TestDefinition.test_code, TestDefinition.version)
    )
    return list(result)


@router.get("/tests/{test_id}/configuration")
async def test_configuration(
    test_id: str,
    auth: AuthContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> dict:
    require_student(auth)
    test = await db.get(TestDefinition, test_id)
    if test is None or not test.is_active:
        raise HTTPException(status_code=404, detail="Aktívny test neexistuje.")
    return {
        "schema_version": "test-configuration-v1",
        "test": TestDefinitionResponse.model_validate(test).model_dump(mode="json"),
    }
