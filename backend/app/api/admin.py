import hashlib
import json
import tempfile
import zipfile
import math
import secrets
import string
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, effective_role, require_admin, require_csrf, require_researcher, require_researcher_csrf, require_superadmin_csrf
from app.api.student import _student_export_csv, _student_export_payload
from app.core.config import settings
from app.core.audit import record_event
from app.core.raw_logs import RawUploadInvalid, RawUploadTooLarge, decode_raw_upload
from app.core.measurement_results import validate_measurement_result
from app.core.consent_guard import require_active_consents, revoked_participant_consents
from app.core.live_updates import publish_measurements_updated
from app.core.live_updates import (client_for_disconnect, connected_clients_snapshot,
                                   notify_web_disconnect, request_measure_disconnect, unregister_client)
from app.db.session import get_db
from app.models import AdminSession, AdminUser, Measurement, HumanModelResult, Participant, ResearchConsent, TestDefinition, ParticipantGroup, StudentDataRequest
from app.schemas.participant_group import ParticipantGroupCreate, ParticipantGroupUpdate
from app.schemas.participant import ParticipantCreate, ParticipantResponse, ParticipantUpdate, RegisteredStudentResponse
from app.schemas.user_admin import AccountPasswordReset, AccountRoleUpdate, AdminAccountProfileUpdate, AdminAccountResponse, StudentDataRequestResponse, StudentDataRequestUpdate
from app.core.security import hash_password
from app.schemas.measurement import MeasurementCreate, MeasurementResponse
from app.schemas.test_definition import TestDefinitionCreate, TestDefinitionResponse, TestDefinitionUpdate

router = APIRouter(prefix="/admin", tags=["administration"])


def _group_response(group: ParticipantGroup) -> dict:
    members = sorted(group.members, key=lambda item: item.participant_code)
    return {"id": group.id, "name": group.name, "description": group.description,
            "created_at": group.created_at, "participant_ids": [item.id for item in members],
            "participant_codes": [item.participant_code for item in members]}


@router.get("/groups")
async def list_participant_groups(auth: AuthContext = Depends(require_researcher), db: AsyncSession = Depends(get_db)) -> list[dict]:
    groups = await db.scalars(select(ParticipantGroup).order_by(ParticipantGroup.name))
    return [_group_response(group) for group in groups]


@router.post("/groups", status_code=status.HTTP_201_CREATED)
async def create_participant_group(payload: ParticipantGroupCreate, auth: AuthContext = Depends(require_researcher_csrf), db: AsyncSession = Depends(get_db)) -> dict:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Názov skupiny nesmie byť prázdny.")
    if await db.scalar(select(ParticipantGroup.id).where(func.lower(ParticipantGroup.name) == name.lower())):
        raise HTTPException(status_code=409, detail="Skupina s týmto názvom už existuje.")
    ids = list(dict.fromkeys(payload.participant_ids))
    members = list(await db.scalars(select(Participant).where(Participant.id.in_(ids), Participant.is_active.is_(True)))) if ids else []
    if len(members) != len(ids):
        raise HTTPException(status_code=422, detail="Jeden alebo viac účastníkov neexistuje alebo je neaktívnych.")
    group = ParticipantGroup(name=name, description=payload.description, members=members)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return _group_response(group)


