import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, UUID
from app.models.base import Base, UUIDMixin, TimestampMixin

class Agent(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "agents"
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str] = mapped_column(String(500), nullable=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=True)
    capabilities: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default='[]')
    tool_config: Mapped[dict] = mapped_column(JSONB, nullable=True)
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default='false')
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default='true')
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
