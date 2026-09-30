from asyncio import QueueEmpty

from app.core.live_updates import publish_measurements_updated, subscribe, unsubscribe


def test_measurement_update_fans_out_and_coalesces_pending_refreshes():
    first = subscribe()
    second = subscribe()
    try:
        publish_measurements_updated()
        publish_measurements_updated()

        assert first.get_nowait() == "measurement_updated"
        assert second.get_nowait() == "measurement_updated"

        try:
            first.get_nowait()
        except QueueEmpty:
            pass
        else:
            raise AssertionError("pending refresh signals should be coalesced")
    finally:
        unsubscribe(first)
        unsubscribe(second)
