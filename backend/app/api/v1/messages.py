from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.message import MessageCreate, MessageResponse, MessageListResponse
from app.services.message import MessageService

router = APIRouter()


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
