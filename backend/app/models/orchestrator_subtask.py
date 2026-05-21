import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, UUIDMixin, TimestampMixin

class OrchestratorSubtask(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "orchestrator_subtasks"
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('orchestrator_tasks.id'), nullable=False)
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('agents.id'), nullable=False)
    instruction: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default='queued')
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default='0')
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    output_message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('messages.id'), nullable=True)
    error_detail: Mapped[str] = mapped_column(Text, nullable=True)
