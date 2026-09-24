"""Authenticated image catalogue for SimPLE test backgrounds."""
from __future__ import annotations

import base64
import binascii
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from app.api.dependencies import AuthContext, effective_role, require_authenticated, require_researcher, require_user_csrf
from app.core.config import settings

router = APIRouter(prefix="/backgrounds", tags=["backgrounds"])
ASSET_ID = re.compile(r"^[0-9a-f]{32}$")
MAX_IMAGE_BYTES = 5_000_000
MAX_IMAGE_PIXELS = 16_000_000


class BackgroundUpload(BaseModel):
    filename: str = Field(min_length=1, max_length=160)
    image_base64: str = Field(min_length=1, max_length=6_700_000)


def background_root() -> Path:
    return Path(settings.measurement_storage_path) / "backgrounds"


def background_metadata(asset_id: str) -> dict:
    if not ASSET_ID.fullmatch(asset_id):
        raise HTTPException(status_code=404, detail="Obrázok neexistuje.")
    path = background_root() / f"{asset_id}.json"
    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="Obrázok neexistuje.") from exc
    if metadata.get("id") != asset_id or metadata.get("format") not in ("png", "jpeg"):
        raise HTTPException(status_code=404, detail="Obrázok neexistuje.")
    return metadata


@router.get("")
async def list_backgrounds(auth: AuthContext = Depends(require_researcher)) -> list[dict]:
    root = background_root()
    if not root.is_dir():
        return []
    results = []
    for path in root.glob("*.json"):
        if not ASSET_ID.fullmatch(path.stem):
            continue
        try:
            info = background_metadata(path.stem)
        except HTTPException:
            continue
        results.append(info)
    return sorted(results, key=lambda item: item["created_at"], reverse=True)


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_background(
    payload: BackgroundUpload,
    auth: AuthContext = Depends(require_user_csrf),
) -> dict:
    if effective_role(auth.user) not in {"researcher", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Nahrávať pozadie môže iba výskumník.")
    try:
        data = base64.b64decode(payload.image_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="Obrázok nemá platné Base64 kódovanie.") from exc
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Obrázok musí mať najviac 5 MB.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            image_format = image.format
            width, height = image.size
            if image_format not in ("PNG", "JPEG") or width < 320 or height < 240 or width * height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=400, detail="Použi PNG alebo JPEG (min. 320×240, max. 16 Mpx).")
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Súbor nie je platný PNG alebo JPEG obrázok.") from exc
    extension = "png" if image_format == "PNG" else "jpg"
    asset_id = uuid4().hex
    root = background_root()
    root.mkdir(parents=True, exist_ok=True)
    image_path = root / f"{asset_id}.{extension}"
    metadata = {
        "id": asset_id, "filename": Path(payload.filename).name,
        "format": "png" if extension == "png" else "jpeg",
        "width": width, "height": height,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        image_path.write_bytes(data)
        (root / f"{asset_id}.json").write_text(json.dumps(metadata), encoding="utf-8")
    except OSError as exc:
        image_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Obrázok sa nepodarilo uložiť.") from exc
    return metadata


@router.get("/{asset_id}")
async def download_background(asset_id: str, auth: AuthContext = Depends(require_authenticated)) -> FileResponse:
    metadata = background_metadata(asset_id)
    extension = "png" if metadata["format"] == "png" else "jpg"
    path = background_root() / f"{asset_id}.{extension}"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Obrázok neexistuje.")
    return FileResponse(path, media_type="image/png" if extension == "png" else "image/jpeg")
