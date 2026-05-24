from uuid import UUID, uuid4
from typing import Optional
from datetime import datetime, timezone
import asyncio
import json
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
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


def _format_sse(event_name: str, data: dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(data)}\n\n"


async def _mock_sse_stream(conv_id: UUID):
    message_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    def build_payload(extra: dict) -> dict:
        payload = {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": message_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        payload.update(extra)
        return payload

    events = []
    events.append(("message_start", build_payload({
        "sender": {"type": "agent", "id": "demo-agent", "name": "Demo Agent"},
        "timestamp": now,
    })))
    events.append(("token", build_payload({"delta": "Hello, ", "index": 1})))
    events.append(("token", build_payload({"delta": "this is ", "index": 2})))
    events.append(("token", build_payload({"delta": "a mock SSE stream.", "index": 3})))
    events.append(("artifact", build_payload({
        "artifact": {
            "id": str(uuid4()),
            "type": "code",
            "title": "mock_snippet.py",
            "content": {"language": "python", "code": "print('hello')"},
        }
    })))
    events.append(("agent_status", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "task_id": message_id,
        "subtask_id": "branch-demo",
        "agent": {"id": "demo-agent", "name": "Demo Agent"},
        "status": "running",
        "progress": 60,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }))
    events.append(("message_end", build_payload({
        "finish_reason": "completed",
        "usage": {"input_tokens": 12, "output_tokens": 8},
    })))
    events.append(("error", build_payload({
        "code": "MOCK_ERROR",
        "message": "This is a mock error event.",
        "retryable": False,
    })))

    for event_name, data in events:
        yield _format_sse(event_name, data)
        await asyncio.sleep(0.05)


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


@router.get("/{conv_id}/stream")
async def stream_conversation(
    conv_id: UUID,
    user_id: UUID = Depends(get_current_user_id)
):
    return StreamingResponse(_mock_sse_stream(conv_id), media_type="text/event-stream")
