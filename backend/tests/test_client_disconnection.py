import asyncio

from app.core.live_updates import (
    client_for_disconnect,
    connected_clients_snapshot,
    measure_disconnect_pending,
    notify_web_disconnect,
    register_web_client,
    request_measure_disconnect,
    unregister_client,
    update_measure_client,
)


def test_disconnect_notification_reaches_all_tabs_in_same_session() -> None:
    first, second, other = (asyncio.Queue(maxsize=1) for _ in range(3))
    try:
        register_web_client("web:first", "student", "student", None, "shared", first)
        register_web_client("web:second", "student", "student", None, "shared", second)
        register_web_client("web:other", "researcher", "researcher", None, "other", other)
        notify_web_disconnect("web:first")
        assert first.get_nowait() == "force_logout"
        assert second.get_nowait() == "force_logout"
        assert other.empty()
        assert all("session_hash" not in client for client in connected_clients_snapshot())
    finally:
        for client_id in ("web:first", "web:second", "web:other"):
            unregister_client(client_id)


def test_measure_disconnect_remains_pending_until_explicit_ack() -> None:
    client_id = "measure:session"
    try:
        update_measure_client(client_id, "student", "student", None,
                              "measuring", "P0001", "SCoPE v1", "session")
        request_measure_disconnect(client_id)
        assert measure_disconnect_pending(client_id)
        assert client_for_disconnect(client_id)["status"] == "measuring"
        assert connected_clients_snapshot()[0]["disconnect_pending"] is True
    finally:
        unregister_client(client_id)
    assert not measure_disconnect_pending(client_id)
