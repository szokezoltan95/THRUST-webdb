from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ParticipantCreate(BaseModel):
    participant_code: str = Field(min_length=5, max_length=5)

    @field_validator("participant_code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 5 or not value.isalnum() or not value.isascii():
            raise ValueError("ID musí obsahovať presne 5 alfanumerických znakov.")
        return value


class ParticipantResponse(BaseModel):
    id: str
    participant_code: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
