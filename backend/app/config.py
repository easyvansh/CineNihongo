from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CINENIHONGO_", env_file=".env")

    host: str = "127.0.0.1"
    port: int = 8765
    model: str = "small"
    device: str = "auto"
    compute_type: str = "auto"
    confidence_threshold: float = Field(0.65, ge=0, le=1)
    lead_padding: float = Field(0.8, ge=0, le=5)
    tail_padding: float = Field(0.4, ge=0, le=5)
    ring_buffer_seconds: int = Field(15, ge=5, le=120)
    database_path: Path = Path("data/cinenihongo.sqlite3")
    debug_recording: bool = False
    queue_size: int = Field(8, ge=1, le=100)
    asr_timeout_seconds: float = Field(30, ge=1, le=300)


@lru_cache
def get_settings() -> Settings:
    return Settings()
