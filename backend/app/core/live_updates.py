"""Process-local event fanout for authenticated WebDB clients.

The API currently runs as a single Uvicorn worker. Keep payloads empty: clients
re-fetch data through the normal, role-protected API after receiving a signal.
"""
import asyncio

_subscribers: set[asyncio.Queue[str]] = set()


def subscribe() -> asyncio.Queue[str]:
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1)
    _subscribers.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue[str]) -> None:
    _subscribers.discard(queue)


def publish_measurements_updated() -> None:
    for queue in tuple(_subscribers):
        if queue.full():
            continue
        queue.put_nowait("measurement_updated")
