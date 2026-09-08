from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, require_admin, require_csrf
from app.core.config import settings
from app.core.security import new_csrf_token, new_session_token, session_token_hash, verify_password
from app.db.session import get_db
from app.models import AdminSession, AdminUser
from app.schemas.auth import LoginRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login", response_model=UserResponse)
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> UserResponse:
    result = await db.execute(select(AdminUser).where(AdminUser.username == payload.username))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = new_session_token()
    csrf = new_csrf_token()
    expires = datetime.now(timezone.utc) + timedelta(hours=settings.session_lifetime_hours)
    db.add(AdminSession(token_hash=session_token_hash(token), user_id=user.id, csrf_token=csrf, expires_at=expires))
    await db.commit()

    response.set_cookie(
        "thrust_session",
        token,
        max_age=settings.session_lifetime_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return UserResponse(username=user.username, role=user.role, csrf_token=csrf)


@router.get("/me", response_model=UserResponse)
async def me(auth: AuthContext = Depends(require_admin)) -> UserResponse:
    return UserResponse(username=auth.user.username, role=auth.user.role, csrf_token=auth.session.csrf_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    auth: AuthContext = Depends(require_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.execute(delete(AdminSession).where(AdminSession.token_hash == auth.session.token_hash))
    await db.commit()
    response.delete_cookie("thrust_session", path="/")

