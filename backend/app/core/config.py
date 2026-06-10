import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"), override=True)


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://agenthub:agenthub@localhost:5433/agenthub"
    REDIS_URL: str = "redis://localhost:6379/0"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "agenthub-artifacts"
    CORS_ORIGINS: List[str] = ["http://localhost:5173"]
    PREVIEW_SERVER_PORT: int = 8080
    PREVIEW_SERVER_URL: str = "http://localhost:8080"

    # ADK Streaming
    AGENTHUB_USE_ADK_STREAM: str = "0"
    AGENTHUB_MODEL_PROVIDER: str = "anthropic"
    AGENTHUB_MODEL_NAME: Optional[str] = None
    AGENTHUB_MAX_PINNED_CONTEXT: int = 10
    AGENTHUB_PIN_INJECTOR_LOG: str = "0"
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_BASE_URL: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_BASE_URL: Optional[str] = None
    DEEPSEEK_API_KEY: Optional[str] = None
    DEEPSEEK_BASE_URL: Optional[str] = None

    # Auth
    AUTH_SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    AUTH_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    AUTH_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    AUTH_ALGORITHM: str = "HS256"

    # Gotenberg (document conversion)
    GOTENBERG_URL: str = "http://localhost:3001"

    # CLI tool paths
    CLAUDE_CODE_CLI_PATH: str = "claude"
    CODEX_CLI_PATH: str = "codex"

    # Claude Code CLI
    CLAUDE_CODE_TIMEOUT_SECONDS: int = 600
    CLAUDE_CODE_MAX_BUDGET_USD: float = 5.0
    CLAUDE_CODE_ALLOWED_TOOLS: str = "Bash,Read,Edit,Write,Glob,Grep"

    # Codex CLI
    CODEX_CLI_TIMEOUT_SECONDS: int = 600
    CODEX_CLI_MODEL: str = "deepseek-v4-pro"

    # Default workspace for CLI tools
    # Use a temporary directory to avoid CLI reading project context (CLAUDE.md, git status, etc.)
    # that would confuse it into thinking the user is providing system instructions
    CLI_DEFAULT_WORKSPACE: str = os.path.join(os.path.expanduser("~"), ".agenthub", "cli_workspace")

    # Email (verification code)
    EMAIL_API_KEY: str = ""
    EMAIL_FROM: str = "AgentHub <noreply@agenthub.example.com>"
    VERIFY_CODE_EXPIRE_SECONDS: int = 600
    VERIFY_CODE_RATE_LIMIT_SECONDS: int = 60

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
