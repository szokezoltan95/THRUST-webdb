from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LocalizedText(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    sk: str = Field(default="", max_length=20000)
    en: str = Field(default="", max_length=20000)


class RetentionRules(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account: LocalizedText
    profile: LocalizedText
    measurements: LocalizedText
    consents: LocalizedText
    backups: LocalizedText


class PolicyContent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    controller_name: str = Field(default="", max_length=300)
    controller_address: str = Field(default="", max_length=500)
    controller_email: EmailStr | None = None
    dpo_contact: str = Field(default="", max_length=500)
    research: LocalizedText
    gdpr: LocalizedText
    purposes: LocalizedText
    recipients: LocalizedText
    retention: RetentionRules


class PolicyPublish(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=0)
    content: PolicyContent


class BackupEntry(BaseModel):
    name: str = Field(max_length=100, pattern=r"^\d{8}T\d{6}Z$")
    created_at: datetime
    size_bytes: int = Field(ge=0)
    database: bool
    files: bool
    checksums_verified: bool


class BackupReport(BaseModel):
    generated_at: datetime
    last_attempt_at: datetime
    last_attempt_status: Literal["success", "failed"]
    backups: list[BackupEntry] = Field(max_length=200)
    encrypted: bool = False
    offsite_copy: bool = False
    last_restore_test_at: datetime | None = None
