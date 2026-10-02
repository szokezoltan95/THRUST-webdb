import json
import math

from pydantic import BaseModel, Field, field_validator, model_validator


class HumanModelUpload(BaseModel):
    source_raw_sha256: str = Field(pattern=r"^[0-9a-fA-F]{64}$")
    algorithm_version: str = Field(min_length=1, max_length=100)
    stage: str = Field(pattern=r"^(full_fit|manual_refinement)$")
    settings: dict
    quality: dict
    channels: dict = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def validate_finite_payload(self):
        if not set(self.channels).issubset({"LX", "LY", "RY", "RX"}):
            raise ValueError("Human-model channels must be one or more SCoPE axes.")
        encoded = json.dumps(self.model_dump(mode="json"), allow_nan=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > 8_000_000:
            raise ValueError("Human-model result exceeds the 8 MB limit.")

        def finite(value):
            if isinstance(value, float) and not math.isfinite(value):
                return False
            if isinstance(value, dict):
                return all(finite(k) and finite(v) for k, v in value.items())
            if isinstance(value, (list, tuple)):
                return all(finite(v) for v in value)
            return True

        if not finite(self.model_dump(mode="python")):
            raise ValueError("Human-model payload contains a non-finite number.")
        for axis, channel in self.channels.items():
            if not isinstance(channel, dict) or not isinstance(channel.get("fit"), dict):
                raise ValueError(f"Channel {axis} must include fit diagnostics.")
            parameters = channel["fit"].get("parameters", {})
            if not isinstance(parameters, dict) or set(parameters) != {"gain", "t1_s", "t2_s", "t3_s", "delay_s"}:
                raise ValueError(f"Channel {axis} has incomplete model parameters.")
            recording = channel.get("recording")
            if recording is not None:
                if not isinstance(recording, dict):
                    raise ValueError(f"Channel {axis} recording curve must be an object.")
                names = ("time_s", "observed_normalized", "model_normalized")
                arrays = [recording.get(name, []) for name in names]
                if not all(isinstance(values, list) for values in arrays):
                    raise ValueError(f"Channel {axis} recording curves must be arrays.")
                lengths = [len(values) for values in arrays]
                if not lengths[0] or len(set(lengths)) != 1 or lengths[0] > 20000:
                    raise ValueError(f"Channel {axis} recording curves must have 1–20000 paired points.")
        return self


class ComputeQualityUpdate(BaseModel):
    status: str = Field(pattern=r"^(unreviewed|acceptable|questionable|unsuitable)$")
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                return None
        return value
