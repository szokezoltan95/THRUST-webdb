from datetime import datetime

from pydantic import BaseModel, Field


class MeasurementCreate(BaseModel):
    participant_id: str
    test_definition_id: str
    started_at: datetime
    status: str = Field(default="recorded", max_length=30)
    source_file_name: str | None = Field(default=None, max_length=255)
    raw_log_base64: str | None = None
    raw_content_type: str = Field(default="text/tab-separated-values", max_length=100)
    analysis_data: dict | None = None


class MeasurementResponse(BaseModel):
    id: str
    participant_id: str
    test_definition_id: str | None
    test_type: str
    status: str
    started_at: datetime
    source_file_name: str | None
    raw_sha256: str | None
    raw_size_bytes: int | None
    analysis_data: dict | None

    model_config = {"from_attributes": True}
