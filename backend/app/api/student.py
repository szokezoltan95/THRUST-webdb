import base64
import hashlib
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, require_authenticated, require_user_csrf
from app.core.config import settings
from app.db.session import get_db
from app.models import AdminUser, Measurement, Participant, ResearchConsent, TestDefinition
from app.schemas.auth import StudentProfileResponse
from app.schemas.measurement import MeasurementCreate, MeasurementResponse
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
        birth_date=participant.birth_date,
        pilot_experience=participant.pilot_experience,
        flight_hours_range=participant.flight_hours_range,
        pilot_certificate=participant.pilot_certificate,
        primary_uav_type=participant.primary_uav_type,
        simulator_experience=participant.simulator_experience,
        self_rated_skill=participant.self_rated_skill,
        sex=participant.sex,
        dominant_hand=participant.dominant_hand,
        vision_correction=participant.vision_correction,
        vision_diopters_left=participant.vision_diopters_left,
        vision_diopters_right=participant.vision_diopters_right,
        rc_experience=participant.rc_experience,
        fpv_experience=participant.fpv_experience,
        game_controller_experience=participant.game_controller_experience,
        video_game_experience=participant.video_game_experience,
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
    revoked_participant_ids = set(
        await db.scalars(
            select(AdminUser.participant_id)
            .join(ResearchConsent, ResearchConsent.user_id == AdminUser.id)
            .where(
                AdminUser.participant_id.is_not(None),
                ResearchConsent.consent_type == "research",
                ResearchConsent.revoked_at.is_not(None),
            )
        )
    )
    cohort_result = await db.scalars(select(Measurement).where(Measurement.status.in_(["completed", "recorded"])))
    cohort = [item for item in cohort_result if item.participant_id not in revoked_participant_ids]
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


@router.post("/measurements", response_model=MeasurementResponse, status_code=201)
async def create_measurement(
    payload: MeasurementCreate,
    auth: AuthContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> Measurement:
    student = require_student(auth).user
    participant = await db.get(Participant, student.participant_id)
    test = await db.get(TestDefinition, payload.test_definition_id)
    if participant is None or not participant.is_active or test is None or not test.is_active:
        raise HTTPException(status_code=404, detail="Aktívny účastník alebo test neexistuje.")
    raw_bytes = None
    raw_sha256 = None
    if payload.raw_log_base64:
        try:
            raw_bytes = base64.b64decode(payload.raw_log_base64, validate=True)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail="Raw log nie je platný Base64 súbor.") from exc
        if not raw_bytes:
            raise HTTPException(status_code=400, detail="Raw log je prázdny.")
        if len(raw_bytes) > settings.max_raw_upload_bytes:
            raise HTTPException(status_code=413, detail="Raw log prekračuje povolenú veľkosť.")
        raw_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    measurement = Measurement(
        participant_id=participant.id, test_definition_id=test.id,
        test_type=f"{test.test_code} v{test.version}", status=payload.status,
        started_at=payload.started_at, source_file_name=payload.source_file_name,
        analysis_data=payload.analysis_data, raw_sha256=raw_sha256,
        raw_size_bytes=len(raw_bytes) if raw_bytes is not None else None,
        raw_content_type=payload.raw_content_type if raw_bytes is not None else None,
    )
    db.add(measurement)
    await db.flush()
    if raw_bytes is not None:
        storage_root = Path(settings.measurement_storage_path).resolve()
        storage_root.mkdir(parents=True, exist_ok=True)
        target = storage_root / f"{measurement.id}.raw"
        target.write_bytes(raw_bytes)
        measurement.raw_storage_path = str(target)
        measurement.raw_data = {"storage": "filesystem", "sha256": raw_sha256}
    await db.commit()
    await db.refresh(measurement)
    return measurement


@router.get("/consents")
async def consent_status(
    auth: AuthContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> dict[str, dict]:
    student = require_student(auth).user
    result = await db.scalars(
        select(ResearchConsent)
        .where(ResearchConsent.user_id == student.id)
        .order_by(ResearchConsent.accepted_at.desc())
    )
    status_by_type: dict[str, dict] = {
        "research": {"accepted": False, "accepted_at": None, "revoked_at": None, "version": None, "text": None},
        "gdpr": {"accepted": False, "accepted_at": None, "revoked_at": None, "version": None, "text": None},
    }
    for consent in result:
        if consent.consent_type not in status_by_type or status_by_type[consent.consent_type]["version"] is not None:
            continue
        status_by_type[consent.consent_type] = {
            "accepted": consent.revoked_at is None,
            "accepted_at": consent.accepted_at,
            "revoked_at": consent.revoked_at,
            "version": consent.version,
            "text": consent.text_snapshot,
        }
    return status_by_type


async def _revoke_consent(auth: AuthContext, db: AsyncSession, consent_type: str) -> None:
    student = require_student(auth).user
    if consent_type not in {"research", "gdpr"}:
        raise HTTPException(status_code=404, detail="Neznámy typ súhlasu.")
    consent = await db.scalar(
        select(ResearchConsent)
        .where(
            ResearchConsent.user_id == student.id,
            ResearchConsent.consent_type == consent_type,
            ResearchConsent.revoked_at.is_(None),
        )
        .order_by(ResearchConsent.accepted_at.desc())
    )
    if consent is not None:
        consent.revoked_at = datetime.now(timezone.utc)
        await db.commit()


@router.post("/consent/{consent_type}/revoke", status_code=204)
async def revoke_consent_type(
    consent_type: str,
    auth: AuthContext = Depends(require_user_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _revoke_consent(auth, db, consent_type)


@router.post("/consent/revoke", status_code=204)
async def revoke_research_consent(
    auth: AuthContext = Depends(require_user_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _revoke_consent(auth, db, "research")
