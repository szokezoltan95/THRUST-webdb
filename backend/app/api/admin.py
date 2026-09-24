import base64
import hashlib
import secrets
import string
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, effective_role, require_admin, require_csrf, require_researcher, require_superadmin_csrf
from app.core.config import settings
from app.db.session import get_db
from app.models import AdminSession, AdminUser, Measurement, Participant, TestDefinition
from app.schemas.participant import ParticipantCreate, ParticipantResponse, ParticipantUpdate, RegisteredStudentResponse
from app.schemas.user_admin import AccountPasswordReset, AccountRoleUpdate, AdminAccountResponse
from app.core.security import hash_password
from app.schemas.measurement import MeasurementCreate, MeasurementResponse
from app.schemas.test_definition import TestDefinitionCreate, TestDefinitionResponse, TestDefinitionUpdate

router = APIRouter(prefix="/admin", tags=["administration"])

CODE_ALPHABET = string.ascii_uppercase + string.digits


def generate_participant_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))


def normalize_test_configuration(source: dict, analysis_profile: str = "SCOPE_STEP_RESPONSE_V1") -> dict:
    """Remove machine-local controls while retaining each mode's test parameters."""
    configuration = dict(source)
    for key in (
        "user", "profile_name", "expert_mode", "output_root", "use_dated_subfolders",
        "joystick_index", "break_axis", "reset_axis", "axis_map", "deadzone",
    ):
        configuration.pop(key, None)

    profile = analysis_profile.strip().upper()
    if profile.startswith("SCOPE"):
        if isinstance(configuration.get("difficulty"), str):
            configuration["difficulty"] = configuration["difficulty"].lower()
        # SCoPE measurements require a raw source log for WebDB archival.
        configuration["save_raw_log"] = True
        if configuration.get("run_evaluation", False):
            configuration["save_step_file"] = True
        if not configuration.get("run_evaluation", False):
            configuration["auto_open_graph"] = False
            configuration["show_graph"] = False
        if not configuration.get("save_graph_pdf", False):
            configuration["auto_open_graph"] = False
    elif profile.startswith("SIMPLE"):
        # Each image is kept in the persistent measurement volume, never as a server path in JSON.
        for key in ("visual", "gui_gimbal_size", "gui_stick_size", "target_zone_radius_px"):
            configuration.pop(key, None)
        image_id = configuration.get("background_image_id")
        if image_id not in (None, ""):
            from app.api.backgrounds import background_metadata
            try:
                background_metadata(str(image_id))
            except HTTPException as exc:
                raise HTTPException(status_code=422, detail="Vybraný obrázok pozadia neexistuje.") from exc
        else:
            configuration.pop("background_image_id", None)
    return configuration


@router.get("/participants", response_model=list[ParticipantResponse])
async def list_participants(
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> list[Participant]:
    result = await db.scalars(select(Participant).order_by(Participant.created_at.desc()))
    return list(result)


@router.get("/users", response_model=list[AdminAccountResponse])
async def list_accounts(
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(AdminUser, Participant)
        .outerjoin(Participant, Participant.id == AdminUser.participant_id)
        .where(AdminUser.is_active.is_(True))
        .order_by(AdminUser.created_at.desc())
    )
    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "effective_role": effective_role(user),
            "is_active": user.is_active and (participant.is_active if participant else True),
            "participant_id": participant.id if participant else None,
            "participant_code": participant.participant_code if participant else None,
            "created_at": user.created_at,
        }
        for user, participant in result.all()
    ]


