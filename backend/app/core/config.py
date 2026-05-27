import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://agenthub:agenthub@localhost:5433/agenthub"
    REDIS_URL: str = "redis://localhost:6379/0"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "agenthub-artifacts"
    CORS_ORIGINS: List[str] = ["http://localhost:5173"]

    # ADK Streaming
    AGENTHUB_USE_ADK_STREAM: str = "0"
    AGENTHUB_MODEL_PROVIDER: str = "anthropic"
    AGENTHUB_MODEL_NAME: Optional[str] = None
    AGENTHUB_MAX_PINNED_CONTEXT: int = 10
    AGENTHUB_PIN_INJECTOR_LOG: str = "0"
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_BASE_URL: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
