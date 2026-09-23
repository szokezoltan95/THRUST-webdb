from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "THRUST-webdb"
    database_url: str = "postgresql+asyncpg://thrust:change-me@localhost:5432/thrust"
    cookie_secure: bool = False
    allowed_hosts: str = "localhost,127.0.0.1"
    session_lifetime_hours: int = 12
    public_min_group_size: int = 10
    measurement_storage_path: str = "/var/lib/thrust-webdb/measurements"
    max_raw_upload_bytes: int = 50_000_000
    superadmin_identifiers: str = ""
    researcher_registration_key: str = ""
    data_controller_name: str = ""
    data_controller_address: str = ""
    data_controller_email: str = ""
    data_retention_notice: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

