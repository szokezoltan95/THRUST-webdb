from datetime import datetime
from pydantic import BaseModel, Field


class ParticipantGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    participant_ids: list[str] = Field(default_factory=list)


class ParticipantGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    participant_ids: list[str] | None = None


class ParticipantGroupResponse(BaseModel):
    id: str
    name: str
    description: str | None
    created_at: datetime
    participant_ids: list[str]
    participant_codes: list[str]
