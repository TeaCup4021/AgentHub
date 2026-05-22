from uuid import UUID
from datetime import datetime
from typing import List, Optional
from app.schemas.base import BaseSchema

class ConversationCreate(BaseSchema):
    title: str
    type: str = "single"  # "single" | "group"
    agent_ids: List[UUID] = []

class ConversationUpdate(BaseSchema):
    title: Optional[str] = None
    is_archived: Optional[bool] = None
    is_pinned: Optional[bool] = None
    agent_ids: Optional[List[UUID]] = None

class ConversationResponse(BaseSchema):
    id: UUID
    title: str
    type: str
    owner_id: UUID
    is_archived: bool
    is_pinned: bool
    last_active_at: datetime
    created_at: datetime
    updated_at: datetime
    agent_ids: List[UUID] = []

