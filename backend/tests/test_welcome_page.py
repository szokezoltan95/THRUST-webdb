import base64
import io
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.dependencies import AuthContext, require_session
from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models import WelcomePage


@pytest.mark.asyncio
async def test_welcome_draft_publish_permissions_and_images(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "measurement_storage_path", str(tmp_path))
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(WelcomePage.__table__.create)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def db():
        async with factory() as session:
            yield session

    role = {"value": "researcher"}

    async def session():
        return AuthContext(user=SimpleNamespace(role=role["value"], username="editor", email=None), session=SimpleNamespace(csrf_token="secret"))

    app.dependency_overrides[get_db] = db
    app.dependency_overrides[require_session] = session
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://localhost") as client:
            assert (await client.get("/api/admin/welcome?lang=sk")).status_code == 403
            role["value"] = "admin"
            assert (await client.put("/api/admin/welcome/draft?lang=sk", json={"revision": 0, "blocks": []})).status_code == 403
            blocks = [{"id": "title", "type": "heading", "level": 1, "text": "Pilotáž UAV"}, {"id": "metrics", "type": "metrics"}]
            headers = {"X-CSRF-Token": "secret"}
            saved = await client.put("/api/admin/welcome/draft?lang=sk", json={"revision": 0, "blocks": blocks}, headers=headers)
            assert saved.status_code == 200, saved.text
            assert saved.json()["revision"] == 1
            assert (await client.get("/api/public/welcome?lang=sk")).json()["blocks"] is None
            assert (await client.post("/api/admin/welcome/publish?lang=sk", json={"revision": 0}, headers=headers)).status_code == 409
            assert (await client.post("/api/admin/welcome/publish?lang=sk", json={"revision": 1}, headers=headers)).status_code == 200
            assert (await client.get("/api/public/welcome?lang=sk")).json()["blocks"] == blocks
            assert (await client.get("/api/public/welcome?lang=en")).json()["blocks"] is None
            invalid = [{"id": "table", "type": "table", "title": "Bad", "columns": ["A", "B"], "rows": [["short"]]}]
            assert (await client.put("/api/admin/welcome/draft?lang=sk", json={"revision": 2, "blocks": invalid}, headers=headers)).status_code == 422

            image = io.BytesIO()
            Image.new("RGB", (20, 20), "blue").save(image, format="PNG")
            payload = {"image_base64": base64.b64encode(image.getvalue()).decode("ascii")}
            uploaded = await client.post("/api/admin/welcome/assets", json=payload, headers=headers)
            assert uploaded.status_code == 201, uploaded.text
            url = uploaded.json()["url"]
            assert (await client.get(url)).status_code == 404
            image_id = uploaded.json()["image_id"]
            assert (await client.get(f"/api/admin/welcome/assets/{image_id}")).headers["content-type"] == "image/png"
            with_image = blocks + [{"id": "photo", "type": "image", "image_id": image_id, "alt": "Test image", "caption": ""}]
            saved = await client.put("/api/admin/welcome/draft?lang=sk", json={"revision": 2, "blocks": with_image}, headers=headers)
            assert saved.status_code == 200
            assert (await client.get(url)).status_code == 404
            assert (await client.post("/api/admin/welcome/publish?lang=sk", json={"revision": 3}, headers=headers)).status_code == 200
            assert (await client.get(url)).headers["content-type"] == "image/png"
            assert (await client.get("/api/public/welcome/assets/../../etc/passwd")).status_code != 200
            role["value"] = "researcher"
            assert (await client.post("/api/admin/welcome/assets", json=payload, headers=headers)).status_code == 403
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
