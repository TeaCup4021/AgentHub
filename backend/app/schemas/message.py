from uuid import UUID
from datetime import datetime
from typing import List, Literal, Optional
from pydantic import Field
from app.schemas.base import BaseSchema


class MessageCreate(BaseSchema):
    content: str = Field(default="")
    content_type: str = "text"
    mentions: List[UUID] = []
    parent_message_id: Optional[UUID] = None
    mode: Optional[str] = None  # "direct" | "auto_orchestrate" | "refine_plan" | "confirm_plan"
    planner_agent_id: Optional[UUID] = None  # auto_orchestrate mode: designated planner agent
    plan_id: Optional[UUID] = None  # confirm_plan / refine_plan mode
    plan: Optional[List[dict]] = None  # confirm_plan mode: [{ subtask_id, agent_id, instruction }]


class ArtifactBrief(BaseSchema):
    id: UUID
    artifact_type: str
    title: Optional[str] = None
    content: dict
    storage_key: Optional[str] = None
    mime_type: Optional[str] = None
    version: int
    created_at: datetime


class MessageResponse(BaseSchema):
    id: UUID
    conversation_id: UUID
    sender_type: Literal["user", "agent", "system", "orchestrator"]
    sender_id: Optional[UUID] = None
    sender_name: Optional[str] = None
    parent_message_id: Optional[UUID] = None
    content_type: str
    content: str
    status: Literal["pending", "streaming", "done", "failed"]
    meta: Optional[dict] = None
    artifacts: List[ArtifactBrief] = []
    is_pinned: bool = False
    created_at: datetime
    updated_at: datetime


class MessageListResponse(BaseSchema):
    items: List[MessageResponse]
    next_cursor: Optional[str] = None
    has_more: bool