@router.patch("/groups/{group_id}")
async def update_participant_group(group_id: str, payload: ParticipantGroupUpdate, auth: AuthContext = Depends(require_researcher_csrf), db: AsyncSession = Depends(get_db)) -> dict:
    group = await db.get(ParticipantGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Skupina neexistuje.")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Názov skupiny nesmie byť prázdny.")
        duplicate = await db.scalar(select(ParticipantGroup.id).where(func.lower(ParticipantGroup.name) == name.lower(), ParticipantGroup.id != group.id))
        if duplicate:
            raise HTTPException(status_code=409, detail="Skupina s týmto názvom už existuje.")
        group.name = name
    if "description" in data:
        group.description = data["description"]
    if "participant_ids" in data and data["participant_ids"] is not None:
        ids = list(dict.fromkeys(data["participant_ids"]))
        members = list(await db.scalars(select(Participant).where(Participant.id.in_(ids), Participant.is_active.is_(True)))) if ids else []
        if len(members) != len(ids):
            raise HTTPException(status_code=422, detail="Jeden alebo viac účastníkov neexistuje alebo je neaktívnych.")
        group.members = members
    await db.commit()
    await db.refresh(group)
    return _group_response(group)


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_participant_group(group_id: str, auth: AuthContext = Depends(require_researcher_csrf), db: AsyncSession = Depends(get_db)) -> None:
    group = await db.get(ParticipantGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Skupina neexistuje.")
    await db.delete(group)
    await db.commit()

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
        if "timing_version" in configuration:
            timing_version = configuration["timing_version"]
            if isinstance(timing_version, bool) or not isinstance(timing_version, int) or timing_version not in (1, 2):
                raise HTTPException(status_code=422, detail="Neznáma verzia časovania SCoPE.")
        if configuration.get("timing_version", 1) == 2:
            mode = configuration.get("timing_mode", "original")
            if mode not in ("original", "fixed_duration"):
                raise HTTPException(status_code=422, detail="Neplatný režim časovania SCoPE.")
            ranges = (
                ("hold_time_min_s", "hold_time_max_s", 1.0, 1.0),
                ("task_duration_min_s", "task_duration_max_s", 3.0, 5.0),
            )
            try:
                for low_key, high_key, low_default, high_default in ranges:
                    low = float(configuration.get(low_key, low_default))
                    high = float(configuration.get(high_key, high_default))
                    if not math.isfinite(low) or not math.isfinite(high) or low <= 0 or low > high or high > 5:
                        raise ValueError
                if mode == "fixed_duration" and (
                    float(configuration.get("task_duration_min_s", 3.0)) < 3.0
                    or float(configuration.get("task_duration_max_s", 5.0)) > 5.0
                ):
                    raise ValueError
                if mode == "fixed_duration" and float(configuration.get("success_hold_s", 1.0)) > float(configuration.get("task_duration_min_s", 3.0)):
                    raise ValueError
                success_hold = float(configuration.get("success_hold_s", 1.0))
                raw_tasks = configuration.get("max_completed_actions", 50)
                if isinstance(raw_tasks, bool) or not isinstance(raw_tasks, int):
                    raise ValueError
                tasks = raw_tasks
                if not math.isfinite(success_hold) or success_hold <= 0 or success_hold > 5 or tasks < 1:
                    raise ValueError
            except (TypeError, ValueError, OverflowError) as exc:
                raise HTTPException(status_code=422, detail="Neplatné časové rozsahy alebo počet úloh SCoPE.") from exc
    elif profile.startswith("SIMPLE"):
        # Each image is kept in the persistent measurement volume, never as a server path in JSON.
        for key in ("visual", "gui_gimbal_size", "gui_stick_size", "target_zone_radius_px", "sampling_hz", "zoom_px_per_m"):
            configuration.pop(key, None)
        defaults = {
            "field_width_px": 1920, "field_height_px": 1080, "world_width_m": 4.5,
            "completion_radius_m": .1, "copter_radius_m": .08,
            "target_x_limit_m": 1.5, "target_y_min_m": .25, "target_y_max_m": 2.0,
            "target_pattern": "random", "route_points": 6,
        }
        values = {**defaults, **configuration}
        try:
            width, height = int(values["field_width_px"]), int(values["field_height_px"])
            world_width = float(values["world_width_m"])
            radius = float(values["completion_radius_m"])
            copter_radius = float(values["copter_radius_m"])
            x_limit = float(values["target_x_limit_m"])
            y_min, y_max = float(values["target_y_min_m"]), float(values["target_y_max_m"])
            route_points = int(values["route_points"])
            numbers = (world_width, radius, copter_radius, x_limit, y_min, y_max)
            if (width < 600 or height < 400 or width != values["field_width_px"]
                    or height != values["field_height_px"] or not all(map(math.isfinite, numbers))):
                raise ValueError("invalid field dimensions")
            margin = max(radius, copter_radius)
            world_height = world_width * height / width
            if (margin <= 0 or x_limit <= 0 or x_limit > world_width / 2 - margin
                    or y_min < margin or y_max > world_height - margin or y_min > y_max
                    or values["target_pattern"] not in ("random", "slalom", "circuit")
                    or not 4 <= route_points <= 20 or route_points != values["route_points"]):
                raise ValueError("targets outside playable field")
        except (TypeError, ValueError, ZeroDivisionError, OverflowError) as exc:
            raise HTTPException(status_code=422, detail="Ciele SimPLE musia zostať celé v ihrisku; skontroluj rozmery, výšky a trajektóriu.") from exc
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
) -> list[dict]:
    result = await db.scalars(select(Participant).order_by(Participant.created_at.desc()))
    flags = await revoked_participant_consents(db)
    return [{**ParticipantResponse.model_validate(item).model_dump(),
             "revoked_consents": flags.get(item.id, {})} for item in result
            if effective_role(auth.user) != "researcher" or item.id not in flags]


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
    record_event(db, auth, "account", "account.role_changed", target.id, previous_role=target.role, role=payload.role)
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
    target.must_change_password = target.role == "student"
    await db.execute(delete(AdminSession).where(AdminSession.user_id == target.id))
    record_event(db, auth, "account", "account.password_reset", target.id)
    await db.commit()


