"""Pydantic schemas for deployment API."""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema


DeploymentTarget = Literal["preview", "static_site", "container", "source_package"]


class DeploymentCreate(BaseSchema):
    """Request to create a new deployment."""

    name: Optional[str] = Field(None, description="Deployment name")
    files: Optional[dict[str, str]] = Field(
        None, description="Optional files to deploy; if omitted, collect from conversation artifacts"
    )
    target: DeploymentTarget = Field("preview", description="Deployment target")
    port: Optional[int] = Field(None, description="Specific port (auto-assign if None)")
    trigger_message_id: Optional[UUID] = None


class DeploymentActionRequest(BaseSchema):
    """Request to run or rerun a deployment action."""

    target: Optional[DeploymentTarget] = None
    port: Optional[int] = None


class DeploymentResponse(BaseSchema):
    """Deployment record response."""

    id: UUID
    conversation_id: UUID
    user_id: UUID
    trigger_message_id: Optional[UUID] = None
    name: str
    target: str
    port: Optional[int]
    directory: Optional[str]
    url: Optional[str]
    download_url: Optional[str]
    source_summary: dict
    runtime_meta: dict
    logs: list
    error: Optional[str]
    process_pid: Optional[int]
    status: str
    is_active: bool
    started_at: datetime
    stopped_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class DeploymentStatus(BaseSchema):
    """Real-time deployment status."""

    deployment: DeploymentResponse
    status: str = Field(..., description="running | stopped | failed")
    uptime_seconds: int
    url: Optional[str]
    download_url: Optional[str] = None
    runtime_meta: dict = {}
    logs: list = []
    error: Optional[str] = None
    process_alive: bool


class DeploymentList(BaseSchema):
    """List of deployments."""

    deployments: list[DeploymentResponse]
    total: int


class DeployCommandResponse(BaseSchema):
    """Payload returned when a chat deployment command creates a card."""

    message_id: UUID
    deployment: DeploymentResponse
    artifact: dict
