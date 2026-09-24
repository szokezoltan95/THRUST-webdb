"""Researcher exports and server-side trend/report plots."""
from __future__ import annotations

import csv
import io
import json
import math
import statistics
import tempfile
from datetime import date, datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.background import BackgroundTask

from app.api.dependencies import AuthContext, require_researcher, require_superadmin_csrf
from app.core.config import settings
from app.db.session import get_db
from app.models import Measurement, Participant, ParticipantGroup, TestDefinition

router = APIRouter(prefix="/admin/reports", tags=["reports"])


def _metric_map(data: dict | None) -> dict[str, float]:
    if not isinstance(data, dict):
        return {}
    result: dict[str, float] = {}

    def add(prefix: str, value: object) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                if isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item):
                    result[prefix + str(key)] = float(item)

    add("", data.get("metrics"))
    add("", data.get("parameters"))
    response_data = data.get("normalized_step_response")
    if isinstance(response_data, dict) and isinstance(response_data.get("channels"), dict):
        for axis, channel in response_data["channels"].items():
            if isinstance(channel, dict):
                add(f"{axis}.", channel.get("metrics"))
    return result


async def _trend_data(
    db: AsyncSession, participant_ids: list[str], group_ids: list[str], metric: str,
    axis: str, date_from: date | None, date_to: date | None,
) -> dict:
    if axis not in {"date", "test"}:
        raise HTTPException(status_code=422, detail="axis must be date or test")
    groups = list(await db.scalars(select(ParticipantGroup).options(selectinload(ParticipantGroup.members)).where(ParticipantGroup.id.in_(group_ids)))) if group_ids else []
    participants = list(await db.scalars(select(Participant).where(Participant.id.in_(participant_ids)))) if participant_ids else []
    subject_members: dict[str, set[str]] = {f"participant:{p.id}": {p.id} for p in participants}
    subject_names = {f"participant:{p.id}": p.participant_code for p in participants}
    for group in groups:
        key = f"group:{group.id}"
        subject_members[key] = {member.id for member in group.members}
        subject_names[key] = group.name
    if not subject_members:
        return {"metric": metric, "axis": axis, "series": []}
    all_members = set().union(*subject_members.values())
    measurements = list(await db.scalars(select(Measurement).where(Measurement.participant_id.in_(all_members)).order_by(Measurement.started_at)))
    buckets: dict[tuple[str, str], dict[str, list[float]]] = {}
    bucket_dates: dict[tuple[str, str], str] = {}
    for item in measurements:
        started = item.started_at.date() if isinstance(item.started_at, datetime) else date.fromisoformat(str(item.started_at)[:10])
        if date_from and started < date_from or date_to and started > date_to:
            continue
        value = _metric_map(item.analysis_data).get(metric)
        if value is None:
            continue
        label = started.isoformat() if axis == "date" else item.test_type
        for subject, members in subject_members.items():
            if item.participant_id not in members:
                continue
            key = (subject, label)
            buckets.setdefault(key, {}).setdefault(item.participant_id, []).append(value)
            bucket_dates[key] = started.isoformat()
    series_map: dict[str, list[dict]] = {key: [] for key in subject_members}
    for (subject, label), by_participant in buckets.items():
        participant_means = [statistics.fmean(values) for values in by_participant.values()]
        series_map[subject].append({"label": label, "date": bucket_dates[(subject, label)],
                                    "mean": statistics.fmean(participant_means),
                                    "median": statistics.median(participant_means),
                                    "sd_sample": statistics.stdev(participant_means) if len(participant_means) > 1 else None,
                                    "min": min(participant_means), "max": max(participant_means),
                                    "participant_count": len(participant_means),
                                    "measurement_count": sum(len(values) for values in by_participant.values())})
    result = []
    for subject, points in series_map.items():
        points.sort(key=lambda point: point["date"] if axis == "date" else point["label"])
        if points:
            result.append({"subject_id": subject, "subject": subject_names[subject], "points": points})
    return {"metric": metric, "axis": axis, "series": result}


def _parameters(participant_ids: list[str], group_ids: list[str], metric: str, axis: str,
                 date_from: date | None, date_to: date | None) -> dict:
    return {"participant_ids": participant_ids, "group_ids": group_ids, "metric": metric, "axis": axis,
            "date_from": date_from, "date_to": date_to}


