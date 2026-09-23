from datetime import datetime, timedelta, timezone
import hmac

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, effective_role, require_authenticated, require_user_csrf
from app.core.config import settings
from app.core.consents import GDPR_CONSENT_VERSION, RESEARCH_CONSENT_TEXT, RESEARCH_CONSENT_VERSION, gdpr_consent_text
from app.core.security import (
    hash_password,
    new_csrf_token,
    new_participant_code,
    new_session_token,
    session_token_hash,
    verify_password,
)
from app.db.session import get_db
from app.models import AdminSession, AdminUser, Participant, ResearchConsent
from app.schemas.auth import LoginRequest, RegistrationRequest, ResearcherRegistrationRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["authentication"])

def response_for_user(user: AdminUser, csrf_token: str, participant_code: str | None = None) -> UserResponse:
    return UserResponse(
        username=user.username,
        email=user.email,
        role=effective_role(user),
        csrf_token=csrf_token,
        participant_id=user.participant_id,
        participant_code=participant_code,
        first_name=user.first_name,
        last_name=user.last_name,
    )


async def create_session(user: AdminUser, response: Response, db: AsyncSession) -> UserResponse:
    token = new_session_token()
    csrf = new_csrf_token()
    expires = datetime.now(timezone.utc) + timedelta(hours=settings.session_lifetime_hours)
    db.add(AdminSession(token_hash=session_token_hash(token), user_id=user.id, csrf_token=csrf, expires_at=expires))
    participant_code = None
    if user.participant_id:
        participant = await db.get(Participant, user.participant_id)
        participant_code = participant.participant_code if participant is not None else None
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
    return response_for_user(user, csrf, participant_code)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegistrationRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    if not payload.research_consent or not payload.gdpr_consent:
        raise HTTPException(status_code=400, detail="Na registráciu sú potrebné oba samostatné súhlasy.")

    email = str(payload.email).strip().lower()
    if await db.scalar(select(AdminUser.id).where(AdminUser.email == email)):
        raise HTTPException(status_code=409, detail="Účet s týmto e-mailom už existuje.")

    participant_code = None
    for _ in range(30):
        candidate = new_participant_code()
        if await db.scalar(select(Participant.id).where(Participant.participant_code == candidate)) is None:
            participant_code = candidate
            break
    if participant_code is None:
        raise HTTPException(status_code=503, detail="Participant ID sa nepodarilo vygenerovať.")

    participant = Participant(
        participant_code=participant_code,
        birth_date=payload.birth_date,
        pilot_experience=payload.pilot_experience,
        flight_hours_range=payload.flight_hours_range,
        pilot_certificate=payload.pilot_certificate,
        primary_uav_type=payload.primary_uav_type,
        simulator_experience=payload.simulator_experience,
        self_rated_skill=payload.self_rated_skill,
        sex=payload.sex,
        dominant_hand=payload.dominant_hand,
        vision_correction=payload.vision_correction,
        vision_diopters_left=payload.vision_diopters_left,
        vision_diopters_right=payload.vision_diopters_right,
        rc_experience=payload.rc_experience,
        fpv_experience=payload.fpv_experience,
        game_controller_experience=payload.game_controller_experience,
        video_game_experience=payload.video_game_experience,
    )
    db.add(participant)
    await db.flush()
    user = AdminUser(
        username=email,
        email=email,
        password_hash=hash_password(payload.password),
        role="student",
        first_name=payload.first_name,
        last_name=payload.last_name,
        participant_id=participant.id,
    )
    db.add(user)
    await db.flush()
    db.add_all([
        ResearchConsent(
            user_id=user.id,
            consent_type="research",
            version=payload.consent_version or RESEARCH_CONSENT_VERSION,
            text_snapshot=RESEARCH_CONSENT_TEXT,
        ),
        ResearchConsent(
            user_id=user.id,
            consent_type="gdpr",
            version=payload.gdpr_consent_version or GDPR_CONSENT_VERSION,
            text_snapshot=gdpr_consent_text(),
        ),
    ])
    await db.commit()
    return await create_session(user, response, db)


@router.post("/register/researcher", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_researcher(
    payload: ResearcherRegistrationRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    if not payload.gdpr_consent:
        raise HTTPException(status_code=400, detail="Na registráciu výskumníka je potrebný súhlas so spracovaním údajov.")

    expected_key = settings.researcher_registration_key
    if not expected_key:
        raise HTTPException(status_code=503, detail="Registrácia výskumníkov nie je na serveri nakonfigurovaná.")
    if len(expected_key) < 32:
        raise HTTPException(status_code=503, detail="Pozývací kľúč výskumníka musí mať aspoň 32 znakov.")
    if not hmac.compare_digest(payload.registration_key, expected_key):
        raise HTTPException(status_code=403, detail="Pozývací kľúč výskumníka nie je platný.")

    email = str(payload.email).strip().lower()
    superadmin_identifiers = {
        item.strip().lower() for item in settings.superadmin_identifiers.split(",") if item.strip()
    }
    if email in superadmin_identifiers:
        raise HTTPException(status_code=409, detail="Tento e-mail je vyhradený pre superadmin účet.")
    if await db.scalar(select(AdminUser.id).where((AdminUser.email == email) | (AdminUser.username == email))):
        raise HTTPException(status_code=409, detail="Účet s týmto e-mailom už existuje.")

    user = AdminUser(
        username=email,
        email=email,
        password_hash=hash_password(payload.password),
        role="researcher",
        first_name=payload.first_name,
        last_name=payload.last_name,
        participant_id=None,
    )
    db.add(user)
    await db.flush()
    db.add(ResearchConsent(
        user_id=user.id,
        consent_type="gdpr",
        version=payload.gdpr_consent_version or GDPR_CONSENT_VERSION,
        text_snapshot=gdpr_consent_text(),
    ))
    await db.commit()
    return await create_session(user, response, db)


@router.post("/login", response_model=UserResponse)
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> UserResponse:
    raw_identifier = (payload.identifier or payload.username or "").strip()
    if not raw_identifier:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Login identifier is required")
    identifier = raw_identifier.lower()
    participant_code = raw_identifier.upper()
    user = await db.scalar(
        select(AdminUser).where((AdminUser.username == identifier) | (AdminUser.email == identifier))
    )
    if user is None:
        user = await db.scalar(
            select(AdminUser)
            .join(Participant, Participant.id == AdminUser.participant_id)
            .where(Participant.participant_code == participant_code)
        )
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return await create_session(user, response, db)


@router.get("/me", response_model=UserResponse)
async def me(
    auth: AuthContext = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    participant_code = None
    if auth.user.participant_id:
        participant = await db.get(Participant, auth.user.participant_id)
        participant_code = participant.participant_code if participant is not None else None
    return response_for_user(auth.user, auth.session.csrf_token, participant_code)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    auth: AuthContext = Depends(require_user_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.execute(delete(AdminSession).where(AdminSession.token_hash == auth.session.token_hash))
    await db.commit()
    response.delete_cookie("thrust_session", path="/")
