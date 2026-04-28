from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    whisper_model: str = "small"
    whisper_device: str = "cuda"
    whisper_compute_type: str = "float16"
    whisper_fallback_device: str = "cpu"
    whisper_fallback_compute_type: str = "int8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