@router.get("/trends")
async def trend_table(
    participant_ids: list[str] = Query(default=[]), group_ids: list[str] = Query(default=[]),
    metric: str = Query(min_length=1, max_length=100), axis: str = "date",
    date_from: date | None = None, date_to: date | None = None,
    auth: AuthContext = Depends(require_researcher), db: AsyncSession = Depends(get_db),
) -> dict:
    return await _trend_data(db, participant_ids, group_ids, metric, axis, date_from, date_to)


@router.get("/trends.png")
async def trend_chart(
    participant_ids: list[str] = Query(default=[]), group_ids: list[str] = Query(default=[]),
    metric: str = Query(min_length=1, max_length=100), axis: str = "date",
    date_from: date | None = None, date_to: date | None = None,
    auth: AuthContext = Depends(require_researcher), db: AsyncSession = Depends(get_db),
) -> Response:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    data = await _trend_data(db, participant_ids, group_ids, metric, axis, date_from, date_to)
    fig, ax = plt.subplots(figsize=(10, 5.5))
    for series in data["series"]:
        points = series["points"]
        labels = [point["label"] for point in points]
        values = [point["mean"] for point in points]
        errors = [point["sd_sample"] or 0 for point in points]
        ax.errorbar(labels, values, yerr=errors, marker="o", capsize=3, label=series["subject"])
    ax.set_title(f"{metric} by {axis}")
    ax.set_xlabel("Measurement date" if axis == "date" else "Test")
    ax.set_ylabel(metric)
    ax.grid(True, alpha=.25)
    if len(data["series"]) > 1:
        ax.legend(loc="best")
    if axis == "date":
        fig.autofmt_xdate()
    else:
        ax.tick_params(axis="x", labelrotation=30)
    fig.tight_layout()
    image = io.BytesIO()
    fig.savefig(image, format="png", dpi=160)
    plt.close(fig)
    return Response(image.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})


@router.get("/trends.csv")
async def trend_csv(
    participant_ids: list[str] = Query(default=[]), group_ids: list[str] = Query(default=[]),
    metric: str = Query(min_length=1, max_length=100), axis: str = "date",
    date_from: date | None = None, date_to: date | None = None,
    auth: AuthContext = Depends(require_researcher), db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    data = await _trend_data(db, participant_ids, group_ids, metric, axis, date_from, date_to)
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=["subject_id", "subject", "metric", "axis", "period", "mean", "median", "sd_sample", "min", "max", "participant_count", "measurement_count"])
    writer.writeheader()
    for series in data["series"]:
        for point in series["points"]:
            writer.writerow({"subject_id": series["subject_id"], "subject": series["subject"], "metric": metric,
                             "axis": axis, "period": point["label"], "mean": point["mean"],
                             "median": point["median"], "sd_sample": point["sd_sample"],
                             "min": point["min"], "max": point["max"], "participant_count": point["participant_count"],
                             "measurement_count": point["measurement_count"]})
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": "attachment; filename=thrust-trends.csv"})


@router.get("/measurements.csv")
async def measurement_csv(measurement_ids: list[str] = Query(min_length=1),
                          auth: AuthContext = Depends(require_researcher),
                          db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    measurements = list(await db.scalars(select(Measurement).where(Measurement.id.in_(measurement_ids)).order_by(Measurement.started_at)))
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["measurement_id", "participant_id", "test_type", "started_at", "metric", "value"])
    for item in measurements:
        for metric, value in sorted(_metric_map(item.analysis_data).items()):
            writer.writerow([item.id, item.participant_id, item.test_type, item.started_at.isoformat(), metric, value])
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": "attachment; filename=thrust-measurements.csv"})


