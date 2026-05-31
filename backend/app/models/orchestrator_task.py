import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base, UUIDMixin, TimestampMixin

class OrchestratorTask(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "orchestrator_tasks"
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('conversations.id'), nullable=False)
    trigger_message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('messages.id'), nullable=False)
    planner_agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, server_default='queued')
    plan: Mapped[dict] = mapped_column(JSONB, nullable=False)
    result_summary: Mapped[dict] = mapped_column(JSONB, nullable=True)