@router.get("/data-requests", response_model=list[StudentDataRequestResponse])
async def list_student_data_requests(
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(StudentDataRequest, AdminUser, Participant)
        .join(AdminUser, AdminUser.id == StudentDataRequest.user_id)
        .outerjoin(Participant, Participant.id == AdminUser.participant_id)
        .order_by(StudentDataRequest.created_at.desc())
    )
    return [
        {
            "id": item.id, "request_type": item.request_type, "details": item.details,
            "status": item.status, "response_note": item.response_note,
            "created_at": item.created_at, "updated_at": item.updated_at,
            "requester_email": user.email or user.username,
            "participant_code": participant.participant_code if participant else None,
            "requester_user_id": user.id,
            "participant_id": participant.id if participant else None,
        }
        for item, user, participant in result.all()
    ]


@router.get("/data-requests/{request_id}/export")
async def export_requested_student_data(
    request_id: str,
    export_format: str = Query(default="zip", alias="format", pattern="^(json|csv|zip)$"),
    auth: AuthContext = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(StudentDataRequest, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Žiadosť neexistuje.")
    if item.request_type not in {"access", "portability"}:
        raise HTTPException(status_code=409, detail="Tento typ žiadosti nevyžaduje export údajov.")
    student = await db.get(AdminUser, item.user_id)
    if student is None or student.role != "student" or not student.participant_id:
        raise HTTPException(status_code=409, detail="K žiadosti nie je priradený aktívny profil účastníka.")
    participant = await db.get(Participant, student.participant_id)
    if participant is None:
        raise HTTPException(status_code=409, detail="Profil účastníka neexistuje.")
    measurements = list(await db.scalars(select(Measurement).where(Measurement.participant_id == participant.id).order_by(Measurement.started_at.asc())))
    consents = list(await db.scalars(select(ResearchConsent).where(ResearchConsent.user_id == student.id).order_by(ResearchConsent.accepted_at.asc())))
    test_ids = {measurement.test_definition_id for measurement in measurements if measurement.test_definition_id}
    tests = {test.id: test for test in await db.scalars(select(TestDefinition).where(TestDefinition.id.in_(test_ids)))} if test_ids else {}
    payload = _student_export_payload(student, participant, measurements, consents, tests)
    csv_text = _student_export_csv(payload)
    if export_format == "json":
        record_event(db, auth, "export", "data.exported", item.id, format=export_format)
        await db.commit()
        return JSONResponse(payload, headers={"Content-Disposition": 'attachment; filename="thrust-student-data.json"'})
    if export_format == "csv":
        record_event(db, auth, "export", "data.exported", item.id, format=export_format)
        await db.commit()
        from fastapi.responses import Response
        return Response(csv_text, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="thrust-student-data.csv"'})
    handle = tempfile.NamedTemporaryFile(prefix="thrust-admin-export-", suffix=".zip", delete=False)
    handle.close()
    archive_path = Path(handle.name)
    storage_root = Path(settings.measurement_storage_path).resolve()
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("data.json", json.dumps(payload, ensure_ascii=False, indent=2))
        archive.writestr("data.csv", csv_text)
        for measurement in measurements:
            if not measurement.raw_storage_path:
                continue
            raw_path = Path(measurement.raw_storage_path).resolve()
            try:
                raw_path.relative_to(storage_root)
            except ValueError:
                continue
            if raw_path.is_file():
                archive.write(raw_path, f"raw/{measurement.id}-{Path(measurement.source_file_name or raw_path.name).name}", compress_type=zipfile.ZIP_STORED)
    try:
        record_event(db, auth, "export", "data.exported", item.id, format=export_format)
        await db.commit()
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise
    return FileResponse(archive_path, filename="thrust-student-data.zip", media_type="application/zip", background=BackgroundTask(archive_path.unlink, missing_ok=True))


@router.patch("/data-requests/{request_id}", response_model=StudentDataRequestResponse)
async def update_student_data_request(
    request_id: str,
    payload: StudentDataRequestUpdate,
    auth: AuthContext = Depends(require_csrf),
    db: AsyncSession = Depends(get_db),
) -> dict:
    item = await db.get(StudentDataRequest, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Žiadosť neexistuje.")
    record_event(db, auth, "request", "request.updated", item.id, previous_status=item.status, status=payload.status)
    item.status = payload.status
    item.response_note = payload.response_note
    item.handled_by_user_id = auth.user.id
    item.updated_at = datetime.now(timezone.utc)
    await db.commit()
    user = await db.get(AdminUser, item.user_id)
    participant = await db.get(Participant, user.participant_id) if user and user.participant_id else None
    return {
        "id": item.id, "request_type": item.request_type, "details": item.details,
        "status": item.status, "response_note": item.response_note,
        "created_at": item.created_at, "updated_at": item.updated_at,
        "requester_email": (user.email or user.username) if user else None,
        "participant_code": participant.participant_code if participant else None,
        "requester_user_id": user.id if user else None,
        "participant_id": participant.id if participant else None,
    }


@router.patch("/users/{user_id}/profile", response_model=AdminAccountResponse)
async def update_account_contact(
    user_id: str,
    payload: AdminAccountProfileUpdate,
    auth: AuthContext = Depends(require_csrf),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if effective_role(auth.user) not in {"admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Správu účtov môže vykonávať iba administrátor.")
    target = await db.get(AdminUser, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Používateľ neexistuje.")
    normalized_email = str(payload.email).strip().lower() if payload.email else None
    old_email = target.email
    if normalized_email and await db.scalar(select(AdminUser.id).where(((AdminUser.email == normalized_email) | (AdminUser.username == normalized_email)), AdminUser.id != target.id)):
        raise HTTPException(status_code=409, detail="Tento e-mail už používa iný účet.")
    target.email = normalized_email
    if normalized_email and target.username == old_email:
        target.username = normalized_email
    record_event(db, auth, "account", "account.contact_updated", target.id, fields=["email"])
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
    target.nickname = None
    target.is_active = False
    await db.execute(delete(AdminSession).where(AdminSession.user_id == target.id))
    record_event(db, auth, "erasure", "account.anonymized", target.id)
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
    record_event(db, auth, "erasure", "participant.purged", participant.id, measurement_count=len(measurements))
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
    record_event(db, auth, "erasure", "account.purged", target.id)
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
    record_event(db, auth, "account", "participant.updated", participant.id, fields=sorted(payload.model_fields_set))
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
    result = await db.scalars(select(TestDefinition).order_by(TestDefinition.is_active.desc(), TestDefinition.test_code, TestDefinition.version))
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
        "schema_version": "test-configuration-v2",
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
        raise HTTPException(status_code=409, detail="Finalizovaný test už nie je možné upravovať.")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        test.name = data["name"]
    if "configuration" in data and data["configuration"] is not None:
        configuration = normalize_test_configuration(data["configuration"], test.analysis_profile)
        test.configuration = configuration
    await db.commit()
    await db.refresh(test)
    return test


@router.post("/tests/{test_id}/finalize", response_model=TestDefinitionResponse)
async def finalize_test(
    test_id: str,
    auth: AuthContext = Depends(require_researcher_csrf),
    db: AsyncSession = Depends(get_db),
) -> TestDefinition:
    test = await db.get(TestDefinition, test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Verzia testu neexistuje.")
    if test.status != "draft":
        raise HTTPException(status_code=409, detail="Test je už finalizovaný.")
    test.status = "finalized"
    await db.commit()
    await db.refresh(test)
    return test


@router.post("/tests/{test_id}/deactivate", response_model=TestDefinitionResponse)
async def deactivate_test(
    test_id: str,
    auth: AuthContext = Depends(require_researcher_csrf),
    db: AsyncSession = Depends(get_db),
) -> TestDefinition:
    test = await db.get(TestDefinition, test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Verzia testu neexistuje.")
    test.is_active = False
    await db.commit()
    await db.refresh(test)
    return test


@router.post("/tests/{test_id}/reactivate", response_model=TestDefinitionResponse)
async def reactivate_test(
    test_id: str,
    auth: AuthContext = Depends(require_researcher_csrf),
    db: AsyncSession = Depends(get_db),
) -> TestDefinition:
    test = await db.get(TestDefinition, test_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Verzia testu neexistuje.")
    test.is_active = True
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
    flags = await revoked_participant_consents(db)
    if effective_role(auth.user) == "researcher" and participant.id in flags:
        raise HTTPException(status_code=404, detail="Účastník nie je dostupný.")
    measurements = await db.scalars(
        select(Measurement).where(Measurement.participant_id == participant_id).order_by(Measurement.started_at.desc())
    )
    return {
        "participant": {**ParticipantResponse.model_validate(participant).model_dump(mode="json"),
                        "revoked_consents": flags.get(participant.id, {})},
        "measurements": [
            {
                "id": item.id,
                "test_type": item.test_type,
                "status": item.status,
                "started_at": item.started_at,
                "created_at": item.created_at,
                "raw_data_available": item.raw_storage_path is not None,
                "raw_size_bytes": item.raw_size_bytes,
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
    await require_active_consents(db, participant.id)
    test = await db.get(TestDefinition, payload.test_definition_id)
    if test is None:
        raise HTTPException(status_code=404, detail="Typ testu neexistuje.")

    try:
        raw_bytes = decode_raw_upload(
            payload.raw_log_base64,
            file_name=payload.source_file_name,
            content_type=payload.raw_content_type,
            max_upload_bytes=settings.max_raw_upload_bytes,
        )
    except RawUploadTooLarge as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except RawUploadInvalid as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raw_sha256 = hashlib.sha256(raw_bytes).hexdigest() if raw_bytes is not None else None
    if raw_bytes is None:
        raise HTTPException(status_code=422, detail="A compressed raw log is required.")
    validate_measurement_result(payload, test, raw_bytes)
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
        extension = ".tsv.gz" if payload.raw_content_type == "application/gzip" else ".raw"
        target = storage_root / f"{measurement.id}{extension}"
        target.write_bytes(raw_bytes)
        measurement.raw_storage_path = str(target)
        measurement.raw_data = {
            "storage": "filesystem",
            "sha256": raw_sha256,
            "compression": "gzip" if payload.raw_content_type == "application/gzip" else None,
        }

    await db.commit()
    publish_measurements_updated()
    await db.refresh(measurement)
    return measurement


@router.get("/measurements", response_model=list[MeasurementResponse])
async def list_measurements(
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List measurements synchronized by THRUST or uploaded manually."""
    result = await db.scalars(select(Measurement).order_by(Measurement.started_at.desc()))
    excluded = set(await revoked_participant_consents(db)) if effective_role(auth.user) == "researcher" else set()
    visible = [item for item in result if item.participant_id not in excluded]
    ids = [item.id for item in visible]
    latest = {}
    if ids:
        models = await db.execute(select(HumanModelResult.measurement_id, HumanModelResult.revision).where(
            HumanModelResult.measurement_id.in_(ids), HumanModelResult.review_status == "accepted"
        ).order_by(HumanModelResult.measurement_id, HumanModelResult.revision.desc()))
        for measurement_id, revision in models:
            latest.setdefault(measurement_id, revision)
    output = []
    for item in visible:
        revision = latest.get(item.id)
        output.append({**MeasurementResponse.model_validate(item).model_dump(),
                       "human_model_status": "accepted" if revision else "not_computed",
                       "human_model_revision": revision,
                       "compute_quality_status": item.compute_quality_status,
                       "compute_quality_note": item.compute_quality_note})
    return output


@router.get("/measurements/{measurement_id}", response_model=MeasurementResponse)
async def measurement_detail(
    measurement_id: str,
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    measurement = await db.get(Measurement, measurement_id)
    if measurement is None:
        raise HTTPException(status_code=404, detail="Meranie neexistuje.")
    if effective_role(auth.user) == "researcher" and measurement.participant_id in await revoked_participant_consents(db):
        raise HTTPException(status_code=404, detail="Meranie nie je dostupné.")
    revision = await db.scalar(select(HumanModelResult.revision).where(
        HumanModelResult.measurement_id == measurement_id,
        HumanModelResult.review_status == "accepted",
    ).order_by(HumanModelResult.revision.desc()).limit(1))
    return {**MeasurementResponse.model_validate(measurement).model_dump(),
            "human_model_status": "accepted" if revision else "not_computed",
            "human_model_revision": revision,
            "compute_quality_status": measurement.compute_quality_status,
            "compute_quality_note": measurement.compute_quality_note}


@router.get("/measurements/{measurement_id}/raw")
async def download_measurement_raw(measurement_id: str, auth: AuthContext = Depends(require_researcher), db: AsyncSession = Depends(get_db)) -> FileResponse:
    measurement = await db.get(Measurement, measurement_id)
    if measurement is None:
        raise HTTPException(status_code=404, detail="Meranie neexistuje.")
    if effective_role(auth.user) == "researcher" and measurement.participant_id in await revoked_participant_consents(db):
        raise HTTPException(status_code=404, detail="Meranie nie je dostupné.")
    if not measurement.raw_storage_path:
        raise HTTPException(status_code=404, detail="Raw súbor nie je archivovaný.")
    storage_root = Path(settings.measurement_storage_path).resolve()
    raw_path = Path(measurement.raw_storage_path).resolve()
    try:
        raw_path.relative_to(storage_root)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Raw súbor je mimo úložiska meraní.") from exc
    if not raw_path.is_file():
        raise HTTPException(status_code=404, detail="Archivovaný raw súbor sa nenašiel.")
    return FileResponse(raw_path, filename=measurement.source_file_name or f"{measurement.id}.tsv.gz",
                        media_type=measurement.raw_content_type or "application/octet-stream")


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


@router.get("/clients")
async def connected_clients(
    auth: AuthContext = Depends(require_admin),
) -> list[dict]:
    return connected_clients_snapshot()


@router.post("/clients/{client_id}/disconnect")
async def disconnect_client(
    client_id: str,
    auth: AuthContext = Depends(require_csrf),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    client = client_for_disconnect(client_id)
    if client is None or client["client_type"] not in {"web", "measure"}:
        raise HTTPException(status_code=404, detail="Klient už nie je pripojený.")
    if client["client_type"] == "measure":
        request_measure_disconnect(client_id)
        record_event(db, auth, "session", "client.disconnect_requested", client_type="measure")
        await db.commit()
        return {"status": "pending"}

    session = await db.get(AdminSession, client["session_hash"])
    if session is not None:
        await db.delete(session)
    record_event(db, auth, "session", "client.disconnected", client_type="web")
    await db.commit()
    notify_web_disconnect(client_id)
    return {"status": "disconnected"}


@router.get("/overview")
async def overview(
    auth: AuthContext = Depends(require_researcher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    excluded = set(await revoked_participant_consents(db)) if effective_role(auth.user) == "researcher" else set()
    participants = await db.scalar(select(func.count()).select_from(Participant).where(Participant.id.not_in(excluded))) or 0
    measurements = await db.scalar(
        select(func.count()).select_from(Measurement).where(Measurement.raw_storage_path.is_not(None), Measurement.participant_id.not_in(excluded))
    ) or 0
    return {
        "username": auth.user.username,
        "role": auth.user.role,
        "participant_count": participants,
        "measurement_count": measurements,
    }
