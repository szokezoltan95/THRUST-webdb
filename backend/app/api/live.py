import asyncio

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.dependencies import AuthContext, require_authenticated
from app.core.live_updates import subscribe, unsubscribe

router = APIRouter(prefix="/live", tags=["live updates"])


@router.get("/events")
async def live_events(
    request: Request,
    auth: AuthContext = Depends(require_authenticated),
) -> StreamingResponse:
    queue = subscribe()

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

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    )
