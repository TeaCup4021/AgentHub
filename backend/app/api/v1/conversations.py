from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.conversation import ConversationCreate, ConversationUpdate, ConversationResponse
from app.schemas.base import Page
from app.services.conversation import ConversationService

# Assuming we have a dependency to get the current user ID
# For now, we will mock it or expect it in requests. Assuming there's some `get_current_user`
# But let's just create a dummy one for the sake of structure if it doesn't exist,
# or we'll assume a hardcoded UUID or a header for now, since it wasn't provided.
# Usually it's `Depends(get_current_user)`.
# Let's write a placeholder dependency if none exists.
async def get_current_user_id() -> UUID:
    # return a mock UUID, or should be replaced with real auth later
    return UUID("00000000-0000-0000-0000-000000000001")

router = APIRouter()

@router.get("/", response_model=Page[ConversationResponse])
async def get_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    keyword: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    return await ConversationService.list_conversations(
        db=db, user_id=user_id, page=page, page_size=page_size, keyword=keyword
    )

@router.post("/", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    return await ConversationService.create_conversation(db=db, user_id=user_id, data=data)

@router.patch("/{conv_id}", response_model=ConversationResponse)
async def update_conversation(
    conv_id: UUID,
    data: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    return await ConversationService.update_conversation(db=db, user_id=user_id, conv_id=conv_id, data=data)

@router.delete("/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    await ConversationService.delete_conversation(db=db, user_id=user_id, conv_id=conv_id)

