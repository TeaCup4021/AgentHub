from uuid import UUID, uuid4
from typing import Optional, AsyncGenerator
from datetime import datetime, timezone
import asyncio
import json
import os
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.conversation import ConversationCreate, ConversationUpdate, ConversationResponse, PinMessageRequest
from app.schemas.base import Page
from app.models.conversation import Conversation
from app.models.message_pin import MessagePin
from app.models.orchestrator_task import OrchestratorTask
from app.models.message_mention import MessageMention
from app.services.conversation import ConversationService
from app.services.adapters.adk_to_sse import ADKToSSETranslator
from app.services.adk.runner import AgentHubRunner, build_single_chat_agent

# Assuming we have a dependency to get the current user ID
# For now, we will mock it or expect it in requests. Assuming there's some `get_current_user`
# But let's just create a dummy one for the sake of structure if it doesn't exist,
# or we'll assume a hardcoded UUID or a header for now, since it wasn't provided.
# Usually it's `Depends(get_current_user)`.
# Let's write a placeholder dependency if none exists.
async def get_current_user_id() -> UUID:
    # return a mock UUID, or should be replaced with real auth later
    return UUID("00000000-0000-0000-0000-000000000001")

def _use_adk_stream() -> bool:
    flag = os.getenv("AGENTHUB_USE_ADK_STREAM", "0").strip().lower()
    return flag in {"1", "true", "yes"}

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
            "artifactType": "code",
            "title": "mock_snippet.py",
            "content": {"language": "python", "code": "print('hello')"},
            "storageKey": None,
            "mimeType": None,
            "version": 1,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
    })))
    events.append(("agent_status", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": message_id,
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
    for event_name, data in events:
        yield _format_sse(event_name, data)
        await asyncio.sleep(0.05)


async def _adk_sse_stream(conv_id: UUID, user_id: UUID, prompt: Optional[str]) -> AsyncGenerator[str, None]:
    prompt_text = (prompt or "Hello from AgentHub").strip()
    agent = build_single_chat_agent()
    runner = AgentHubRunner(agent=agent)
    translator = ADKToSSETranslator()
    event_stream = runner.stream_single_chat(
        user_id=str(user_id),
        session_id=str(conv_id),
        message=prompt_text,
    )
    async for payload in translator.translate(
        event_stream=event_stream,
        conversation_id=str(conv_id),
    ):
        yield payload

@router.get("", response_model=Page[ConversationResponse])
async def get_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100, alias="pageSize"),
    keyword: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    return await ConversationService.list_conversations(
        db=db, user_id=user_id, page=page, page_size=page_size, keyword=keyword
    )

@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
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


@router.get("/{conv_id}", response_model=ConversationResponse)
async def get_conversation(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    return await ConversationService.get_conversation(db, conv_id)


@router.post("/{conv_id}/pins", status_code=status.HTTP_201_CREATED)
async def pin_message(
    conv_id: UUID,
    data: PinMessageRequest,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    pin = MessagePin(
        conversation_id=conv_id,
        message_id=data.message_id,
        created_by=user_id,
    )
    db.add(pin)
    await db.commit()
    return {"status": "pinned"}


@router.delete("/{conv_id}/pins/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unpin_message(
    conv_id: UUID,
    message_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    result = await db.execute(
        select(MessagePin).where(
            MessagePin.conversation_id == conv_id,
            MessagePin.message_id == message_id,
        )
    )
    pin = result.scalar_one_or_none()
    if not pin:
        raise HTTPException(status_code=404, detail="Pin not found")
    await db.delete(pin)
    await db.commit()
    return


async def _orchestrator_plan_stream(
    conv_id: UUID,
    orch_task: OrchestratorTask,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    from app.services.adk.planner import OrchestratorPlanner
    from app.models.message import Message as MsgModel
    from app.models.artifact import Artifact

    try:
        user_msg = await db.get(MsgModel, orch_task.trigger_message_id)
        mention_result = await db.execute(
            select(MessageMention).where(MessageMention.message_id == user_msg.id)
        )
        mentions = [m.agent_id for m in mention_result.scalars().all()]

        planner = OrchestratorPlanner()
        result = await planner.plan(
            db=db,
            user_message=user_msg.content,
            agent_ids=mentions,
            conversation_id=conv_id,
        )
    except Exception:
        yield _format_sse("error", {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": "",
            "code": "PLANNER_ERROR",
            "message": "任务拆解失败，请重试",
            "retryable": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        orch_task.status = "failed"
        await db.commit()
        return

    plan_msg = MsgModel(
        conversation_id=conv_id,
        sender_type="orchestrator",
        content=result.raw_text,
        status="done",
    )
    db.add(plan_msg)
    await db.flush()

    plan_dict = result.plan.model_dump(mode="json")
    artifact = Artifact(
        conversation_id=conv_id,
        message_id=plan_msg.id,
        artifact_type="plan",
        content=plan_dict,
    )
    db.add(artifact)

    orch_task.status = "awaiting_confirmation"
    orch_task.plan = plan_dict
    await db.commit()

    plan_array = [
        {
            "subtask_id": str(st.subtask_id),
            "agent": {"id": str(st.agent_id), "name": st.agent_name},
            "instruction": st.instruction,
            "priority": i + 1,
        }
        for i, st in enumerate(result.plan.subtasks)
    ]
    yield _format_sse("message_start", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": str(plan_msg.id),
        "sender": {"type": "orchestrator", "id": "", "name": "Orchestrator"},
        "meta": {"plan": plan_array},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    chars = list(result.raw_text)
    for i, ch in enumerate(chars):
        yield _format_sse("token", {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": str(plan_msg.id),
            "delta": ch,
            "index": i,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await asyncio.sleep(0.02)

    yield _format_sse("message_end", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": str(plan_msg.id),
        "finish_reason": "plan_draft",
        "usage": {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@router.get("/{conv_id}/stream")
async def stream_conversation(
    conv_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    prompt: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OrchestratorTask)
        .where(
            OrchestratorTask.conversation_id == conv_id,
            OrchestratorTask.status == "planning",
        )
        .order_by(OrchestratorTask.created_at.desc())
        .limit(1)
    )
    orch_task = result.scalar_one_or_none()

    if orch_task:
        return StreamingResponse(
            _orchestrator_plan_stream(conv_id, orch_task, db),
            media_type="text/event-stream",
        )

    if _use_adk_stream():
        return StreamingResponse(
            _adk_sse_stream(conv_id, user_id, prompt),
            media_type="text/event-stream",
        )
    return StreamingResponse(_mock_sse_stream(conv_id), media_type="text/event-stream")
