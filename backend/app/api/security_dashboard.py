from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, effective_role, require_admin, require_superadmin_csrf
from app.core.audit import record_event
from app.core.config import settings
from app.core.consent_guard import revoked_participant_consents
from app.core.privacy_policy import current_policy, render_documents
from app.db.session import get_db
from app.models import AdminSession, AdminUser, StudentDataRequest
from app.models.security import SecurityEvent, SecurityPolicy
from app.schemas.security import BackupReport, PolicyPublish

router = APIRouter(prefix="/admin/security", tags=["security"])


def backup_report() -> dict:
    path = Path(settings.backup_status_path)
    try:
        if not path.is_file():
            return {"status": "unconfigured", "report": None}
        if path.stat().st_size > 100_000:
            return {"status": "invalid", "report": None}
        report = BackupReport.model_validate_json(path.read_text(encoding="utf-8"))
        now = datetime.now(timezone.utc)
        dated = [entry.created_at.replace(tzinfo=entry.created_at.tzinfo or timezone.utc) for entry in report.backups if entry.database and entry.files and entry.checksums_verified]
        if report.last_attempt_status == "failed":
            state = "failed"
        elif not dated or (now - max(dated)).total_seconds() > settings.backup_max_age_hours * 3600:
            state = "stale"
        elif max(dated) > now or report.generated_at.replace(tzinfo=report.generated_at.tzinfo or timezone.utc) > now:
            state = "invalid"
        else:
            state = "ok"
        return {"status": state, "report": report.model_dump(mode="json")}
    except (OSError, ValueError, ValidationError):
        return {"status": "invalid", "report": None}


@router.get("/overview")
async def overview(auth: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    revision, content = await current_policy(db)
    pending = StudentDataRequest.status.in_(["received", "in_review"])
    users = list(await db.scalars(select(AdminUser).where(AdminUser.is_active.is_(True))))
    roles = {role: sum(effective_role(user) == role for user in users) for role in ("student", "researcher", "admin", "superadmin")}
    return {
        "policy_revision": revision,
        "open_requests": await db.scalar(select(func.count()).select_from(StudentDataRequest).where(pending)) or 0,
        "oldest_request_at": await db.scalar(select(func.min(StudentDataRequest.created_at)).where(pending)),
        "withdrawn_participants": len(await revoked_participant_consents(db)),
        "active_sessions": await db.scalar(select(func.count()).select_from(AdminSession).join(AdminUser).where(AdminSession.expires_at > datetime.now(timezone.utc), AdminUser.is_active.is_(True))) or 0,
        "roles": roles,
        "checks": {
            "secure_cookie": settings.cookie_secure,
            "allowed_hosts_restricted": bool(settings.allowed_hosts.strip()) and "*" not in settings.allowed_hosts,
            "session_lifetime_hours": settings.session_lifetime_hours,
            "public_min_group_size": settings.public_min_group_size,
            "researcher_registration_enabled": bool(settings.researcher_registration_key),
            "privacy_configured": bool(content["controller_name"] and content["controller_address"] and content["controller_email"] and all(value[lang] for value in content["retention"].values() for lang in ("sk", "en")) and all(content[key][lang] for key in ("purposes", "recipients") for lang in ("sk", "en"))),
        },
        "backup": backup_report(),
    }


@router.get("/policy")
async def policy(auth: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    revision, content = await current_policy(db)
    history = list(await db.scalars(select(SecurityPolicy).order_by(SecurityPolicy.revision.desc()).limit(30)))
    return {"revision": revision, "content": content, "documents": {lang: render_documents(revision, content, lang) for lang in ("sk", "en")},
            "history": [{"revision": row.revision, "published_at": row.published_at, "published_by": row.published_by} for row in history]}


@router.post("/policy")
async def publish_policy(payload: PolicyPublish, auth: AuthContext = Depends(require_superadmin_csrf), db: AsyncSession = Depends(get_db)) -> dict:
    revision, _ = await current_policy(db)
    if revision != payload.expected_revision:
        raise HTTPException(status_code=409, detail="Politiku už zmenil iný správca. Obnov stránku pred publikovaním.")
    content = payload.content.model_dump(mode="json")
    if not all(content[key][lang] for key in ("research", "gdpr") for lang in ("sk", "en")):
        raise HTTPException(status_code=422, detail="Vyplň texty oboch súhlasov v slovenčine aj angličtine.")
    db.add(SecurityPolicy(revision=revision + 1, payload=content, published_by=auth.user.id))
    record_event(db, auth, "policy", "policy.published", revision=revision + 1)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Politiku už zmenil iný správca. Obnov stránku pred publikovaním.")
    return await policy(auth, db)


@router.get("/events")
async def events(category: str | None = Query(default=None, pattern="^(policy|request|export|account|erasure|session|consent)$"),
                 since: datetime | None = None, until: datetime | None = None,
                 offset: int = Query(default=0, ge=0), limit: int = Query(default=40, ge=1, le=200),
                 auth: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    filters = []
    if category:
        filters.append(SecurityEvent.category == category)
    if since:
        filters.append(SecurityEvent.created_at >= since)
    if until:
        filters.append(SecurityEvent.created_at < until)
    total = await db.scalar(select(func.count()).select_from(SecurityEvent).where(*filters)) or 0
    rows = await db.scalars(select(SecurityEvent).where(*filters).order_by(SecurityEvent.created_at.desc(), SecurityEvent.id.desc()).offset(offset).limit(limit))
    return {"total": total, "items": [{"id": row.id, "category": row.category, "action": row.action,
            "actor_id": row.actor_id, "actor_role": row.actor_role, "target_id": row.target_id,
            "details": row.details, "created_at": row.created_at} for row in rows]}
