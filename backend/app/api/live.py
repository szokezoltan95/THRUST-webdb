import asyncio
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, effective_role, require_admin, require_authenticated, require_user_csrf
from app.core.live_updates import (
    connected_clients_snapshot,
    register_web_client,
    subscribe,
    unregister_client,
    unsubscribe,
    update_measure_client,
)
from app.db.session import get_db
from app.models import Participant, TestDefinition

router = APIRouter(prefix="/live", tags=["live updates"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-real-ip")
    if forwarded:
        return forwarded.strip() or None
    return request.client.host if request.client else None


@router.get("/events")
async def live_events(
    request: Request,
    auth: AuthContext = Depends(require_authenticated),
) -> StreamingResponse:
    queue = subscribe()
    connection_id = f"web:{uuid4()}"
    register_web_client(connection_id, auth.user.username, effective_role(auth.user), _client_ip(request))

    async def stream():
        try:
            yield "event: connected\\ndata: {}\\n\\n"
            while not await request.is_disconnected():
                try:
                    event_name = await asyncio.wait_for(queue.get(), timeout=20)
                except asyncio.TimeoutError:
                    yield ": keep-alive\\n\\n"
                    continue
                yield f"event: {event_name}\\ndata: {{}}\\n\\n"
        finally:
            unsubscribe(queue)
            unregister_client(connection_id)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/clients")
async def live_clients(
    auth: AuthContext = Depends(require_admin),
) -> list[dict]:
    return connected_clients_snapshot()


class MeasurePresenceUpdate(BaseModel):
    status: Literal["idle", "measuring"]
    participant_id: str | None = None
    test_definition_id: str | None = None


@router.post("/measure-presence")
async def update_measure_presence(
    payload: MeasurePresenceUpdate,
    request: Request,
    auth: AuthContext = Depends(require_user_csrf),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    role = effective_role(auth.user)
    participant_code = None
    test_label = None

    if payload.status == "measuring":
        if not payload.participant_id or not payload.test_definition_id:
            raise HTTPException(status_code=422, detail="Participant and test are required while measuring.")
        if role not in {"student", "researcher", "admin", "superadmin"}:
            raise HTTPException(status_code=403, detail="This account cannot report a measurement.")
        participant = await db.get(Participant, payload.participant_id)
        if participant is None or not participant.is_active:
            raise HTTPException(status_code=404, detail="Active participant not found.")
        if role == "student" and participant.id != auth.user.participant_id:
            raise HTTPException(status_code=403, detail="Students can only report their own measurement.")
        test = await db.get(TestDefinition, payload.test_definition_id)
        if test is None or not test.is_active:
            raise HTTPException(status_code=404, detail="Active test not found.")
        participant_code = participant.participant_code
        test_label = f"{test.test_code} v{test.version}"

    update_measure_client(
        client_id=f"measure:{auth.session.token_hash}",
        username=auth.user.username,
        role=role,
        ip_address=_client_ip(request),
        connected_at=auth.session.created_at,
        status=payload.status,
        participant_code=participant_code,
        test=test_label,
    )
    return {"status": payload.status}
