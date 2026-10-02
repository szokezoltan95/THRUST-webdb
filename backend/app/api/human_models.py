from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, effective_role, require_researcher, require_researcher_csrf
from app.core.consent_guard import revoked_participant_consents
from app.core.live_updates import publish_measurements_updated
from app.db.session import get_db
from app.models import HumanModelResult, Measurement
from app.schemas.human_model_result import ComputeQualityUpdate, HumanModelUpload

router = APIRouter(prefix="/admin", tags=["human-model-results"])


async def _visible_measurement(measurement_id: str, auth: AuthContext,
                              db: AsyncSession, *, lock: bool = False) -> Measurement:
    query = select(Measurement).where(Measurement.id == measurement_id)
    if lock:
        query = query.with_for_update()
    measurement = await db.scalar(query)
    if measurement is None:
        raise HTTPException(status_code=404, detail="Meranie neexistuje.")
    if effective_role(auth.user) == "researcher" and measurement.participant_id in await revoked_participant_consents(db):
        raise HTTPException(status_code=404, detail="Meranie nie je dostupné.")
    return measurement


def _result_json(result: HumanModelResult) -> dict:
    return {"id": result.id, "measurement_id": result.measurement_id,
            "revision": result.revision, "source_raw_sha256": result.source_raw_sha256,
            "algorithm_version": result.algorithm_version,
            "review_status": result.review_status, "created_at": result.created_at,
            **result.payload}


@router.post("/measurements/{measurement_id}/human-models", status_code=201)
async def save_human_model(measurement_id: str, payload: HumanModelUpload,
                           auth: AuthContext = Depends(require_researcher_csrf),
                           db: AsyncSession = Depends(get_db)) -> dict:
    measurement = await _visible_measurement(measurement_id, auth, db, lock=True)
    if not measurement.raw_sha256:
        raise HTTPException(status_code=409, detail="Meranie nemá archivovaný raw záznam.")
    if measurement.raw_sha256.lower() != payload.source_raw_sha256.lower():
        raise HTTPException(status_code=409, detail="Raw záznam sa od výpočtu zmenil; výsledok sa neuložil.")
    revision = (await db.scalar(select(func.max(HumanModelResult.revision)).where(
        HumanModelResult.measurement_id == measurement_id))) or 0
    record = HumanModelResult(
        measurement_id=measurement_id, revision=revision + 1,
        source_raw_sha256=measurement.raw_sha256,
        algorithm_version=payload.algorithm_version,
        review_status="accepted", payload=payload.model_dump(mode="json"),
        created_by=auth.user.id, created_at=datetime.now(timezone.utc),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    publish_measurements_updated()
    return _result_json(record)


@router.get("/measurements/{measurement_id}/human-models")
async def list_human_models(measurement_id: str,
                            auth: AuthContext = Depends(require_researcher),
                            db: AsyncSession = Depends(get_db)) -> list[dict]:
    await _visible_measurement(measurement_id, auth, db)
    records = await db.scalars(select(HumanModelResult).where(
        HumanModelResult.measurement_id == measurement_id).order_by(HumanModelResult.revision.desc()))
    return [_result_json(record) for record in records]


@router.get("/measurements/{measurement_id}/human-models/latest")
async def latest_human_model(measurement_id: str,
                             auth: AuthContext = Depends(require_researcher),
                             db: AsyncSession = Depends(get_db)) -> dict:
    await _visible_measurement(measurement_id, auth, db)
    record = await db.scalar(select(HumanModelResult).where(
        HumanModelResult.measurement_id == measurement_id,
        HumanModelResult.review_status == "accepted",
    ).order_by(HumanModelResult.revision.desc()).limit(1))
    if record is None:
        raise HTTPException(status_code=404, detail="Akceptovaný human model zatiaľ nie je uložený.")
    return _result_json(record)


@router.post("/measurements/{measurement_id}/compute-quality")
async def update_compute_quality(measurement_id: str, payload: ComputeQualityUpdate,
                                auth: AuthContext = Depends(require_researcher_csrf),
                                db: AsyncSession = Depends(get_db)) -> dict:
    measurement = await _visible_measurement(measurement_id, auth, db, lock=True)
    measurement.compute_quality_status = payload.status
    measurement.compute_quality_note = payload.reason
    await db.commit()
    publish_measurements_updated()
    return {"measurement_id": measurement.id,
            "compute_quality_status": measurement.compute_quality_status,
            "compute_quality_note": measurement.compute_quality_note}
