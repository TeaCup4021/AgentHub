from uuid import UUID
from datetime import datetime
from typing import Optional, List
from app.schemas.base import BaseSchema


class ProjectCreate(BaseSchema):
    name: str
    description: Optional[str] = None
    default_agent_ids: List[UUID] = []


class ProjectUpdate(BaseSchema):
    name: Optional[str] = None
    description: Optional[str] = None
    default_agent_ids: Optional[List[UUID]] = None


class ProjectResponse(BaseSchema):
    id: UUID
    name: str
    description: Optional[str] = None
    owner_id: UUID
    default_agent_ids: List[UUID] = []
    conversation_count: int = 0
    created_at: datetime
    updated_at: datetime
