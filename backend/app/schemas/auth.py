from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    identifier: str | None = Field(default=None, min_length=1, max_length=255)
    username: str | None = Field(default=None, min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)


class RegistrationRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=1024)
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    research_consent: bool
    gdpr_consent: bool
    birth_date: date | None = None
    pilot_experience: str | None = Field(default=None, pattern="^(none|under_1_year|1_3_years|3_5_years|over_5_years)$")
    flight_hours_range: str | None = Field(default=None, pattern="^(0|under_10|10_50|51_200|201_500|over_500)$")
    pilot_certificate: str | None = Field(default=None, pattern="^(none|a1_a3|a2|sts|other)$")
    primary_uav_type: str | None = Field(default=None, pattern="^(multirotor|fixed_wing|helicopter|vtol|other)$")
    simulator_experience: str | None = Field(default=None, pattern="^(none|under_10|10_50|51_200|over_200)$")
    self_rated_skill: int | None = Field(default=None, ge=1, le=5)
    sex: str | None = Field(default=None, pattern="^(female|male|intersex|other|prefer_not_to_say)$")
    dominant_hand: str | None = Field(default=None, pattern="^(right|left|both|prefer_not_to_say)$")
    vision_correction: str | None = Field(default=None, pattern="^(none|glasses|contact_lenses|both|other|prefer_not_to_say)$")
    vision_diopters_left: float | None = Field(default=None, ge=-30, le=30)
    vision_diopters_right: float | None = Field(default=None, ge=-30, le=30)
    rc_experience: str | None = Field(default=None, pattern="^(none|under_1_year|1_3_years|3_5_years|over_5_years)$")
    fpv_experience: str | None = Field(default=None, pattern="^(none|under_1_year|1_3_years|3_5_years|over_5_years)$")
    game_controller_experience: str | None = Field(default=None, pattern="^(none|under_1_year|1_3_years|3_5_years|over_5_years)$")
    video_game_experience: str | None = Field(default=None, pattern="^(none|under_2|2_5|6_10|over_10)$")
    gdpr_consent_version: str = Field(default="gdpr-v1", min_length=1, max_length=30)
    consent_version: str = Field(default="research-v1", min_length=1, max_length=30)

    @field_validator("birth_date")
    @classmethod
    def birth_date_not_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("Dátum narodenia nemôže byť v budúcnosti.")
        return value

    @field_validator("first_name", "last_name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Meno nesmie byť prázdne.")
        return value


class UserResponse(BaseModel):
    username: str
    email: str | None = None
    role: str
    csrf_token: str
    participant_id: str | None = None
    participant_code: str | None = None
    first_name: str | None = None
    last_name: str | None = None


class StudentProfileResponse(BaseModel):
    username: str
    email: str | None
    role: str
    participant_code: str
    first_name: str
    last_name: str
    created_at: datetime
    birth_date: date | None = None
    pilot_experience: str | None = None
    flight_hours_range: str | None = None
    pilot_certificate: str | None = None
    primary_uav_type: str | None = None
    simulator_experience: str | None = None
    self_rated_skill: int | None = None
    sex: str | None = None
    dominant_hand: str | None = None
    vision_correction: str | None = None
    vision_diopters_left: float | None = None
    vision_diopters_right: float | None = None
    rc_experience: str | None = None
    fpv_experience: str | None = None
    game_controller_experience: str | None = None
    video_game_experience: str | None = None