@router.get("/measurements/{measurement_id}.pdf")
async def measurement_pdf(measurement_id: str, auth: AuthContext = Depends(require_researcher),
                          db: AsyncSession = Depends(get_db)) -> Response:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    item = await db.get(Measurement, measurement_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Measurement not found")
    data = item.analysis_data or {}
    output = io.BytesIO()
    with PdfPages(output) as pdf:
        response_data = data.get("normalized_step_response") if isinstance(data, dict) else None
        channels = response_data.get("channels", {}) if isinstance(response_data, dict) else {}
        if channels:
            time_values = response_data.get("time_s", response_data.get("time", []))
            fig, axes = plt.subplots(2, 2, figsize=(11.7, 8.3))
            for ax, (axis_name, channel) in zip(axes.flat, channels.items()):
                mean = channel.get("mean", []) if isinstance(channel, dict) else []
                std = channel.get("std", []) if isinstance(channel, dict) else []
                n = min(len(time_values), len(mean))
                if n:
                    ax.plot(time_values[:n], mean[:n], label="Mean")
                    if len(std) >= n:
                        lower = [float(mean[i]) - float(std[i]) for i in range(n)]
                        upper = [float(mean[i]) + float(std[i]) for i in range(n)]
                        ax.fill_between(time_values[:n], lower, upper, alpha=.2, label="±SD")
                    ax.set_title(axis_name)
                    ax.grid(True, alpha=.25)
                    ax.set_xlabel("Time (s)")
                    ax.legend()
            fig.suptitle(f"{item.test_type} · {item.started_at}")
            fig.tight_layout()
            pdf.savefig(fig)
            plt.close(fig)
        metrics = _metric_map(data)
        if metrics:
            fig, ax = plt.subplots(figsize=(11.7, 8.3))
            names, values = list(metrics), list(metrics.values())
            ax.barh(names, values)
            ax.set_title(f"{item.test_type} · stored analysis metrics")
            ax.grid(True, axis="x", alpha=.25)
            fig.tight_layout()
            pdf.savefig(fig)
            plt.close(fig)
        if not channels and not metrics:
            fig, ax = plt.subplots(figsize=(11.7, 8.3))
            ax.axis("off")
            ax.text(.05, .95, f"{item.test_type}\n{item.started_at}\nNo stored numeric analysis is available.\n\n{json.dumps(data, ensure_ascii=False, indent=2)[:8000]}", va="top")
            pdf.savefig(fig)
            plt.close(fig)
    return Response(output.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="thrust-{item.id}.pdf"'})


@router.get("/all-data.zip")
async def all_data_zip(auth: AuthContext = Depends(require_superadmin_csrf),
                       db: AsyncSession = Depends(get_db)) -> FileResponse:
    participants = list(await db.scalars(select(Participant).order_by(Participant.participant_code)))
    groups = list(await db.scalars(select(ParticipantGroup).options(selectinload(ParticipantGroup.members)).order_by(ParticipantGroup.name)))
    tests = list(await db.scalars(select(TestDefinition).order_by(TestDefinition.test_code, TestDefinition.version)))
    measurements = list(await db.scalars(select(Measurement).order_by(Measurement.started_at)))
    root = Path(settings.measurement_storage_path).resolve()
    tmp = tempfile.NamedTemporaryFile(prefix="thrust-export-", suffix=".zip", delete=False)
    tmp.close()
    archive_path = Path(tmp.name)
    missing_raw: list[str] = []

    def json_bytes(value: object) -> bytes:
        return json.dumps(value, ensure_ascii=False, default=lambda obj: obj.isoformat() if hasattr(obj, "isoformat") else str(obj), indent=2).encode("utf-8")

    with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("participants.json", json_bytes([{
            key: getattr(item, key) for key in item.__table__.columns.keys()
        } for item in participants]))
        archive.writestr("groups.json", json_bytes([{"id": g.id, "name": g.name, "description": g.description,
            "created_at": g.created_at, "participant_ids": [m.id for m in g.members]} for g in groups]))
        archive.writestr("test_definitions.json", json_bytes([{
            key: getattr(item, key) for key in item.__table__.columns.keys()
        } for item in tests]))
        rows = []
        for item in measurements:
            rows.append({key: getattr(item, key) for key in item.__table__.columns.keys() if key != "raw_storage_path"})
            if not item.raw_storage_path:
                continue
            raw_path = Path(item.raw_storage_path).resolve()
            try:
                raw_path.relative_to(root)
            except ValueError as exc:
                raise HTTPException(status_code=500, detail="Raw file is outside the configured measurement archive") from exc
            if not raw_path.is_file():
                missing_raw.append(item.id)
                continue
            archive.write(raw_path, f"raw/{item.id}{'.tsv.gz' if raw_path.suffix == '.gz' else raw_path.suffix}",
                          compress_type=ZIP_STORED if raw_path.suffix == ".gz" else ZIP_DEFLATED)
        archive.writestr("measurements.json", json_bytes(rows))
        archive.writestr("README.txt", "Complete WebDB pseudonymous research-data export. Contains participant profile fields, groups, test definitions, measurement analysis JSON, and archived raw logs. No user accounts or passwords are included.\n")
        archive.writestr("export_manifest.json", json_bytes({"participant_count": len(participants), "group_count": len(groups),
            "test_definition_count": len(tests), "measurement_count": len(measurements), "raw_files_missing": missing_raw,
            "generated_at": datetime.now().astimezone()}))
    return FileResponse(archive_path, media_type="application/zip", filename="thrust-webdb-full-export.zip",
                        background=BackgroundTask(lambda: archive_path.unlink(missing_ok=True)))
