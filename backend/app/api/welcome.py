"""Public welcome page and protected block editor API."""
from __future__ import annotations

import base64
import binascii
import io
import statistics
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, require_admin, require_csrf
from app.core.config import settings
from app.db.session import get_db
from app.api.reports import _metric_map
from app.models import AdminUser, Measurement, Participant, ResearchConsent, TestDefinition, WelcomePage
from app.schemas.welcome_page import WelcomeDraft, WelcomePublish

router = APIRouter(tags=["welcome page"])
IMAGE_FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}


class ImageUpload(BaseModel):
    image_base64: str = Field(min_length=1, max_length=7_000_000)


def _unit(metric: str) -> str:
    key = metric.lower()
    if key.endswith(("_s", ".s", "_sec")) or "delay" in key or "rise" in key or "settling" in key:
        return "s"
    if "percent" in key or key.endswith("_pct"):
        return "%"
    return ""


async def _source_records(db: AsyncSession) -> tuple[list[Measurement], dict[str, TestDefinition]]:
    measurements = list(await db.scalars(
        select(Measurement).where(Measurement.status.in_(["completed", "recorded"])).order_by(Measurement.started_at)
    ))
    revoked = set(await db.scalars(
        select(AdminUser.participant_id)
        .join(ResearchConsent, ResearchConsent.user_id == AdminUser.id)
        .where(AdminUser.participant_id.is_not(None), ResearchConsent.consent_type == "research", ResearchConsent.revoked_at.is_not(None))
    ))
    measurements = [item for item in measurements if item.participant_id not in revoked]
    tests = {test.id: test for test in await db.scalars(select(TestDefinition))}
    return measurements, tests


def _metric_catalog(measurements: list[Measurement]) -> list[dict]:
    subjects: dict[str, set[str]] = {}
    for item in measurements:
        for key in _metric_map(item.analysis_data):
            subjects.setdefault(key, set()).add(item.participant_id)
    minimum = settings.public_min_group_size
    return [
        {"key": key, "label": key.replace("_", " ").replace(".", " · "), "unit": _unit(key), "participant_count": len(participant_ids)}
        for key, participant_ids in sorted(subjects.items()) if len(participant_ids) >= minimum
    ]


def _series(measurements: list[Measurement], tests: dict[str, TestDefinition], metric: str, axis: str, statistic: str) -> list[dict]:
    buckets: dict[str, dict[str, list[float]]] = {}
    dates: dict[str, str] = {}
    for item in measurements:
        value = _metric_map(item.analysis_data).get(metric)
        if value is None:
            continue
        timestamp = item.started_at
        if timestamp.tzinfo is not None:
            timestamp = timestamp.astimezone(timezone.utc)
        iso_date = timestamp.date().isoformat()
        if axis == "month":
            label = iso_date[:7]
        else:
            test = tests.get(item.test_definition_id or "")
            label = f"{test.name} v{test.version}" if test else item.test_type
        buckets.setdefault(label, {}).setdefault(item.participant_id, []).append(value)
        dates[label] = iso_date
    points = []
    minimum = settings.public_min_group_size
    for label, by_participant in buckets.items():
        if len(by_participant) < minimum:
            continue
        per_participant = [statistics.fmean(values) for values in by_participant.values()]
        result = statistics.fmean(per_participant) if statistic == "mean" else statistics.median(per_participant)
        points.append({"label": label, "date": dates[label], "value": result, "participant_count": len(by_participant)})
    points.sort(key=lambda point: (point["date"], point["label"]) if axis == "month" else point["label"])
    return points


