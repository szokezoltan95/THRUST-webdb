"""Public welcome page and protected block editor API."""
from __future__ import annotations

import base64
import binascii
import io
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, require_admin, require_csrf
from app.core.config import settings
from app.db.session import get_db
from app.models import WelcomePage
from app.schemas.welcome_page import WelcomeDraft, WelcomePublish

router = APIRouter(tags=["welcome page"])
IMAGE_FORMATS = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}


class ImageUpload(BaseModel):
    image_base64: str = Field(min_length=1, max_length=7_000_000)


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
    return {"blocks": page.published_blocks if page and page.published_blocks is not None else None}


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
