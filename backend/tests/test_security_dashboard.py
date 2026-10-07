import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.dependencies import AuthContext, require_session
from app.api.security_dashboard import backup_report
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import AdminSession, AdminUser, Participant, ResearchConsent, StudentDataRequest
from app.models.security import SecurityEvent, SecurityPolicy


@pytest_asyncio.fixture
async def dashboard():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    tables = [Participant.__table__, AdminUser.__table__, AdminSession.__table__, ResearchConsent.__table__,
              StudentDataRequest.__table__, SecurityPolicy.__table__, SecurityEvent.__table__]
    async with engine.begin() as connection:
        await connection.run_sync(lambda sync: Base.metadata.create_all(sync, tables=tables))
    session = async_sessionmaker(engine, expire_on_commit=False)()
    user = AdminUser(id="operator", username="operator", role="superadmin", is_active=True, password_hash="test")
    session.add(user)
    await session.commit()
    auth = AuthContext(user=user, session=SimpleNamespace(csrf_token="csrf"))

    async def db_override():
        yield session

    async def session_override():
        return auth

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[require_session] = session_override
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
        yield client, session, user
    app.dependency_overrides.clear()
    await session.close()
    await engine.dispose()


@pytest.mark.asyncio
async def test_policy_permissions_and_versioned_snapshots(dashboard):
    client, db, operator = dashboard
    initial = (await client.get("/api/admin/security/policy")).json()
    assert initial["revision"] == 0
    content = initial["content"]
    content["controller_name"] = "Test controller"
    content["controller_address"] = "Test address"
    content["controller_email"] = "privacy@example.com"
    for rule in content["retention"].values():
        rule.update(sk="30 dní po skončení štúdie", en="30 days after study completion")
    body = {"expected_revision": 0, "content": content}
    operator.role = "researcher"
    assert (await client.get("/api/admin/security/overview")).status_code == 403
    operator.role = "admin"
    assert (await client.get("/api/admin/security/overview")).status_code == 200
    assert (await client.post("/api/admin/security/policy", json=body, headers={"X-CSRF-Token": "csrf"})).status_code == 403
    operator.role = "superadmin"
    assert (await client.post("/api/admin/security/policy", json=body)).status_code == 403
    published = await client.post("/api/admin/security/policy", json=body, headers={"X-CSRF-Token": "csrf"})
    assert published.status_code == 200
    docs = (await client.get("/api/public/consent-texts?lang=en")).json()
    assert docs["gdpr"]["version"] == "gdpr-r1"
    assert "Test controller" in docs["gdpr"]["text"]
    assert "30 days after study completion" in docs["gdpr"]["text"]
    assert (await client.post("/api/admin/security/policy", json=body, headers={"X-CSRF-Token": "csrf"})).status_code == 409
    stale = await client.post("/api/auth/register", json={"email": "stale@example.com", "password": "long-password", "research_consent": True, "gdpr_consent": True})
    assert stale.status_code == 409
    registered = await client.post("/api/auth/register", json={"email": "new@example.com", "password": "long-password", "research_consent": True, "gdpr_consent": True, "consent_language": "en", "consent_version": "research-r1", "gdpr_consent_version": "gdpr-r1"})
    assert registered.status_code == 201
    stored = await db.scalar(select(ResearchConsent).where(ResearchConsent.consent_type == "gdpr"))
    old_snapshot = stored.text_snapshot
    content["gdpr"]["en"] = "A later policy."
    body["expected_revision"] = 1
    assert (await client.post("/api/admin/security/policy", json=body, headers={"X-CSRF-Token": "csrf"})).status_code == 200
    assert stored.text_snapshot == old_snapshot
    assert stored.version == "gdpr-r1"
    assert (await client.get("/api/public/privacy-policy?lang=sk")).json()["retention"][0]["period"] == "30 dní po skončení štúdie"
    audit = (await client.get("/api/admin/security/events?category=policy")).json()
    assert audit["total"] == 2
    assert all(item["details"].keys() == {"revision"} for item in audit["items"])


def test_backup_report_missing_failed_stale_and_future(tmp_path, monkeypatch):
    path = tmp_path / "status.json"
    monkeypatch.setattr(settings, "backup_status_path", str(path))
    assert backup_report()["status"] == "unconfigured"
    path.write_text("not json")
    assert backup_report()["status"] == "invalid"
    now = datetime.now(timezone.utc)
    entry = {"name": "20261007T112000Z", "created_at": now.isoformat(), "size_bytes": 10,
             "database": True, "files": True, "checksums_verified": True}
    report = {"generated_at": now.isoformat(), "last_attempt_at": now.isoformat(), "last_attempt_status": "success", "backups": [entry]}
    path.write_text(json.dumps(report))
    assert backup_report()["status"] == "ok"
    entry["files"] = False
    path.write_text(json.dumps(report))
    assert backup_report()["status"] == "stale"
    entry["files"] = True
    entry["created_at"] = (now - timedelta(days=8)).isoformat()
    path.write_text(json.dumps(report))
    assert backup_report()["status"] == "stale"
    report["last_attempt_status"] = "failed"
    path.write_text(json.dumps(report))
    assert backup_report()["status"] == "failed"
    report["last_attempt_status"] = "success"
    entry["created_at"] = (now + timedelta(days=1)).isoformat()
    path.write_text(json.dumps(report))
    assert backup_report()["status"] == "invalid"