def _histogram(measurements: list[Measurement], metric: str, bins: int, test_definition_id: str | None) -> dict:
    per_participant: dict[str, list[float]] = {}
    for item in measurements:
        if test_definition_id and item.test_definition_id != test_definition_id:
            continue
        value = _metric_map(item.analysis_data).get(metric)
        if value is not None:
            per_participant.setdefault(item.participant_id, []).append(value)
    values = [statistics.fmean(items) for items in per_participant.values()]
    if len(values) < settings.public_min_group_size:
        return {"publishable": False, "bins": []}
    low, high = min(values), max(values)
    if low == high:
        edges, bin_count = [low - 0.5, high + 0.5], 1
    else:
        bin_count = bins
        width = (high - low) / bin_count
        edges = [low + index * width for index in range(bin_count + 1)]
        edges[-1] = high
    counts = [0] * bin_count
    for value in values:
        index = min(bin_count - 1, int((value - low) / (high - low) * bin_count)) if high > low else 0
        counts[index] += 1
    minimum = settings.public_min_group_size
    return {
        "publishable": True,
        "bins": [
            {"start": edges[index], "end": edges[index + 1],
             "count": count if count == 0 or count >= minimum else None,
             "suppressed": 0 < count < minimum}
            for index, count in enumerate(counts)
        ],
    }


def _average_response(measurements: list[Measurement], tests: dict[str, TestDefinition], test_id: str, channel: str) -> dict:
    test = tests.get(test_id)
    if not test:
        return {"publishable": False, "response_points": []}
    participant_curves: dict[str, list[list[float | None]]] = {}
    time_grid = [index * 0.05 for index in range(31)]
    for item in measurements:
        if item.test_definition_id != test_id or not isinstance(item.analysis_data, dict):
            continue
        normalized = item.analysis_data.get("normalized_step_response")
        channels = normalized.get("channels") if isinstance(normalized, dict) else None
        source = channels.get(channel) if isinstance(channels, dict) else None
        times = source.get("time_s") if isinstance(source, dict) else None
        values = source.get("mean") if isinstance(source, dict) else None
        if not isinstance(times, list) or not isinstance(values, list) or len(times) < 2 or len(values) != len(times):
            continue
        try:
            points_source = [(float(t), float(v)) for t, v in zip(times, values)]
            if any(not math.isfinite(t) or not math.isfinite(v) for t, v in points_source):
                continue
        except (TypeError, ValueError):
            continue
        curve: list[float | None] = []
        cursor = 0
        for target in time_grid:
            while cursor + 1 < len(points_source) and points_source[cursor + 1][0] < target:
                cursor += 1
            if target < points_source[0][0] or target > points_source[-1][0]:
                curve.append(None)
            elif cursor + 1 >= len(points_source):
                curve.append(points_source[-1][1])
            else:
                t0, v0 = points_source[cursor]
                t1, v1 = points_source[cursor + 1]
                fraction = 0.0 if t1 == t0 else (target - t0) / (t1 - t0)
                curve.append(v0 + fraction * (v1 - v0))
        participant_curves.setdefault(item.participant_id, []).append(curve)
    if len(participant_curves) < settings.public_min_group_size:
        return {"publishable": False, "response_points": [], "test": f"{test.name} v{test.version}", "channel": channel}
    averaged_by_participant = [
        [statistics.fmean(value for value in values if value is not None) if any(value is not None for value in values) else None
         for values in zip(*curves)]
        for curves in participant_curves.values()
    ]
    points = []
    for index, time_s in enumerate(time_grid):
        values = [curve[index] for curve in averaged_by_participant if curve[index] is not None]
        points.append({"time_s": time_s, "value": statistics.fmean(values) if values else None})
    return {"publishable": True, "response_points": points, "test": f"{test.name} v{test.version}", "channel": channel}


