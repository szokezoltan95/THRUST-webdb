from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import HTTPException


def validate_measurement_result(payload, test, raw_bytes: bytes) -> None:
    """Check the Measure-produced envelope and its link to the uploaded raw log."""
    analysis = payload.analysis_data
    raw = analysis["raw_log"]
    if raw.get("file_name") != payload.source_file_name:
        raise HTTPException(status_code=422, detail="Analysis file name does not match the raw upload.")
    if raw.get("sha256") != hashlib.sha256(raw_bytes).hexdigest():
        raise HTTPException(status_code=422, detail="Analysis raw-log hash does not match the uploaded file.")
    if raw.get("size_bytes") != len(raw_bytes):
        raise HTTPException(status_code=422, detail="Analysis raw-log size does not match the uploaded file.")
    if raw.get("content_type") != payload.raw_content_type:
        raise HTTPException(status_code=422, detail="Analysis raw-log type does not match the uploaded file.")
    try:
        analysis_started = datetime.fromisoformat(analysis["started_at"].replace("Z", "+00:00"))
    except (AttributeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Analysis started_at must be an ISO date-time.") from exc
    if analysis_started.tzinfo is None:
        raise HTTPException(status_code=422, detail="Analysis started_at must include a timezone.")
    request_started = payload.started_at
    if request_started.tzinfo is None:
        raise HTTPException(status_code=422, detail="Measurement started_at must include a timezone.")
    if analysis_started.astimezone(timezone.utc) != request_started.astimezone(timezone.utc):
        raise HTTPException(status_code=422, detail="Analysis and measurement start times do not match.")
    if analysis["test"].get("test_code") != test.test_code or str(analysis["test"].get("version")) != str(test.version):
        raise HTTPException(status_code=422, detail="Analysis test version does not match the selected test.")
    profile = test.analysis_profile.upper()
    expected = "SIMPLE_2D_FLIGHT" if profile.startswith("SIMPLE") else "SCOPE_STEP_RESPONSE"
    if analysis["analysis_type"] != expected:
        raise HTTPException(status_code=422, detail="Analysis type does not match the selected test.")
