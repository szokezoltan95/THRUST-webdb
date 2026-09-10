from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class TestDefinitionCreate(BaseModel):
    test_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=120)
    version: str = Field(default="1.0", min_length=1, max_length=30)
    analysis_profile: str = Field(default="SCOPE_STEP_RESPONSE_V1", min_length=1, max_length=80)
    configuration: dict = Field(default_factory=dict)

    @field_validator("test_code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper().replace(" ", "_")

    @field_validator("name", "version")
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class TestDefinitionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    configuration: dict | None = None

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class TestDefinitionResponse(BaseModel):
    id: str
    test_code: str
    name: str
    version: str
    status: str
    analysis_profile: str
    configuration: dict
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
