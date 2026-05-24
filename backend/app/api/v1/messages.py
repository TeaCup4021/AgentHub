from uuid import UUID
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.message import ArtifactBrief, MessageCreate, MessageResponse, MessageListResponse
from app.models.message import Message
from app.models.artifact import Artifact
from app.services.message import MessageService

router = APIRouter()
messages_router = APIRouter()


async def get_current_user_id() -> UUID:
    return UUID("00000000-0000-0000-0000-000000000001")


@router.get("/{conv_id}/messages", response_model=MessageListResponse)
async def list_messages(
    conv_id: UUID,
    cursor: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return await MessageService.list_messages(
        db=db, conv_id=conv_id, user_id=user_id, cursor=cursor, limit=limit
    )


@router.post("/{conv_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    conv_id: UUID,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return await MessageService.create_message(db=db, conv_id=conv_id, user_id=user_id, data=data)


@messages_router.post("/{message_id}/regenerate", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def regenerate_message(
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    result = await db.execute(select(Message).where(Message.id == message_id))
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Message not found")
    data = MessageCreate(
        content=original.content,
        content_type=original.content_type,
        parent_message_id=original.parent_message_id,
    )
    return await MessageService.create_message(
        db=db, conv_id=original.conversation_id, user_id=user_id, data=data
    )


@messages_router.get("/{message_id}/artifacts", response_model=List[ArtifactBrief])
async def get_message_artifacts(
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Artifact).where(Artifact.message_id == message_id).order_by(Artifact.created_at.desc())
    )
    artifacts = result.scalars().all()
    return [
        {
            "id": a.id,
            "artifact_type": a.artifact_type,
            "title": a.title,
            "content": a.content,
            "storage_key": a.storage_key,
            "mime_type": a.mime_type,
            "version": a.version,
            "created_at": a.created_at,
        }
        for a in artifacts
    ]
