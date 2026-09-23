from datetime import date, datetime

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


class ParticipantUpdate(BaseModel):
    is_active: bool | None = None
    birth_date: date | None = None
    pilot_experience: str | None = Field(default=None, pattern="^(none|under_1_year|1_3_years|3_5_years|over_5_years)$")
    flight_hours_range: str | None = Field(default=None, pattern="^(0|under_10|10_50|51_200|201_500|over_500)$")
    pilot_certificate: str | None = Field(default=None, pattern="^(none|a1_a3|a2|sts|other)$")
    primary_uav_type: str | None = Field(default=None, pattern="^(multirotor|fixed_wing|helicopter|vtol|other)$")
    simulator_experience: str | None = Field(default=None, pattern="^(none|under_10|10_50|51_200|over_200)$")
    self_rated_skill: int | None = Field(default=None, ge=1, le=5)

    @field_validator("birth_date")
    @classmethod
    def birth_date_not_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("Dátum narodenia nemôže byť v budúcnosti.")
        return value


class ParticipantResponse(BaseModel):
    id: str
    participant_code: str
    is_active: bool
    created_at: datetime
    birth_date: date | None = None
    pilot_experience: str | None = None
    flight_hours_range: str | None = None
    pilot_certificate: str | None = None
    primary_uav_type: str | None = None
    simulator_experience: str | None = None
    self_rated_skill: int | None = None

    model_config = {"from_attributes": True}



class RegisteredStudentResponse(BaseModel):
    participant_id: str
    participant_code: str
    email: str
    first_name: str
    last_name: str
    is_active: bool
    created_at: datetime
