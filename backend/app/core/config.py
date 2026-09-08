from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "THRUST-webdb"
    database_url: str = "postgresql+asyncpg://thrust:change-me@localhost:5432/thrust"
    cookie_secure: bool = False
    session_lifetime_hours: int = 12
    public_min_group_size: int = 10


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

