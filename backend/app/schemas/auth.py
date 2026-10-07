from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.participant import ParticipantProfileFields


class LoginRequest(BaseModel):
    identifier: str | None = Field(default=None, min_length=1, max_length=255)
    username: str | None = Field(default=None, min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)


class RegistrationRequest(ParticipantProfileFields):
    consent_language: Literal["sk", "en"] = "sk"
    email: EmailStr
    nickname: str | None = Field(default=None, max_length=40)
    password: str = Field(min_length=10, max_length=1024)
    research_consent: bool
    gdpr_consent: bool
    gdpr_consent_version: str = Field(default="gdpr-v4", min_length=1, max_length=30)
    consent_version: str = Field(default="research-v5", min_length=1, max_length=30)

    @field_validator("nickname")
    @classmethod
    def trim_nickname(cls, value: str | None) -> str | None:
        value = value.strip() if value is not None else None
        return value or None


class ResearcherRegistrationRequest(BaseModel):
    consent_language: Literal["sk", "en"] = "sk"
    email: EmailStr
    password: str = Field(min_length=10, max_length=1024)
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    registration_key: str = Field(min_length=1, max_length=64)
    gdpr_consent: bool
    gdpr_consent_version: str = Field(default="gdpr-v4", min_length=1, max_length=30)

    @field_validator("first_name", "last_name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Meno nesmie byť prázdne.")
        return value


class UserResponse(BaseModel):
    username: str
    email: str | None = None
    nickname: str | None = None
    role: str
    csrf_token: str
    must_change_password: bool = False
    participant_id: str | None = None
    participant_code: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    accent_theme: Literal["blue", "red", "green", "purple", "orange", "teal", "pink", "gold"] = "blue"
    color_mode: Literal["dark", "light"] = "dark"


class AppearancePreferences(BaseModel):
    accent_theme: Literal["blue", "red", "green", "purple", "orange", "teal", "pink", "gold"]
    color_mode: Literal["dark", "light"]


class StudentProfileResponse(ParticipantProfileFields):
    username: str
    email: str | None
    nickname: str | None = None
    role: str
    participant_code: str
    created_at: datetime


class StudentPasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=10, max_length=1024)
