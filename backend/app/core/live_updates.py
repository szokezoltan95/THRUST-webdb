"""Ephemeral live events and client-presence state for WebDB.

Both registries are process-local. The current Docker setup runs one Uvicorn
worker; snapshots contain no persisted data and clients re-fetch protected APIs.
"""
import asyncio
from datetime import datetime, timezone
from typing import Any

_subscribers: set[asyncio.Queue[str]] = set()
_clients: dict[str, dict[str, Any]] = {}
_web_queues: dict[str, asyncio.Queue[str]] = {}
_pending_measure_disconnects: set[str] = set()
_MEASURE_CLIENT_TTL_SECONDS = 35


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def subscribe() -> asyncio.Queue[str]:
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1)
    _subscribers.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue[str]) -> None:
    _subscribers.discard(queue)


def publish_measurements_updated() -> None:
    for queue in tuple(_subscribers):
        if not queue.full():
            queue.put_nowait("measurement_updated")


def register_web_client(client_id: str, username: str, role: str, ip_address: str | None,
                        session_hash: str, queue: asyncio.Queue[str]) -> None:
    now = _utcnow()
    _clients[client_id] = {
        "client_id": client_id,
        "username": username,
        "role": role,
        "client_type": "web",
        "session_hash": session_hash,
        "ip_address": ip_address,
        "connected_at": now,
        "last_seen_at": now,
        "status": "idle",
        "participant_code": None,
        "test": None,
    }
    _web_queues[client_id] = queue


def update_measure_client(
    client_id: str,
    username: str,
    role: str,
    ip_address: str | None,
    status: str,
    participant_code: str | None,
    test: str | None,
    session_hash: str,
) -> None:
    now = _utcnow()
    existing = _clients.get(client_id)
    _clients[client_id] = {
        "client_id": client_id,
        "username": username,
        "role": role,
        "client_type": "measure",
        "session_hash": session_hash,
        "ip_address": ip_address,
        "connected_at": existing["connected_at"] if existing else now,
        "last_seen_at": now,
        "status": status,
        "participant_code": participant_code if status == "measuring" else None,
        "test": test if status == "measuring" else None,
    }


def unregister_client(client_id: str) -> None:
    _clients.pop(client_id, None)
    _web_queues.pop(client_id, None)
    _pending_measure_disconnects.discard(client_id)


def client_for_disconnect(client_id: str) -> dict[str, Any] | None:
    connected_clients_snapshot()
    return _clients.get(client_id)


def request_measure_disconnect(client_id: str) -> None:
    _pending_measure_disconnects.add(client_id)


def measure_disconnect_pending(client_id: str) -> bool:
    return client_id in _pending_measure_disconnects


def notify_web_disconnect(client_id: str) -> None:
    client = _clients.get(client_id)
    if client is None:
        return
    # Browser tabs may share the same cookie. Revoking it logs out all tabs.
    for key, queue in tuple(_web_queues.items()):
        if _clients.get(key, {}).get("session_hash") != client["session_hash"]:
            continue
        if queue.full():
            queue.get_nowait()
        queue.put_nowait("force_logout")


def connected_clients_snapshot() -> list[dict[str, Any]]:
    now = _utcnow()
    stale = [
        key for key, value in _clients.items()
        if value["client_type"] == "measure"
        and (now - value["last_seen_at"]).total_seconds() > _MEASURE_CLIENT_TTL_SECONDS
    ]
    for key in stale:
        _clients.pop(key, None)

    clients = []
    for value in _clients.values():
        clients.append({
            **{key: item for key, item in value.items() if key != "session_hash"},
            "disconnect_pending": value["client_id"] in _pending_measure_disconnects,
            "connected_at": value["connected_at"].isoformat(),
            "last_seen_at": value["last_seen_at"].isoformat(),
            "connected_for_seconds": max(0, int((now - value["connected_at"]).total_seconds())),
            "last_seen_seconds": max(0, int((now - value["last_seen_at"]).total_seconds())),
        })
    return sorted(clients, key=lambda client: (client["status"] != "measuring", client["username"].lower()))
