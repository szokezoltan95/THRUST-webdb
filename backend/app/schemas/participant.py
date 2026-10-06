from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class ParticipantCreate(BaseModel):
    participant_code: str = Field(min_length=5, max_length=5)

    @field_validator("participant_code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 5 or not value.isalnum() or not value.isascii():
            raise ValueError("ID musí obsahovať presne 5 alfanumerických znakov.")
        return value


class ParticipantProfileFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    dominant_hand: str | None = Field(default=None, pattern="^(right|left|both|prefer_not_to_say)$")
    gamepad_used: bool | None = None
    pc_joystick_used: bool | None = None
    rc_transmitter_used: bool | None = None
    uav_flown: bool | None = None
    uav_los: bool | None = None
    uav_fpv: bool | None = None
    uav_stabilized_mode: bool | None = None
    uav_manual_mode: bool | None = None

    @field_validator("birth_year")
    @classmethod
    def birth_year_not_future(cls, value: int | None) -> int | None:
        if value is not None and value > datetime.now().year:
            raise ValueError("Rok narodenia nemôže byť v budúcnosti.")
        return value


class ParticipantUpdate(ParticipantProfileFields):
    is_active: bool | None = None


class StudentProfileUpdate(ParticipantProfileFields):
    email: EmailStr | None = None
    nickname: str | None = Field(default=None, max_length=40)

    @field_validator("nickname")
    @classmethod
    def trim_nickname(cls, value: str | None) -> str | None:
        value = value.strip() if value is not None else None
        return value or None


class ParticipantResponse(ParticipantProfileFields):
    id: str
    participant_code: str
    is_active: bool
    created_at: datetime
    revoked_consents: dict[str, datetime] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class RegisteredStudentResponse(BaseModel):
    participant_id: str
    participant_code: str
    email: str
    is_active: bool
    created_at: datetime