async def _page_data(blocks: list[dict], db: AsyncSession) -> dict:
    measurements, tests = await _source_records(db)
    participant_total = await db.scalar(select(func.count()).select_from(Participant)) or 0
    eligible = participant_total >= settings.public_min_group_size
    active_tests = await db.scalar(select(func.count()).select_from(TestDefinition).where(TestDefinition.is_active.is_(True))) or 0
    result: dict[str, dict] = {}
    for block in blocks:
        kind = block.get("type")
        if kind == "metrics":
            values = {"participants": participant_total if eligible else None,
                      "measurements": len(measurements) if eligible else None,
                      "active_tests": active_tests}
            result[block["id"]] = {
                "items": [{"key": key, "label": {"participants": "Participants", "measurements": "Measurements", "active_tests": "Active tests"}[key], "value": values[key]}
                          for key in block.get("items", ["participants", "measurements", "active_tests"])],
                "trends": [
                    {**spec, "title": f"{spec['metric']} · {spec['axis']}", "unit": _unit(spec["metric"]),
                     "points": _series(measurements, tests, spec["metric"], spec["axis"], spec["statistic"])}
                    for spec in block.get("trends", [])
                ],
            }
        elif kind == "data_chart":
            result[block["id"]] = {"metric": block["metric"], "unit": _unit(block["metric"]),
                                    "points": _series(measurements, tests, block["metric"], block["axis"], block["statistic"])}
        elif kind == "histogram":
            result[block["id"]] = {
                "metric": block["metric"], "unit": _unit(block["metric"]),
                **_histogram(measurements, block["metric"], block.get("bins", 8), block.get("test_definition_id")),
            }
        elif kind == "average_response":
            result[block["id"]] = _average_response(
                measurements, tests, block["test_definition_id"], block["channel"]
            )
        elif kind == "data_table":
            metrics = block["metrics"]
            columns = [{"key": key, "label": key.replace("_", " ").replace(".", " · "), "unit": _unit(key)} for key in metrics]
            data_by_metric = {key: _series(measurements, tests, key, block["axis"], block["statistic"]) for key in metrics}
            labels = sorted(set().union(*(set(point["label"] for point in points) for points in data_by_metric.values())))
            rows = [[label, *[next((point["value"] for point in data_by_metric[key] if point["label"] == label), None) for key in metrics]] for label in labels]
            result[block["id"]] = {"axis": block["axis"], "columns": columns, "rows": rows}
    return result


def asset_root() -> Path:
    return Path(settings.measurement_storage_path) / "welcome-assets"


def asset_path(image_id: str) -> Path | None:
    if len(image_id) != 32 or any(char not in "0123456789abcdef" for char in image_id):
        return None
    for extension in IMAGE_FORMATS.values():
        path = asset_root() / f"{image_id}.{extension}"
        if path.is_file():
            return path
    return None


@router.get("/public/welcome")
async def public_welcome(lang: str = "sk", db: AsyncSession = Depends(get_db)) -> dict:
    if lang not in ("sk", "en"):
        raise HTTPException(422, "Unsupported language")
    page = await db.get(WelcomePage, lang)
    blocks = page.published_blocks if page and page.published_blocks is not None else None
    return {"blocks": blocks, "data": await _page_data(blocks or [], db)}


def image_response(image_id: str, *, public: bool) -> FileResponse:
    path = asset_path(image_id)
    if path is None:
        raise HTTPException(404, "Image not found")
    media_type = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}[path.suffix]
    visibility = "public" if public else "private"
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": f"{visibility}, max-age=31536000, immutable"})


@router.get("/public/welcome/assets/{image_id}")
async def public_asset(image_id: str, db: AsyncSession = Depends(get_db)) -> FileResponse:
    if asset_path(image_id) is None:
        raise HTTPException(404, "Image not found")
    pages = (await db.scalars(select(WelcomePage))).all()
    if not any(block.get("image_id") == image_id for page in pages for block in (page.published_blocks or [])):
        raise HTTPException(404, "Image not published")
    return image_response(image_id, public=True)


@router.get("/admin/welcome/assets/{image_id}")
async def admin_asset(image_id: str, auth: AuthContext = Depends(require_admin)) -> FileResponse:
    return image_response(image_id, public=False)


