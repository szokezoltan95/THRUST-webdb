"""Ephemeral live events and client-presence state for WebDB.

Both registries are process-local. The current Docker setup runs one Uvicorn
worker; snapshots contain no persisted data and clients re-fetch protected APIs.
"""
import asyncio
from datetime import datetime, timezone
from typing import Any

_subscribers: set[asyncio.Queue[str]] = set()
_clients: dict[str, dict[str, Any]] = {}
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


def register_web_client(client_id: str, username: str, role: str, ip_address: str | None) -> None:
    now = _utcnow()
    _clients[client_id] = {
        "client_id": client_id,
        "username": username,
        "role": role,
        "client_type": "web",
        "ip_address": ip_address,
        "connected_at": now,
        "last_seen_at": now,
        "status": "idle",
        "participant_code": None,
        "test": None,
    }


def update_measure_client(
    client_id: str,
    username: str,
    role: str,
    ip_address: str | None,
    status: str,
    participant_code: str | None,
    test: str | None,
) -> None:
    now = _utcnow()
    existing = _clients.get(client_id)
    _clients[client_id] = {
        "client_id": client_id,
        "username": username,
        "role": role,
        "client_type": "measure",
        "ip_address": ip_address,
        "connected_at": existing["connected_at"] if existing else now,
        "last_seen_at": now,
        "status": status,
        "participant_code": participant_code if status == "measuring" else None,
        "test": test if status == "measuring" else None,
    }


def unregister_client(client_id: str) -> None:
    _clients.pop(client_id, None)


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
            **value,
            "connected_at": value["connected_at"].isoformat(),
            "last_seen_at": value["last_seen_at"].isoformat(),
            "connected_for_seconds": max(0, int((now - value["connected_at"]).total_seconds())),
            "last_seen_seconds": max(0, int((now - value["last_seen_at"]).total_seconds())),
        })
    return sorted(clients, key=lambda client: (client["status"] != "measuring", client["username"].lower()))
