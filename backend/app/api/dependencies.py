from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import session_token_hash
from app.db.session import get_db
from app.models import AdminSession, AdminUser


@dataclass
class AuthContext:
    user: AdminUser
    session: AdminSession


def effective_role(user: AdminUser) -> str:
    identifiers = {item.strip().lower() for item in settings.superadmin_identifiers.split(",") if item.strip()}
    login_names = {user.username.lower()}
    if user.email:
        login_names.add(user.email.lower())
    return "superadmin" if identifiers.intersection(login_names) else user.role


async def require_session(
    thrust_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> AuthContext:
    if not thrust_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    result = await db.execute(
        select(AdminSession, AdminUser)
        .join(AdminUser, AdminUser.id == AdminSession.user_id)
        .where(AdminSession.token_hash == session_token_hash(thrust_session))
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    session_record, user = row
    if not user.is_active or session_record.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return AuthContext(user=user, session=session_record)


async def require_authenticated(auth: AuthContext = Depends(require_session)) -> AuthContext:
    return auth


async def require_researcher(auth: AuthContext = Depends(require_session)) -> AuthContext:
    if effective_role(auth.user) not in {"researcher", "admin", "superadmin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Researcher access required")
    return auth


async def require_admin(auth: AuthContext = Depends(require_session)) -> AuthContext:
    if effective_role(auth.user) not in {"admin", "superadmin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return auth


async def require_superadmin(auth: AuthContext = Depends(require_session)) -> AuthContext:
    if effective_role(auth.user) != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required")
    return auth


async def require_user_csrf(
    auth: AuthContext = Depends(require_session),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> AuthContext:
    if not csrf_token or csrf_token != auth.session.csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    return auth


async def require_csrf(
    auth: AuthContext = Depends(require_admin),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> AuthContext:
    if not csrf_token or csrf_token != auth.session.csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    return auth


async def require_researcher_csrf(
    auth: AuthContext = Depends(require_researcher),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> AuthContext:
    if not csrf_token or csrf_token != auth.session.csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    return auth


async def require_superadmin_csrf(
    auth: AuthContext = Depends(require_superadmin),
    csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> AuthContext:
    if not csrf_token or csrf_token != auth.session.csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    return auth