@router.get("/admin/welcome")
async def admin_welcome(lang: str = "sk", auth: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    if lang not in ("sk", "en"):
        raise HTTPException(422, "Unsupported language")
    page = await db.get(WelcomePage, lang)
    return {
        "draft": page.draft_blocks if page else [],
        "published": page.published_blocks if page else None,
        "revision": page.revision if page else 0,
        "updated_at": page.updated_at if page else None,
        "published_at": page.published_at if page else None,
    }


@router.get("/admin/welcome/catalog")
async def welcome_catalog(auth: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    measurements, tests = await _source_records(db)
    return {
        "metrics": _metric_catalog(measurements),
        "tests": [{"id": test.id, "label": f"{test.name} v{test.version}"} for test in sorted(tests.values(), key=lambda item: (item.name, item.version)) if test.is_active],
    }


@router.post("/admin/welcome/preview-data")
async def welcome_preview_data(payload: WelcomeDraft, auth: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return {"data": await _page_data([block.model_dump(mode="json") for block in payload.blocks], db)}


@router.put("/admin/welcome/draft")
async def save_draft(payload: WelcomeDraft, lang: str = "sk", auth: AuthContext = Depends(require_csrf), db: AsyncSession = Depends(get_db)) -> dict:
    if lang not in ("sk", "en"):
        raise HTTPException(422, "Unsupported language")
    page = await db.get(WelcomePage, lang, with_for_update=True)
    if page is None:
        if payload.revision != 0:
            raise HTTPException(409, "Page changed; reload the editor")
        page = WelcomePage(language=lang, draft_blocks=[], revision=0)
        db.add(page)
    elif page.revision != payload.revision:
        raise HTTPException(409, "Page changed; reload the editor")
    page.draft_blocks = [block.model_dump(mode="json") for block in payload.blocks]
    page.revision += 1
    page.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"revision": page.revision, "updated_at": page.updated_at}


@router.post("/admin/welcome/publish")
async def publish_page(payload: WelcomePublish, lang: str = "sk", auth: AuthContext = Depends(require_csrf), db: AsyncSession = Depends(get_db)) -> dict:
    if lang not in ("sk", "en"):
        raise HTTPException(422, "Unsupported language")
    page = await db.get(WelcomePage, lang, with_for_update=True)
    if page is None or page.revision != payload.revision:
        raise HTTPException(409, "Page changed; save and reload the editor")
    if not page.draft_blocks:
        raise HTTPException(400, "Save at least one block before publishing")
    validated = WelcomeDraft.model_validate({"revision": page.revision, "blocks": page.draft_blocks})
    for block in validated.blocks:
        image_id = getattr(block, "image_id", None)
        if image_id and asset_path(image_id) is None:
            raise HTTPException(400, "A page image is missing")
    page.published_blocks = [block.model_dump(mode="json") for block in validated.blocks]
    page.published_at = datetime.now(timezone.utc)
    page.updated_at = page.published_at
    page.revision += 1
    await db.commit()
    return {"revision": page.revision, "published_at": page.published_at}


@router.post("/admin/welcome/assets", status_code=201)
async def upload_asset(payload: ImageUpload, auth: AuthContext = Depends(require_csrf)) -> dict:
    try:
        data = base64.b64decode(payload.image_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(400, "Invalid image encoding") from exc
    if len(data) > 5_000_000:
        raise HTTPException(413, "Image exceeds 5 MB")
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.format not in IMAGE_FORMATS or source.width * source.height > 16_000_000 or source.width < 1 or source.height < 1:
                raise HTTPException(400, "Use PNG, JPEG or WebP up to 16 megapixels")
            extension = IMAGE_FORMATS[source.format]
            # Re-encoding removes EXIF and metadata before an image becomes public.
            image = source.convert("RGB" if extension == "jpg" else "RGBA")
            output = io.BytesIO()
            image.save(output, format="JPEG" if extension == "jpg" else extension.upper())
            clean_data = output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(400, "Invalid image") from exc
    if len(clean_data) > 5_000_000:
        raise HTTPException(413, "Processed image exceeds 5 MB")
    image_id = uuid4().hex
    root = asset_root()
    root.mkdir(parents=True, exist_ok=True)
    (root / f"{image_id}.{extension}").write_bytes(clean_data)
    return {"image_id": image_id, "url": f"/api/public/welcome/assets/{image_id}"}
