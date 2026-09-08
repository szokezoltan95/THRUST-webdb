from datetime import datetime

from pydantic import BaseModel, Field


class MeasurementCreate(BaseModel):
    participant_id: str
    test_definition_id: str
    started_at: datetime
    status: str = Field(default="recorded", max_length=30)


class MeasurementResponse(BaseModel):
    id: str
    participant_id: str
    test_definition_id: str | None
    test_type: str
    status: str
    started_at: datetime
    source_file_name: str | None

    model_config = {"from_attributes": True}
