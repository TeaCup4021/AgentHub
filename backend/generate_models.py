import os

models_dir = r"D:\AgentHub\backend\app\models"
os.makedirs(models_dir, exist_ok=True)

base_code = """import uuid
from datetime import datetime
from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
"""
open(os.path.join(models_dir, "base.py"), "w", encoding="utf-8").write(base_code)

user_code = """from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String
from app.models.base import Base, UUIDMixin, TimestampMixin

class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str] = mapped_column(String(500), nullable=True)
"""
open(os.path.join(models_dir, "user.py"), "w", encoding="utf-8").write(user_code)

agent_code = """import uuid
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
"""
open(os.path.join(models_dir, "agent.py"), "w", encoding="utf-8").write(agent_code)

conversation_code = """import uuid
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, UUIDMixin, TimestampMixin

class Conversation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "conversations"
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default='false')
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default='false')
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
"""
open(os.path.join(models_dir, "conversation.py"), "w", encoding="utf-8").write(conversation_code)

conv_part_code = """import uuid
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, UUIDMixin

class ConversationParticipant(Base, UUIDMixin):
    __tablename__ = "conversation_participants"
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('conversations.id'), nullable=False)
    participant_type: Mapped[str] = mapped_column(String(20), nullable=False)
    participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
"""
open(os.path.join(models_dir, "conversation_participant.py"), "w", encoding="utf-8").write(conv_part_code)

message_code = """import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base, UUIDMixin, TimestampMixin

class Message(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "messages"
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('conversations.id'), nullable=False)
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    parent_message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('messages.id'), nullable=True)
    content_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default='text')
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default='pending')
    meta_data: Mapped[dict] = mapped_column("meta", JSONB, nullable=True)
"""
open(os.path.join(models_dir, "message.py"), "w", encoding="utf-8").write(message_code)

msg_mention_code = """import uuid
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, UUIDMixin

class MessageMention(Base, UUIDMixin):
    __tablename__ = "message_mentions"
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('messages.id'), nullable=False)
    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('agents.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
"""
open(os.path.join(models_dir, "message_mention.py"), "w", encoding="utf-8").write(msg_mention_code)

msg_pin_code = """import uuid
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, UUIDMixin

class MessagePin(Base, UUIDMixin):
    __tablename__ = "message_pins"
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('conversations.id'), nullable=False)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('messages.id'), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
"""
open(os.path.join(models_dir, "message_pin.py"), "w", encoding="utf-8").write(msg_pin_code)

artifact_code = """import uuid
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base, UUIDMixin

class Artifact(Base, UUIDMixin):
    __tablename__ = "artifacts"
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('conversations.id'), nullable=False)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('messages.id'), nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(30), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=True)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=True)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default='1')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
"""
open(os.path.join(models_dir, "artifact.py"), "w", encoding="utf-8").write(artifact_code)

orch_task_code = """import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base, UUIDMixin, TimestampMixin

class OrchestratorTask(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "orchestrator_tasks"
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('conversations.id'), nullable=False)
    trigger_message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('messages.id'), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default='queued')
    plan: Mapped[dict] = mapped_column(JSONB, nullable=False)
    result_summary: Mapped[dict] = mapped_column(JSONB, nullable=True)
"""
open(os.path.join(models_dir, "orchestrator_task.py"), "w", encoding="utf-8").write(orch_task_code)

orch_subtask_code = """import uuid
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
"""
open(os.path.join(models_dir, "orchestrator_subtask.py"), "w", encoding="utf-8").write(orch_subtask_code)

init_code = """from .base import Base
from .user import User
from .agent import Agent
from .conversation import Conversation
from .conversation_participant import ConversationParticipant
from .message import Message
from .message_mention import MessageMention
from .message_pin import MessagePin
from .artifact import Artifact
from .orchestrator_task import OrchestratorTask
from .orchestrator_subtask import OrchestratorSubtask
"""
open(os.path.join(models_dir, "__init__.py"), "w", encoding="utf-8").write(init_code)

