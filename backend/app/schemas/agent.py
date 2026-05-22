from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime
from pydantic import Field
from app.schemas.base import BaseSchema

class AgentBase(BaseSchema):
    name: str = Field(..., max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=500)
    provider: str = Field(..., max_length=50)
    model: str = Field(..., max_length=100)
    system_prompt: Optional[str] = None
    capabilities: List[str] = Field(default_factory=list)
    tool_config: Optional[Dict[str, Any]] = None

class AgentCreate(AgentBase):
    pass

class AgentUpdate(BaseSchema):
    name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=500)
    provider: Optional[str] = Field(None, max_length=50)
    model: Optional[str] = Field(None, max_length=100)
    system_prompt: Optional[str] = None
    capabilities: Optional[List[str]] = None
    tool_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class AgentResponse(AgentBase):
    id: UUID
    is_builtin: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

class AgentVerifyRequest(BaseSchema):
    provider: str
    model: str
    system_prompt: Optional[str] = None

