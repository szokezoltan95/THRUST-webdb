from datetime import datetime

import pytest
from pydantic import ValidationError

from app.schemas.participant import ParticipantProfileFields


def test_minimal_profile_accepts_fixed_choice_values() -> None:
    profile = ParticipantProfileFields(
        birth_year=2001,
        dominant_hand="right",
        gamepad_used=True,
        pc_joystick_used=False,
        rc_transmitter_used=True,
        uav_flown=True,
        uav_los=True,
        uav_fpv=False,
    )

    assert profile.birth_year == 2001
    assert profile.gamepad_used is True
    assert profile.pc_joystick_used is False
    assert profile.uav_los is True


def test_profile_rejects_future_birth_year() -> None:
    with pytest.raises(ValidationError):
        ParticipantProfileFields(birth_year=datetime.now().year + 1)


def test_profile_rejects_removed_demographic_fields() -> None:
    with pytest.raises(ValidationError):
        ParticipantProfileFields(birth_date="2001-02-03")