@router.patch("/users/{user_id}/role", response_model=AdminAccountResponse)
async def update_account_role(
    user_id: str,
    payload: AccountRoleUpdate,
    auth: AuthContext = Depends(require_superadmin_csrf),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await db.get(AdminUser, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Používateľ neexistuje.")
    if target.id == auth.user.id or effective_role(target) == "superadmin":
        raise HTTPException(status_code=409, detail="Rolu superadmin účtu nemožno meniť cez toto rozhranie.")
    if payload.role == "student" and not target.participant_id:
        participant_code = None
        for _ in range(30):
            candidate = generate_participant_code()
            if await db.scalar(select(Participant.id).where(Participant.participant_code == candidate)) is None:
                participant_code = candidate
                break
        if participant_code is None:
            raise HTTPException(status_code=503, detail="Participant ID sa nepodarilo vygenerovať.")
        participant = Participant(participant_code=participant_code)
        db.add(participant)
        await db.flush()
        target.participant_id = participant.id
    target.role = payload.role
    await db.commit()
    participant = await db.get(Participant, target.participant_id) if target.participant_id else None
    return {
        "id": target.id, "username": target.username, "email": target.email,
        "first_name": target.first_name, "last_name": target.last_name,
        "role": target.role, "effective_role": effective_role(target),
        "is_active": target.is_active and (participant.is_active if participant else True),
        "participant_id": participant.id if participant else None,
        "participant_code": participant.participant_code if participant else None,
        "created_at": target.created_at,
    }


@router.post("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_account_password(
    user_id: str,
    payload: AccountPasswordReset,
    auth: AuthContext = Depends(require_superadmin_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    target = await db.get(AdminUser, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Používateľ neexistuje.")
    if target.id == auth.user.id or effective_role(target) == "superadmin":
        raise HTTPException(status_code=409, detail="Heslo superadmin účtu nemožno resetovať cez toto rozhranie.")
    target.password_hash = hash_password(payload.password)
    await db.execute(delete(AdminSession).where(AdminSession.user_id == target.id))
    await db.commit()


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def anonymize_account(
    user_id: str,
    auth: AuthContext = Depends(require_superadmin_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    target = await db.get(AdminUser, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Používateľ neexistuje.")
    if target.id == auth.user.id or effective_role(target) == "superadmin":
        raise HTTPException(status_code=409, detail="Superadmin účet nemožno odstrániť cez toto rozhranie.")
    participant = await db.get(Participant, target.participant_id) if target.participant_id else None
    if participant is not None:
        measurement_count = await db.scalar(
            select(func.count()).select_from(Measurement).where(Measurement.participant_id == participant.id)
        ) or 0
        if measurement_count == 0:
            await db.delete(participant)
    target.username = f"deleted-{target.id}"
    target.email = None
    target.first_name = None
    target.last_name = None
    target.is_active = False
    await db.execute(delete(AdminSession).where(AdminSession.user_id == target.id))
    await db.commit()


@router.delete("/participants/{participant_id}/purge", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_participant(
    participant_id: str,
    auth: AuthContext = Depends(require_superadmin_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    participant = await db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Účastník neexistuje.")

    linked_account = await db.scalar(select(AdminUser).where(AdminUser.participant_id == participant.id))
    if linked_account is not None and (
        linked_account.id == auth.user.id or effective_role(linked_account) == "superadmin"
    ):
        raise HTTPException(status_code=409, detail="Superadmin účet alebo jeho Participant ID nemožno úplne odstrániť.")

    measurements = list(await db.scalars(
        select(Measurement).where(Measurement.participant_id == participant.id)
    ))
    storage_root = Path(settings.measurement_storage_path).resolve()
    raw_paths: list[Path] = []
    for measurement in measurements:
        if not measurement.raw_storage_path:
            continue
        raw_path = Path(measurement.raw_storage_path).resolve()
        try:
            raw_path.relative_to(storage_root)
        except ValueError as exc:
            raise HTTPException(status_code=500, detail="Raw súbor je mimo úložiska meraní; vymazanie bolo zastavené.") from exc
        raw_paths.append(raw_path)

    try:
        for raw_path in raw_paths:
            raw_path.unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Raw súbor merania sa nepodarilo odstrániť.") from exc

    await db.execute(delete(Measurement).where(Measurement.participant_id == participant.id))
    await db.execute(delete(AdminUser).where(AdminUser.participant_id == participant.id))
    await db.delete(participant)
    await db.commit()


@router.delete("/users/{user_id}/purge", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_account(
    user_id: str,
    auth: AuthContext = Depends(require_superadmin_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    target = await db.get(AdminUser, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Používateľ neexistuje.")
    if target.id == auth.user.id or effective_role(target) == "superadmin":
        raise HTTPException(status_code=409, detail="Superadmin účet nemožno úplne odstrániť.")
    if target.participant_id:
        raise HTTPException(status_code=409, detail="Účet je prepojený s účastníkom; úplné vymazanie spusti z detailu účastníka.")
    await db.delete(target)
    await db.commit()


@router.get("/students", response_model=list[RegisteredStudentResponse])
async def list_registered_students(
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(AdminUser, Participant)
        .join(Participant, Participant.id == AdminUser.participant_id)
        .where(AdminUser.role == "student", AdminUser.is_active.is_(True))
        .order_by(Participant.created_at.desc())
    )
    return [
        {
            "participant_id": participant.id,
            "participant_code": participant.participant_code,
            "email": user.email or user.username,
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
            "is_active": user.is_active and participant.is_active,
            "created_at": participant.created_at,
        }
        for user, participant in result.all()
    ]


@router.post("/participants", response_model=ParticipantResponse, status_code=status.HTTP_201_CREATED)
async def create_participant(
    payload: ParticipantCreate,
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Participant:
    existing = await db.scalar(select(Participant).where(Participant.participant_code == payload.participant_code))
    if existing:
        raise HTTPException(status_code=409, detail="Toto ID už existuje.")
    participant = Participant(participant_code=payload.participant_code)
    db.add(participant)
    await db.commit()
    await db.refresh(participant)
    return participant


@router.patch("/participants/{participant_id}", response_model=ParticipantResponse)
async def update_participant(
    participant_id: str,
    payload: ParticipantUpdate,
    auth: AuthContext = Depends(require_csrf),
    db: AsyncSession = Depends(get_db),
) -> Participant:
    participant = await db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Účastník neexistuje.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(participant, field, value)
    await db.commit()
    await db.refresh(participant)
    return participant


@router.get("/participants/generate-code")
async def generate_code(
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    for _ in range(20):
        code = generate_participant_code()
        existing = await db.scalar(select(Participant.id).where(Participant.participant_code == code))
        if existing is None:
            return {"participant_code": code}
    raise HTTPException(status_code=503, detail="Nové ID sa nepodarilo vygenerovať.")


@router.get("/tests", response_model=list[TestDefinitionResponse])
async def list_tests(
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> list[TestDefinition]:
    result = await db.scalars(select(TestDefinition).order_by(TestDefinition.test_code, TestDefinition.version))
    return list(result)


@router.get("/tests/{test_id}/configuration")
async def test_configuration(
    test_id: str,
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a version-pinned test manifest for local THRUST/SCoPE clients."""
    test = await db.get(TestDefinition, test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Typ testu neexistuje.")
    return {
        "schema_version": "test-configuration-v1",
        "test": TestDefinitionResponse.model_validate(test).model_dump(mode="json"),
    }


@router.post("/tests", response_model=TestDefinitionResponse, status_code=status.HTTP_201_CREATED)
async def create_test(
    payload: TestDefinitionCreate,
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> TestDefinition:
    existing = await db.scalar(
        select(TestDefinition).where(
            TestDefinition.test_code == payload.test_code,
            TestDefinition.version == payload.version,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Táto verzia testu už existuje.")
    data = payload.model_dump()
    data["configuration"] = normalize_test_configuration(data["configuration"], data["analysis_profile"])
    test = TestDefinition(**data)
    db.add(test)
    await db.commit()
    await db.refresh(test)
    return test


@router.patch("/tests/{test_id}", response_model=TestDefinitionResponse)
async def update_test(
    test_id: str,
    payload: TestDefinitionUpdate,
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> TestDefinition:
    test = await db.get(TestDefinition, test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Typ testu neexistuje.")
    if test.status != "draft":
        raise HTTPException(status_code=409, detail="Aktívny test už nie je možné upravovať.")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        test.name = data["name"]
    if "configuration" in data and data["configuration"] is not None:
        configuration = normalize_test_configuration(data["configuration"], test.analysis_profile)
        test.configuration = configuration
    await db.commit()
    await db.refresh(test)
    return test


@router.delete("/tests/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_definition(
    test_id: str,
    auth: AuthContext = Depends(require_superadmin_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    test = await db.get(TestDefinition, test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Verzia testu neexistuje.")
    measurements = list(await db.scalars(
        select(Measurement).where(Measurement.test_definition_id == test_id)
    ))
    storage_root = Path(settings.measurement_storage_path).resolve()
    raw_paths: list[Path] = []
    for measurement in measurements:
        if not measurement.raw_storage_path:
            continue
        raw_path = Path(measurement.raw_storage_path).resolve()
        try:
            raw_path.relative_to(storage_root)
        except ValueError as exc:
            raise HTTPException(status_code=500, detail="Raw súbor je mimo úložiska meraní; vymazanie bolo zastavené.") from exc
        raw_paths.append(raw_path)

    try:
        for raw_path in raw_paths:
            raw_path.unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Raw súbor merania sa nepodarilo odstrániť.") from exc

    await db.execute(delete(Measurement).where(Measurement.test_definition_id == test_id))
    await db.delete(test)
    await db.commit()


@router.get("/participants/{participant_id}")
async def participant_detail(
    participant_id: str,
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    participant = await db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Účastník neexistuje.")
    measurements = await db.scalars(
        select(Measurement).where(Measurement.participant_id == participant_id).order_by(Measurement.started_at.desc())
    )
    return {
        "participant": ParticipantResponse.model_validate(participant).model_dump(mode="json"),
        "measurements": [
            {
                "id": item.id,
                "test_type": item.test_type,
                "status": item.status,
                "started_at": item.started_at,
                "created_at": item.created_at,
                "raw_data_available": item.raw_storage_path is not None,
            }
            for item in measurements
        ],
    }


@router.post("/measurements", response_model=MeasurementResponse, status_code=status.HTTP_201_CREATED)
async def create_measurement(
    payload: MeasurementCreate,
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> Measurement:
    participant = await db.get(Participant, payload.participant_id)
    if participant is None or not participant.is_active:
        raise HTTPException(status_code=404, detail="Aktívny účastník neexistuje.")
    test = await db.get(TestDefinition, payload.test_definition_id)
    if test is None or not test.is_active:
        raise HTTPException(status_code=404, detail="Aktívny typ testu neexistuje.")

    raw_bytes: bytes | None = None
    raw_sha256: str | None = None
    if payload.raw_log_base64:
        try:
            raw_bytes = base64.b64decode(payload.raw_log_base64, validate=True)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail="Raw log nie je platný Base64 súbor.") from exc
        if not raw_bytes:
            raise HTTPException(status_code=400, detail="Raw log je prázdny.")
        if len(raw_bytes) > settings.max_raw_upload_bytes:
            raise HTTPException(status_code=413, detail="Raw log prekračuje povolenú veľkosť.")
        raw_sha256 = hashlib.sha256(raw_bytes).hexdigest()

    measurement = Measurement(
        participant_id=participant.id,
        test_definition_id=test.id,
        test_type=f"{test.test_code} v{test.version}",
        status=payload.status,
        started_at=payload.started_at,
        source_file_name=payload.source_file_name,
        analysis_data=payload.analysis_data,
        raw_sha256=raw_sha256,
        raw_size_bytes=len(raw_bytes) if raw_bytes is not None else None,
        raw_content_type=payload.raw_content_type if raw_bytes is not None else None,
    )
    db.add(measurement)
    await db.flush()

    if raw_bytes is not None:
        storage_root = Path(settings.measurement_storage_path).resolve()
        storage_root.mkdir(parents=True, exist_ok=True)
        target = storage_root / f"{measurement.id}.raw"
        target.write_bytes(raw_bytes)
        measurement.raw_storage_path = str(target)
        measurement.raw_data = {"storage": "filesystem", "sha256": raw_sha256}

    await db.commit()
    await db.refresh(measurement)
    return measurement


@router.get("/measurements", response_model=list[MeasurementResponse])
async def list_measurements(
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> list[Measurement]:
    """List measurements synchronized by THRUST or uploaded manually."""
    result = await db.scalars(select(Measurement).order_by(Measurement.started_at.desc()))
    return list(result)


@router.get("/measurements/{measurement_id}", response_model=MeasurementResponse)
async def measurement_detail(
    measurement_id: str,
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> Measurement:
    measurement = await db.get(Measurement, measurement_id)
    if measurement is None:
        raise HTTPException(status_code=404, detail="Meranie neexistuje.")
    return measurement


@router.delete("/measurements/{measurement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_measurement(
    measurement_id: str,
    auth: AuthContext = Depends(require_superadmin_csrf),
    db: AsyncSession = Depends(get_db),
) -> None:
    measurement = await db.get(Measurement, measurement_id)
    if measurement is None:
        raise HTTPException(status_code=404, detail="Meranie neexistuje.")
    if measurement.raw_storage_path:
        try:
            Path(measurement.raw_storage_path).unlink(missing_ok=True)
        except OSError as exc:
            raise HTTPException(status_code=500, detail="Raw súbor sa nepodarilo odstrániť.") from exc
    await db.delete(measurement)
    await db.commit()


@router.get("/overview")
async def overview(
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    participants = await db.scalar(select(func.count()).select_from(Participant)) or 0
    measurements = await db.scalar(
        select(func.count()).select_from(Measurement).where(Measurement.raw_storage_path.is_not(None))
    ) or 0
    return {
        "username": auth.user.username,
        "role": auth.user.role,
        "participant_count": participants,
        "measurement_count": measurements,
    }
