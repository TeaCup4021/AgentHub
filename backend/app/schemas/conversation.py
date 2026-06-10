from uuid import UUID
from datetime import datetime
from typing import List, Literal, Optional
from app.schemas.base import BaseSchema

class ConversationCreate(BaseSchema):
    title: str
    type: str = "single"  # "single" | "group"
    purpose: Literal["normal", "agent_builder"] = "normal"
    agent_ids: List[UUID] = []
    project_id: Optional[UUID] = None

class ConversationUpdate(BaseSchema):
    title: Optional[str] = None
    purpose: Optional[Literal["normal", "agent_builder"]] = None
    is_archived: Optional[bool] = None
    is_pinned: Optional[bool] = None
    agent_ids: Optional[List[UUID]] = None

class PinMessageRequest(BaseSchema):
    message_id: UUID


class ConversationResponse(BaseSchema):
    id: UUID
    title: str
    type: str
    purpose: str = "normal"
    owner_id: UUID
    project_id: Optional[UUID] = None
    is_archived: bool
    is_pinned: bool
    last_active_at: datetime
    created_at: datetime
    updated_at: datetime
    agent_ids: List[UUID] = []

