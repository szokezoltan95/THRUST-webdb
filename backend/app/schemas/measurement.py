from datetime import datetime
import math

from pydantic import BaseModel, Field, field_validator


class MeasurementCreate(BaseModel):
    participant_id: str
    test_definition_id: str
    started_at: datetime
    status: str = Field(default="recorded", max_length=30)
    source_file_name: str = Field(max_length=255)
    raw_log_base64: str
    raw_content_type: str = Field(default="application/gzip", max_length=100)
    analysis_data: dict

    @field_validator("analysis_data")
    @classmethod
    def validate_measure_analysis(cls, value: dict) -> dict:
        required = {
            "schema_version", "algorithm_version", "analysis_type", "started_at",
            "sample_count", "duration_s", "estimated_sampling_hz", "metrics",
            "quality", "events", "normalized_step_response", "producer", "raw_log",
            "test", "parameters", "runtime", "session_summary",
        }
        missing = required - value.keys()
        if missing:
            raise ValueError(f"Measurement analysis is missing fields: {sorted(missing)}")
        if value["schema_version"] != "thrust-analysis-v1":
            raise ValueError("Unsupported THRUST analysis schema.")
        if value["analysis_type"] not in {"SCOPE_STEP_RESPONSE", "SIMPLE_2D_FLIGHT"}:
            raise ValueError("Unsupported THRUST analysis type.")
        if not isinstance(value["algorithm_version"], str) or not value["algorithm_version"]:
            raise ValueError("Analysis algorithm_version must be a non-empty string.")
        if not isinstance(value["sample_count"], int) or isinstance(value["sample_count"], bool) or value["sample_count"] < 2:
            raise ValueError("Analysis sample_count must be an integer of at least 2.")
        for key, minimum in (("duration_s", 0), ("estimated_sampling_hz", 0)):
            number = value[key]
            if not isinstance(number, (int, float)) or isinstance(number, bool) or not math.isfinite(number) or number < minimum:
                raise ValueError(f"Analysis {key} must be a finite non-negative number.")
        if value["estimated_sampling_hz"] <= 0:
            raise ValueError("Analysis estimated_sampling_hz must be positive.")
        if not isinstance(value["metrics"], dict) or not isinstance(value["quality"], dict):
            raise ValueError("Analysis metrics and quality must be objects.")
        if not isinstance(value["events"], list) or not isinstance(value["normalized_step_response"], dict):
            raise ValueError("Analysis events and normalized_step_response have invalid types.")

        def reject_non_finite(item: object) -> None:
            if isinstance(item, float) and not math.isfinite(item):
                raise ValueError("Analysis contains a non-finite number.")
            if isinstance(item, dict):
                for child in item.values():
                    reject_non_finite(child)
            elif isinstance(item, list):
                for child in item:
                    reject_non_finite(child)

        reject_non_finite(value)
        return value


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
