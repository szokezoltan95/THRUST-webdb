from datetime import datetime, timedelta, timezone
import asyncio
import hashlib
import hmac
import secrets
import smtplib
import ssl
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, effective_role, require_authenticated, require_user_csrf
from app.core.config import settings
from app.core.consents import GDPR_CONSENT_VERSION, RESEARCH_CONSENT_VERSION, gdpr_consent_text, research_consent_text
from app.core.security import (
    hash_password,
    new_csrf_token,
    new_participant_code,
    new_session_token,
    session_token_hash,
    verify_password,
)
from app.db.session import get_db
from app.models import AdminSession, AdminUser, Participant, PendingRegistration, ResearchConsent
from app.schemas.auth import AppearancePreferences, LoginRequest, RegistrationRequest, RegistrationStart, RegistrationVerify, ResearcherRegistrationRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["authentication"])


def _digest(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _code_digest(password_hash: str, code: str) -> str:
    return hmac.new(password_hash.encode("utf-8"), code.encode("ascii"), hashlib.sha256).hexdigest()


def _is_reserved_superadmin_email(email: str) -> bool:
    return email in {value.strip().lower() for value in settings.superadmin_identifiers.split(",") if value.strip()}


def _send_verification_email(email: str, code: str) -> None:
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = email
    message["Subject"] = "THRUST – potvrdenie e-mailu / e-mail verification"
    message.set_content(
        f"Overovací kód pre registráciu THRUST: {code}\n"
        f"THRUST registration verification code: {code}\n\n"
        "Kód platí 15 minút. Ak ste o registráciu nežiadali, správu ignorujte.\n"
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.ehlo()
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


@router.post("/register/start", status_code=status.HTTP_202_ACCEPTED)
async def start_registration(payload: RegistrationStart, db: AsyncSession = Depends(get_db)) -> dict:
    if not settings.smtp_host or not settings.smtp_from:
        raise HTTPException(status_code=503, detail="Odosielanie overovacích e-mailov nie je nakonfigurované.")
    email = str(payload.email).strip().lower()
    if _is_reserved_superadmin_email(email):
        raise HTTPException(status_code=409, detail="Tento e-mail je vyhradený pre superadmin účet.")
    if await db.scalar(select(AdminUser.id).where(AdminUser.email == email)):
        raise HTTPException(status_code=409, detail="Účet s týmto e-mailom už existuje.")
    now = datetime.now(timezone.utc)
    pending = await db.scalar(select(PendingRegistration).where(PendingRegistration.email == email).with_for_update())
    if pending and pending.sent_at.replace(tzinfo=timezone.utc) + timedelta(seconds=60) > now:
        raise HTTPException(status_code=429, detail="Pred ďalším odoslaním kódu počkajte jednu minútu.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    # Send before committing. An SMTP error never creates a usable pending registration.
    try:
        await asyncio.to_thread(_send_verification_email, email, code)
    except (OSError, smtplib.SMTPException) as exc:
        raise HTTPException(status_code=503, detail="Overovací e-mail sa nepodarilo odoslať.") from exc
    if pending is None:
        pending = PendingRegistration(email=email)
        db.add(pending)
    pending.password_hash = hash_password(payload.password)
    pending.code_hash = _code_digest(pending.password_hash, code)
    pending.token_hash = None
    pending.attempts = 0
    pending.sent_at = now
    pending.expires_at = now + timedelta(minutes=15)
    await db.commit()
    return {"message": "Overovací kód bol odoslaný.", "expires_in_seconds": 900}


@router.post("/register/verify")
async def verify_registration(payload: RegistrationVerify, db: AsyncSession = Depends(get_db)) -> dict:
    email = str(payload.email).strip().lower()
    pending = await db.scalar(select(PendingRegistration).where(PendingRegistration.email == email).with_for_update())
    now = datetime.now(timezone.utc)
    if not pending or pending.expires_at.replace(tzinfo=timezone.utc) <= now or pending.attempts >= 5:
        raise HTTPException(status_code=400, detail="Kód expiroval. Požiadajte o nový.")
    pending.attempts += 1
    if not hmac.compare_digest(pending.code_hash, _code_digest(pending.password_hash, payload.code)):
        await db.commit()
        raise HTTPException(status_code=400, detail="Nesprávny overovací kód.")
    token = secrets.token_urlsafe(32)
    pending.token_hash = _digest(token)
    pending.code_hash = _digest(secrets.token_urlsafe(32))
    pending.expires_at = now + timedelta(minutes=30)
    await db.commit()
    return {"verification_token": token}

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
        accent_theme=user.accent_theme,
        color_mode=user.color_mode,
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
    if _is_reserved_superadmin_email(email):
        raise HTTPException(status_code=409, detail="Tento e-mail je vyhradený pre superadmin účet.")
    pending = await db.scalar(select(PendingRegistration).where(PendingRegistration.email == email).with_for_update())
    if (not pending or not pending.token_hash
            or pending.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc)
            or not hmac.compare_digest(pending.token_hash, _digest(payload.verification_token))
            or not verify_password(payload.password, pending.password_hash)):
        raise HTTPException(status_code=400, detail="Najprv potvrďte e-mail; overenie môže byť neplatné alebo expirované.")
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
            text_snapshot=research_consent_text(payload.consent_language),
        ),
        ResearchConsent(
            user_id=user.id,
            consent_type="gdpr",
            version=payload.gdpr_consent_version or GDPR_CONSENT_VERSION,
            text_snapshot=gdpr_consent_text(payload.consent_language),
        ),
    ])
    await db.delete(pending)
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
    if not hmac.compare_digest(payload.registration_key, expected_key):
        raise HTTPException(status_code=403, detail="Pozývací kľúč výskumníka nie je platný.")

    email = str(payload.email).strip().lower()
    if _is_reserved_superadmin_email(email):
        raise HTTPException(status_code=409, detail="Tento e-mail je vyhradený pre superadmin účet.")
    superadmin_identifiers = {
        item.strip().lower() for item in settings.superadmin_identifiers.split(",") if item.strip()
    }
    if email in superadmin_identifiers:
        raise HTTPException(status_code=409, detail="Tento e-mail je vyhradený pre superadmin účet.")
    pending = await db.scalar(select(PendingRegistration).where(PendingRegistration.email == email).with_for_update())
    if (not pending or not pending.token_hash
            or pending.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc)
            or not hmac.compare_digest(pending.token_hash, _digest(payload.verification_token))
            or not verify_password(payload.password, pending.password_hash)):
        raise HTTPException(status_code=400, detail="Najprv potvrďte e-mail; overenie môže byť neplatné alebo expirované.")
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
        text_snapshot=gdpr_consent_text(payload.consent_language),
    ))
    await db.delete(pending)
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


@router.put("/preferences", response_model=AppearancePreferences)
async def update_appearance_preferences(
    payload: AppearancePreferences,
    auth: AuthContext = Depends(require_user_csrf),
    db: AsyncSession = Depends(get_db),
) -> AppearancePreferences:
    auth.user.accent_theme = payload.accent_theme
    auth.user.color_mode = payload.color_mode
    await db.commit()
    return AppearancePreferences(accent_theme=auth.user.accent_theme, color_mode=auth.user.color_mode)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    auth: AuthContext = Depends(require_user_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    await db.execute(delete(AdminSession).where(AdminSession.token_hash == auth.session.token_hash))
    await db.commit()
    response.delete_cookie("thrust_session", path="/")
