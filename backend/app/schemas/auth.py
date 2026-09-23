from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)


class RegistrationRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=1024)
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    research_consent: bool
    consent_version: str = Field(default="research-v1", min_length=1, max_length=30)

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
    role: str
    csrf_token: str
    participant_id: str | None = None
    participant_code: str | None = None
    first_name: str | None = None
    last_name: str | None = None


class StudentProfileResponse(BaseModel):
    username: str
    email: str | None
    role: str
    participant_code: str
    first_name: str
    last_name: str
    created_at: datetime
