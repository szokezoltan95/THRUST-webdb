from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


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


class AdminAccountProfileUpdate(BaseModel):
    email: EmailStr | None


DataRequestType = Literal["access", "rectification", "erasure", "restriction", "portability", "objection"]
DataRequestStatus = Literal["received", "in_review", "completed", "rejected"]


class StudentDataRequestCreate(BaseModel):
    request_type: DataRequestType
    details: str | None = Field(default=None, max_length=4000)


class StudentDataRequestResponse(BaseModel):
    id: str
    request_type: DataRequestType
    details: str | None
    status: DataRequestStatus
    response_note: str | None
    created_at: datetime
    updated_at: datetime
    requester_email: str | None = None
    participant_code: str | None = None
    requester_user_id: str | None = None
    participant_id: str | None = None

    model_config = {"from_attributes": True}


class StudentDataRequestUpdate(BaseModel):
    status: DataRequestStatus
    response_note: str | None = Field(default=None, max_length=4000)
