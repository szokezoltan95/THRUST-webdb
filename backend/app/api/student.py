import hashlib
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, require_authenticated, require_user_csrf
from app.core.config import settings
from app.core.raw_logs import RawUploadInvalid, RawUploadTooLarge, decode_raw_upload
from app.core.measurement_results import validate_measurement_result
from app.core.consent_guard import require_active_consents, revoked_participant_consents
from app.core.live_updates import publish_measurements_updated
from app.db.session import get_db
from app.models import AdminUser, Measurement, Participant, ResearchConsent, TestDefinition
from app.schemas.auth import StudentProfileResponse
from app.schemas.participant import StudentProfileUpdate
from app.schemas.measurement import MeasurementCreate, MeasurementResponse
from app.schemas.test_definition import TestDefinitionResponse

router = APIRouter(prefix="/student", tags=["student"])


def require_student(auth: AuthContext) -> AuthContext:
    if auth.user.role != "student" or not auth.user.participant_id:
        raise HTTPException(status_code=403, detail="Student access required")
    return auth



def student_profile_response(student: AdminUser, participant: Participant) -> StudentProfileResponse:
    return StudentProfileResponse(
        username=student.username,
        email=student.email,
        role=student.role,
        participant_code=participant.participant_code,
        first_name=student.first_name or "",
        last_name=student.last_name or "",
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


@router.get("/profile", response_model=StudentProfileResponse)
async def profile(
    auth: AuthContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> StudentProfileResponse:
    student = require_student(auth).user
    # The authenticated user is loaded without its optional participant relationship.
    # Resolve it explicitly so async SQLAlchemy does not attempt unsupported lazy I/O.
    participant = await db.get(Participant, student.participant_id)
    if participant is None or student.first_name is None or student.last_name is None:
        raise HTTPException(status_code=409, detail="Student profile is incomplete.")
    return student_profile_response(student, participant)


@router.patch("/profile", response_model=StudentProfileResponse)
async def update_profile(
    payload: StudentProfileUpdate,
    auth: AuthContext = Depends(require_user_csrf),
    db: AsyncSession = Depends(get_db),
) -> StudentProfileResponse:
    student = require_student(auth).user
    participant = await db.get(Participant, student.participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Profil účastníka neexistuje.")

    updates = payload.model_dump(exclude_unset=True)
    if any(updates.get(field) is None for field in ("first_name", "last_name", "email") if field in updates):
        raise HTTPException(status_code=400, detail="Meno, priezvisko a e-mail nesmú byť prázdne.")

    if "email" in updates:
        email = str(payload.email).strip().lower()
        existing = await db.scalar(
            select(AdminUser.id).where(
                ((AdminUser.email == email) | (AdminUser.username == email)),
                AdminUser.id != student.id,
            )
        )
        if existing:
            raise HTTPException(status_code=409, detail="Účet s týmto e-mailom už existuje.")
        student.email = email
        student.username = email
        updates.pop("email")

    for field in ("first_name", "last_name"):
        if field in updates:
            setattr(student, field, updates.pop(field))
    for field, value in updates.items():
        setattr(participant, field, value)

    await db.commit()
    await db.refresh(student)
    await db.refresh(participant)
    return student_profile_response(student, participant)


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
        return {}
    return {
        key: float(value) for key, value in source.items()
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    }


SCOPE_COMPARISON_FIELDS = (
    "reaction_delay_s",
    "rise_time_s",
    "overshoot_pct",
    "settling_time_s",
    "steady_state_error_pct",
    "tracking_rmse",
    "mean_std",
)
SIMPLE_COMPARISON_FIELDS = (
    "simple_mean_target_error_m",
    "simple_median_target_error_m",
    "simple_rms_target_error_m",
    "simple_in_zone_fraction",
    "simple_action_count",
    "simple_reset_count",
    "simple_crash_count",
)
RESPONSE_CURVE_POINTS = 61


def comparison_metrics(analysis_data: dict | None, mode: str) -> dict[str, float]:
    if not isinstance(analysis_data, dict):
        return {}
    values: dict[str, list[float]] = defaultdict(list)
    response = analysis_data.get("normalized_step_response")
    channels = response.get("channels") if isinstance(response, dict) else None
    if isinstance(channels, dict):
        for channel in channels.values():
            channel_metrics = channel.get("metrics") if isinstance(channel, dict) else None
            if not isinstance(channel_metrics, dict):
                continue
            for key in SCOPE_COMPARISON_FIELDS:
                value = channel_metrics.get(key)
                if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                    values[key].append(float(value))
    result = {key: mean(items) for key, items in values.items() if items}
    if mode == "SCOPE":
        return result
    metrics = numeric_metrics(analysis_data)
    for key in SIMPLE_COMPARISON_FIELDS:
        if key not in metrics:
            continue
        display_key = key.removeprefix("simple_")
        value = metrics[key]
        if display_key == "in_zone_fraction":
            display_key = "time_in_zone_pct"
            value *= 100
        result[display_key] = value
    return result

def comparison_response_curve(analysis_data: dict | None) -> list[float] | None:
    if not isinstance(analysis_data, dict):
        return None
    response = analysis_data.get("normalized_step_response")
    channels = response.get("channels") if isinstance(response, dict) else None
    if not isinstance(channels, dict):
        return None
    curves: list[list[float]] = []
    for channel in channels.values():
        raw = channel.get("mean") if isinstance(channel, dict) else None
        if not isinstance(raw, list) or len(raw) < 2:
            continue
        curve = [float(value) for value in raw if isinstance(value, (int, float)) and not isinstance(value, bool)]
        if len(curve) >= 2 and all(math.isfinite(value) for value in curve):
            curves.append(curve)
    if not curves:
        return None
    combined: list[float] = []
    for point in range(RESPONSE_CURVE_POINTS):
        fraction = point / (RESPONSE_CURVE_POINTS - 1)
        at_point: list[float] = []
        for curve in curves:
            position = fraction * (len(curve) - 1)
            lower = math.floor(position)
            upper = min(len(curve) - 1, lower + 1)
            ratio = position - lower
            at_point.append(curve[lower] * (1 - ratio) + curve[upper] * ratio)
        combined.append(mean(at_point))
    return combined


def mean_curves(curves: list[list[float]]) -> list[float] | None:
    if not curves:
        return None
    return [
        mean([curve[index] for curve in curves if index < len(curve)])
        for index in range(RESPONSE_CURVE_POINTS)
    ]


def histogram(values: list[float], own_value: float | None, bin_count: int = 12) -> dict:
    if not values:
        return {"minimum": 0.0, "maximum": 1.0, "counts": [0] * bin_count, "own_value": own_value}
    minimum = min(values)
    maximum = max(values)
    if math.isclose(minimum, maximum):
        padding = max(abs(minimum) * 0.05, 0.5)
        minimum -= padding
        maximum += padding
    width = (maximum - minimum) / bin_count
    counts = [0] * bin_count
    for value in values:
        index = min(bin_count - 1, max(0, int((value - minimum) / width)))
        counts[index] += 1
    return {"minimum": minimum, "maximum": maximum, "counts": counts, "own_value": own_value}


@router.get("/comparison")
async def comparison(
    mode: Literal["SCOPE", "SIMPLE"] = "SCOPE",
    auth: AuthContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> dict:
    student = require_student(auth).user
    profiles = dict((await db.execute(select(TestDefinition.id, TestDefinition.analysis_profile))).all())

    def belongs_to_mode(item: Measurement) -> bool:
        profile = profiles.get(item.test_definition_id, "").upper()
        if profile.startswith(("SIMPLE", "SCOPE")):
            return profile.startswith(mode)
        analysis = item.analysis_data if isinstance(item.analysis_data, dict) else {}
        if str(analysis.get("analysis_type", "")).upper().startswith("SIMPLE"):
            return mode == "SIMPLE"
        return str(item.test_type).upper().startswith("SIMPLE") == (mode == "SIMPLE")

    own_result = await db.scalars(
        select(Measurement)
        .where(Measurement.participant_id == student.participant_id)
        .order_by(Measurement.started_at.desc())
    )
    own = [item for item in own_result if belongs_to_mode(item)]
    revoked_participant_ids = set(await revoked_participant_consents(db))
    cohort_result = await db.scalars(select(Measurement).where(Measurement.status.in_(["completed", "recorded"])))
    cohort = [
        item for item in cohort_result
        if item.participant_id not in revoked_participant_ids and belongs_to_mode(item)
    ]
    cohort_count = len({item.participant_id for item in cohort})
    eligible = cohort_count >= settings.public_min_group_size

    # First average all axes within each measurement, then average that participant's
    # measurements. This gives each axis and each participant equal weight.
    participant_measurements: dict[str, list[dict[str, float]]] = defaultdict(list)
    participant_curves: dict[str, list[list[float]]] = defaultdict(list)
    for item in cohort:
        participant_id = str(item.participant_id)
        metrics = comparison_metrics(item.analysis_data, mode)
        if metrics:
            participant_measurements[participant_id].append(metrics)
        curve = comparison_response_curve(item.analysis_data)
        if curve:
            participant_curves[participant_id].append(curve)

    cohort_values: dict[str, list[float]] = defaultdict(list)
    for rows in participant_measurements.values():
        keys = {key for row in rows for key in row}
        for key in keys:
            values = [row[key] for row in rows if key in row]
            if values:
                cohort_values[key].append(mean(values))

    own_measurements = [comparison_metrics(item.analysis_data, mode) for item in own]
    own_keys = {key for row in own_measurements for key in row}
    own_average = {
        key: mean([row[key] for row in own_measurements if key in row])
        for key in own_keys
        if any(key in row for row in own_measurements)
    }

    metric_cards = []
    for key in sorted(cohort_values):
        distribution = cohort_values[key]
        if not distribution:
            continue
        own_value = own_average.get(key)
        metric_cards.append({
            "key": key,
            "own_value": own_value,
            "cohort_average": mean(distribution) if eligible else None,
            "histogram": histogram(distribution, own_value) if eligible else None,
        })

    own_curves = [
        curve for item in own
        if (curve := comparison_response_curve(item.analysis_data)) is not None
    ]
    own_curve = mean_curves(own_curves)
    cohort_person_curves = [mean_curves(curves) for curves in participant_curves.values()]
    cohort_person_curves = [curve for curve in cohort_person_curves if curve is not None]
    cohort_curve = mean_curves(cohort_person_curves) if eligible else None
    cohort_std = None
    if cohort_curve is not None:
        cohort_std = [
            math.sqrt(mean([(curve[index] - cohort_curve[index]) ** 2 for curve in cohort_person_curves]))
            for index in range(RESPONSE_CURVE_POINTS)
        ]

    return {
        "mode": mode,
        "available": eligible,
        "minimum_group_size": settings.public_min_group_size,
        "cohort_participant_count": cohort_count,
        "own_measurement_count": len(own),
        "metrics": metric_cards if eligible else [],
        "response_curve": (
            {
                "time_fraction": [index / (RESPONSE_CURVE_POINTS - 1) for index in range(RESPONSE_CURVE_POINTS)],
                "own_mean": own_curve,
                "cohort_mean": cohort_curve,
                "cohort_std": cohort_std,
            }
            if eligible and own_curve is not None and cohort_curve is not None
            else None
        ),
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
    if participant is None or not participant.is_active or test is None:
        raise HTTPException(status_code=404, detail="Aktívny účastník alebo test neexistuje.")
    await require_active_consents(db, participant.id)
    try:
        raw_bytes = decode_raw_upload(
            payload.raw_log_base64,
            file_name=payload.source_file_name,
            content_type=payload.raw_content_type,
            max_upload_bytes=settings.max_raw_upload_bytes,
        )
    except RawUploadTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except RawUploadInvalid as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raw_sha256 = hashlib.sha256(raw_bytes).hexdigest() if raw_bytes is not None else None
    if raw_bytes is None:
        raise HTTPException(status_code=422, detail="A compressed raw log is required.")
    validate_measurement_result(payload, test, raw_bytes)
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
        extension = ".tsv.gz" if payload.raw_content_type == "application/gzip" else ".raw"
        target = storage_root / f"{measurement.id}{extension}"
        target.write_bytes(raw_bytes)
        measurement.raw_storage_path = str(target)
        measurement.raw_data = {
            "storage": "filesystem",
            "sha256": raw_sha256,
            "compression": "gzip" if payload.raw_content_type == "application/gzip" else None,
        }
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
        participant = await db.get(Participant, student.participant_id)
        if participant is not None:
            setattr(participant, f"{consent_type}_withdrawn_at", consent.revoked_at)
        await db.commit()
        publish_measurements_updated()


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
