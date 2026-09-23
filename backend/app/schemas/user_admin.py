from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


AccountRole = Literal["student", "researcher", "admin"]


class AdminAccountResponse(BaseModel):
    id: str
    username: str
    email: str | None
    first_name: str | None
    last_name: str | None
    role: str
    effective_role: str
    is_active: bool
    participant_id: str | None
    participant_code: str | None
    created_at: datetime


class AccountRoleUpdate(BaseModel):
    role: AccountRole


class AccountPasswordReset(BaseModel):
    password: str = Field(min_length=10, max_length=1024)
