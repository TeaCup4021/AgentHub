import re
from uuid import UUID, uuid4
from typing import Optional, AsyncGenerator
from datetime import datetime, timezone
import asyncio
import json
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db, async_session_maker
from app.schemas.conversation import ConversationCreate, ConversationUpdate, ConversationResponse, PinMessageRequest
from app.schemas.base import Page
from app.models.conversation import Conversation
from app.models.conversation_participant import ConversationParticipant
from app.models.agent import Agent as AgentModel
from app.models.message import Message
from app.models.message_pin import MessagePin
from app.models.orchestrator_task import OrchestratorTask
from app.models.message_mention import MessageMention
from app.services.conversation import ConversationService
from app.services.adapters.adk_to_sse import ADKToSSETranslator
from app.services.adk.runner import AgentHubRunner
from app.services.adk.coordinator_builder import CoordinatorBuilder
from app.services.adapters.base import AdapterRegistry
from app.services.adk.workflow_builder import WorkflowBuilder
from app.services.adk.execution_tracer import ExecutionTracer
from app.services.adk.merge_aggregator import MergeAggregator
from app.services.artifact import ArtifactService
from app.services.artifact_detector import detect_artifacts
from app.services.message import MessageService

from app.api.deps import get_current_user, get_current_user_id

def _use_adk_stream() -> bool:
    flag = os.getenv("AGENTHUB_USE_ADK_STREAM", "0").strip().lower()
    return flag in {"1", "true", "yes"}

router = APIRouter()
logger = logging.getLogger("agenthub.stream")


def _format_sse(event_name: str, data: dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(data)}\n\n"


def _build_agent_order(subtasks: list) -> list[str]:
    """Convert plan subtasks (in plan order) to ADK agent name list.

    Each subtask's agent_id is mapped to the ADK-internal agent name
    that WorkflowBuilder creates: ``"agent_<uuid-with-dashes-replaced>"``
    with a dedup counter when the same agent appears multiple times.
    """
    order: list[str] = []
    counter: dict[str, int] = {}
    for st in subtasks:
        agent_id = None
        if hasattr(st, "agent_id"):
            agent_id = str(st.agent_id)
        elif isinstance(st, dict):
            agent_id = st.get("agent_id", "")
        if agent_id:
            base = "agent_" + agent_id.replace("-", "_")
            counter[base] = counter.get(base, 0) + 1
            if counter[base] == 1:
                order.append(base)
            else:
                order.append(f"{base}_{counter[base]}")
    return order


async def _error_sse_stream(code: str, message: str):
    """Yield a single error SSE event and return."""
    yield _format_sse("error", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": "",
        "message_id": "",
        "code": code,
        "message": message,
        "retryable": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


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

    # persist assistant message before yielding message_end
    full_content = "".join(
        data["delta"] for evt, data in events if evt == "token"
    )
    try:
        async with async_session_maker() as db:
            await MessageService.persist_stream_message(
                db=db,
                conv_id=conv_id,
                message_id=message_id,
                sender_name="Demo Agent",
                content=full_content,
                status="done",
            )
            await db.commit()
    except Exception:
        logger.exception("persist mock stream message failed")

    events.append(("message_end", build_payload({
        "finish_reason": "completed",
        "usage": {"input_tokens": 12, "output_tokens": 8},
    })))
    for event_name, data in events:
        yield _format_sse(event_name, data)
        await asyncio.sleep(0.05)


async def _persist_artifact_from_sse_payload(conv_id: UUID, payload: str) -> None:
    if not payload.startswith("event: artifact"):
        return

    try:
        data_line = next((line for line in payload.splitlines() if line.startswith("data: ")), None)
        if not data_line:
            return
        data = json.loads(data_line[len("data: "):])
        artifact = data.get("artifact") if isinstance(data, dict) else None
        message_id_raw = data.get("message_id") if isinstance(data, dict) else None
        if not isinstance(artifact, dict) or not message_id_raw:
            return

        message_id = UUID(str(message_id_raw))
        event_id = data.get("event_id") if isinstance(data.get("event_id"), str) else None

        async with async_session_maker() as db:
            await ArtifactService.append_version(
                db=db,
                conversation_id=conv_id,
                message_id=message_id,
                artifact_payload=artifact,
                event_id=event_id,
            )
            await db.commit()
    except Exception:
        logger.exception("persist artifact failed")


async def _parse_sse_event_type(payload: str) -> Optional[str]:
    for line in payload.splitlines():
        if line.startswith("event:"):
            return line[6:].strip()
    return None


def _parse_sse_data(payload: str) -> Optional[dict]:
    for line in payload.splitlines():
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])
            except json.JSONDecodeError:
                return None
    return None




_ARTIFACT_TAG_RE = re.compile(r'<artifact\b[^>]*>.*?</artifact>', re.DOTALL | re.IGNORECASE)
_ARTIFACT_SELF_CLOSING_RE = re.compile(r'<artifact\b[^>]*/>', re.IGNORECASE)


def _strip_artifact_tags(content: str) -> str:
    """Remove <artifact> XML markup, keeping any non-artifact text.

    Used before persisting message content so the frontend's MarkdownBubble
    does not display raw XML tags (CDATA sections, etc.) that leak through
    the rehypeRaw markdown renderer.
    """
    content = _ARTIFACT_TAG_RE.sub('', content)
    content = _ARTIFACT_SELF_CLOSING_RE.sub('', content)
    return content.strip()


async def _adk_sse_stream(
    conv_id: UUID,
    user_id: UUID,
    prompt: Optional[str],
    agent_model: AgentModel,
) -> AsyncGenerator[str, None]:
    from app.services.adk.runner import build_agent_from_model

    prompt_text = (prompt or "Hello from AgentHub").strip()
    logger.info(
        "_adk_sse_stream: conv=%s agent=%s provider=%s model=%s prompt=%.80s...",
        conv_id, agent_model.name, agent_model.provider, agent_model.model, prompt_text,
    )
    agent = build_agent_from_model(agent_model)
    runner = AgentHubRunner(agent=agent)
    translator = ADKToSSETranslator()
    event_stream = runner.stream_single_chat(
        user_id=str(user_id),
        session_id=str(conv_id),
        message=prompt_text,
    )
    accumulators: dict = {}
    try:
        async for payload in translator.translate(
            event_stream=event_stream,
            conversation_id=str(conv_id),
        ):
            event_type = await _parse_sse_event_type(payload)
            event_data = _parse_sse_data(payload)

            if event_type == "message_end" and event_data:
                mid = event_data.get("message_id")
                acc = accumulators.pop(mid, None) if mid else None
                if acc and acc["content"]:
                    clean_content = _strip_artifact_tags(acc["content"])
                    real_msg = None
                    try:
                        async with async_session_maker() as db:
                            real_msg = await MessageService.persist_stream_message(
                                db=db,
                                conv_id=conv_id,
                                message_id=mid,
                                sender_name=acc["sender_name"],
                                content=clean_content,
                                status="done",
                            )
                            await db.commit()
                    except Exception:
                        logger.exception("persist stream message failed")
                    real_msg_id = str(real_msg.id) if real_msg else str(uuid4())
                    artifacts = await detect_artifacts(acc["content"])
                    logger.info(
                        "_adk_sse_stream: message_end mid=%s real_msg_id=%s content_len=%d artifacts_found=%d",
                        mid, real_msg_id, len(acc["content"]), len(artifacts),
                    )
                    for art in artifacts:
                        art_event_id = str(uuid4())
                        art_payload = {
                            "version": "v1",
                            "event_id": art_event_id,
                            "conversation_id": str(conv_id),
                            "message_id": real_msg_id,
                            "artifact": art,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                        yield _format_sse("artifact", art_payload)
                        try:
                            async with async_session_maker() as db:
                                await ArtifactService.append_version(
                                    db=db,
                                    conversation_id=conv_id,
                                    message_id=UUID(real_msg_id),
                                    artifact_payload=art,
                                    event_id=art_event_id,
                                )
                                await db.commit()
                        except Exception:
                            logger.exception("persist detected artifact failed")
                yield payload
            else:
                yield payload

                if event_type == "message_start" and event_data:
                    mid = event_data.get("message_id")
                    sender = event_data.get("sender", {})
                    if mid:
                        accumulators[mid] = {
                            "content": "",
                            "sender_name": sender.get("name", "Agent") if isinstance(sender, dict) else "Agent",
                        }
                elif event_type == "token" and event_data:
                    mid = event_data.get("message_id")
                    if mid and mid in accumulators:
                        accumulators[mid]["content"] += event_data.get("delta", "")
                elif event_type == "error" and event_data:
                    logger.error(
                        "_adk_sse_stream: error event conv=%s code=%s message=%s",
                        conv_id, event_data.get("code", ""), event_data.get("message", ""),
                    )
                    mid = event_data.get("message_id")
                    acc = accumulators.pop(mid, None) if mid else None
                    if acc:
                        try:
                            async with async_session_maker() as db:
                                await MessageService.persist_stream_message(
                                    db=db,
                                    conv_id=conv_id,
                                    message_id=mid,
                                    sender_name=acc["sender_name"],
                                    content=acc.get("content", ""),
                                    status="failed",
                                )
                                await db.commit()
                        except Exception:
                            logger.exception("persist stream error message failed")

            try:
                await _persist_artifact_from_sse_payload(conv_id, payload)
            except Exception:
                logger.exception("persist artifact failed")
    except Exception:
        logger.exception("_adk_sse_stream: unhandled exception conv=%s", conv_id)
        yield _format_sse("error", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": "",
            "code": "STREAM_ERROR",
            "message": "流处理异常，请查看后端日志",
            "retryable": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

@router.get("", response_model=Page[ConversationResponse])
async def get_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100, alias="pageSize"),
    keyword: Optional[str] = None,
    project_id: Optional[str] = Query(None, alias="projectId"),
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    return await ConversationService.list_conversations(
        db=db, user_id=user_id, page=page, page_size=page_size,
        keyword=keyword, project_id=project_id,
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


@router.get("/{conv_id}/pins", response_model=None)
async def list_pins(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    from app.models.message import Message as MsgModel

    query = select(MessagePin).where(MessagePin.conversation_id == conv_id).order_by(MessagePin.created_at.desc())
    result = await db.execute(query)
    pins = result.scalars().all()

    items = []
    for pin in pins:
        msg = await db.get(MsgModel, pin.message_id)
        content_preview = (msg.content[:200] if msg.content else "") if msg else ""
        items.append({
            "pin_id": str(pin.id),
            "message_id": str(pin.message_id),
            "content_preview": content_preview,
            "sender_type": msg.sender_type if msg else "unknown",
            "pinned_at": pin.created_at.isoformat() if pin.created_at else None,
            "pinned_by": str(pin.created_by),
        })

    return items


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


@router.get("/{conv_id}/pins")
async def get_pins(
    conv_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id)
):
    conv = await db.get(Conversation, conv_id)
    if not conv or conv.owner_id != user_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    result = await db.execute(
        select(MessagePin).where(MessagePin.conversation_id == conv_id)
    )
    pins = result.scalars().all()
    if not pins:
        return []
    message_ids = [p.message_id for p in pins]
    msg_result = await db.execute(
        select(Message).where(Message.id.in_(message_ids))
    )
    messages_by_id = {m.id: m for m in msg_result.scalars().all()}
    sender_names = await MessageService._batch_get_sender_names(
        db,
        [(messages_by_id[mid].sender_type, messages_by_id[mid].sender_id) for mid in message_ids if mid in messages_by_id],
    )
    items = []
    for pin in pins:
        msg = messages_by_id.get(pin.message_id)
        if not msg:
            continue
        sender_key = (msg.sender_type, msg.sender_id)
        sender_name = sender_names.get(sender_key, "Unknown")
        items.append({
            "pinId": str(pin.id),
            "messageId": str(pin.message_id),
            "content": (msg.content or "")[:100],
            "senderType": msg.sender_type,
            "senderName": sender_name,
            "createdAt": pin.created_at.isoformat() if pin.created_at else None,
            "pinnedBy": str(pin.created_by) if pin.created_by else None,
        })
    return items


_planning_locks: set[UUID] = set()
_PLANNER_TIMEOUT_SECONDS = int(os.getenv("AGENTHUB_PLANNER_TIMEOUT", "90"))


async def _orchestrator_plan_stream(
    conv_id: UUID,
    orch_task: OrchestratorTask,
    db: AsyncSession,
    planner_agent_id_fallback: Optional[UUID] = None,
) -> AsyncGenerator[str, None]:
    from app.services.adk.planner import OrchestratorPlanner
    from app.models.message import Message as MsgModel
    from app.models.artifact import Artifact

    # Prevent duplicate planning for the same conversation
    if conv_id in _planning_locks:
        logger.warning("Planner already running for conv=%s, bailing", conv_id)
        orch_task.status = "failed"
        await db.commit()
        return
    _planning_locks.add(conv_id)

    try:
        user_msg = await db.get(MsgModel, orch_task.trigger_message_id)
        mention_result = await db.execute(
            select(MessageMention).where(MessageMention.message_id == user_msg.id)
        )
        mentions = [m.agent_id for m in mention_result.scalars().all()]

        # If no @mentions, fallback to conversation participants
        if not mentions:
            parts_result = await db.execute(
                select(ConversationParticipant.participant_id).where(
                    ConversationParticipant.conversation_id == conv_id,
                    ConversationParticipant.participant_type == "agent",
                )
            )
            mentions = list(parts_result.scalars().all())
            if mentions:
                logger.info(
                    "No @mentions found, fallback to conversation agents: %s",
                    [str(m) for m in mentions],
                )

        # Resolve planner agent if one was designated
        planner_agent = None
        planner_name = "Orchestrator"
        effective_planner_id = orch_task.planner_agent_id or planner_agent_id_fallback
        if effective_planner_id:
            planner_agent = await db.get(AgentModel, effective_planner_id)
            if planner_agent:
                planner_name = planner_agent.name
                logger.info(
                    "Agent-based planning: conv=%s planner=%s",
                    conv_id, planner_agent.name,
                )

        planner = OrchestratorPlanner()
        result = await asyncio.wait_for(
            planner.plan(
                db=db,
                user_message=user_msg.content,
                agent_ids=mentions,
                conversation_id=conv_id,
                planner_agent=planner_agent,
            ),
            timeout=_PLANNER_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning("Planner timed out after %ss for conv=%s task=%s", _PLANNER_TIMEOUT_SECONDS, conv_id, orch_task.id)
        orch_task.status = "failed"
        await db.commit()
        try:
            yield _format_sse("error", {
                "version": "v1",
                "event_id": str(uuid4()),
                "conversation_id": str(conv_id),
                "message_id": "",
                "code": "PLANNER_TIMEOUT",
                "message": f"任务规划超时（{_PLANNER_TIMEOUT_SECONDS}s），请重试或简化需求",
                "retryable": True,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except asyncio.CancelledError:
            pass
        return
    except asyncio.CancelledError:
        logger.warning("Planner cancelled (client disconnect) for conv=%s task=%s", conv_id, orch_task.id)
        orch_task.status = "failed"
        await db.commit()
        return
    except Exception:
        logger.exception("Planner failed for conv=%s task=%s", conv_id, orch_task.id)
        try:
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
        except asyncio.CancelledError:
            pass
        orch_task.status = "failed"
        await db.commit()
        return
    finally:
        _planning_locks.discard(conv_id)

    plan_msg = MsgModel(
        conversation_id=conv_id,
        sender_type="orchestrator",
        content=result.raw_text,
        status="done",
    )
    db.add(plan_msg)
    await db.flush()

    plan_dict = result.plan.model_dump(mode="json")
    plan_dict["planner_agent_id"] = str(orch_task.planner_agent_id) if orch_task.planner_agent_id else None
    plan_dict["planner_agent_name"] = planner_name
    artifact = Artifact(
        conversation_id=conv_id,
        message_id=plan_msg.id,
        artifact_type="plan",
        content=plan_dict,
    )
    db.add(artifact)

    orch_task.status = "plan_draft"
    orch_task.plan = plan_dict
    await db.commit()

    plan_array = [
        {
            "subtask_id": str(st.subtask_id),
            "agent": {"id": str(st.agent_id), "name": st.agent_name},
            "instruction": st.instruction,
            "depends_on": st.depends_on,
            "mode": st.mode,
            "output_key": st.output_key,
        }
        for st in result.plan.subtasks
    ]
    yield _format_sse("message_start", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": str(plan_msg.id),
        "sender": {"type": "orchestrator", "id": str(orch_task.planner_agent_id or ""), "name": planner_name},
        "meta": {
            "plan": plan_array,
            "planner_agent_id": str(orch_task.planner_agent_id) if orch_task.planner_agent_id else None,
            "planner_agent_name": planner_name,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    chars = result.raw_text
    batch_size = 3
    for i in range(0, len(chars), batch_size):
        batch = chars[i:i + batch_size]
        yield _format_sse("token", {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": str(plan_msg.id),
            "delta": batch,
            "index": i,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await asyncio.sleep(0.003)

    yield _format_sse("message_end", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": str(plan_msg.id),
        "finish_reason": "plan_draft",
        "usage": {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


async def _orchestrator_refine_stream(
    conv_id: UUID,
    orch_task: OrchestratorTask,
    db: AsyncSession,
    planner_agent_id_fallback: Optional[UUID] = None,
) -> AsyncGenerator[str, None]:
    """Re-run the planner with user feedback to produce an updated plan."""
    from app.services.adk.planner import OrchestratorPlanner
    from app.models.message import Message as MsgModel
    from app.models.artifact import Artifact
    from app.schemas.orchestrator import OrchestratorPlan

    logger.info("Plan refinement: conv=%s task=%s", conv_id, orch_task.id)

    try:
        # Load the plan and user feedback
        current_plan_dict = orch_task.plan or {}
        current_plan = OrchestratorPlan(**current_plan_dict) if current_plan_dict.get("subtasks") else None
        if not current_plan or not current_plan.subtasks:
            yield _format_sse("error", {
                "version": "v1", "event_id": str(uuid4()),
                "conversation_id": str(conv_id), "message_id": "",
                "code": "NO_PLAN", "message": "无可修改的计划",
                "retryable": False,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            orch_task.status = "failed"
            await db.commit()
            return

        # Find the user's refinement message (most recent user message)
        result = await db.execute(
            select(MsgModel)
            .where(
                MsgModel.conversation_id == conv_id,
                MsgModel.sender_type == "user",
            )
            .order_by(MsgModel.created_at.desc())
            .limit(1)
        )
        user_msg = result.scalar_one_or_none()
        if not user_msg:
            raise ValueError("No user feedback message found")

        # Load mentions from plan subtasks
        agent_ids = [st.agent_id for st in current_plan.subtasks]

        # Resolve planner agent
        planner_agent = None
        planner_name = "Orchestrator"
        effective_planner_id = orch_task.planner_agent_id or planner_agent_id_fallback
        if effective_planner_id:
            planner_agent = await db.get(AgentModel, effective_planner_id)
            if planner_agent:
                planner_name = planner_agent.name

        planner = OrchestratorPlanner()
        result = await asyncio.wait_for(
            planner.refine(
                db=db,
                current_plan=current_plan,
                user_feedback=user_msg.content,
                agent_ids=agent_ids,
                conversation_id=conv_id,
                planner_agent=planner_agent,
            ),
            timeout=_PLANNER_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning("Plan refinement timed out conv=%s", conv_id)
        orch_task.status = "plan_draft"  # back to draft so user can retry
        await db.commit()
        yield _format_sse("error", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": "",
            "code": "PLANNER_TIMEOUT",
            "message": f"计划修改超时，请重试",
            "retryable": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return
    except Exception:
        logger.exception("Plan refinement failed conv=%s", conv_id)
        orch_task.status = "plan_draft"
        await db.commit()
        yield _format_sse("error", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": "",
            "code": "REFINE_ERROR",
            "message": "计划修改失败，请重试",
            "retryable": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return

    # Persist the updated plan
    plan_msg = MsgModel(
        conversation_id=conv_id,
        sender_type="orchestrator",
        content=result.raw_text,
        status="done",
    )
    db.add(plan_msg)
    await db.flush()

    plan_dict = result.plan.model_dump(mode="json")
    plan_dict["planner_agent_id"] = str(orch_task.planner_agent_id) if orch_task.planner_agent_id else None
    plan_dict["planner_agent_name"] = planner_name
    artifact = Artifact(
        conversation_id=conv_id,
        message_id=plan_msg.id,
        artifact_type="plan",
        content=plan_dict,
    )
    db.add(artifact)

    orch_task.status = "plan_draft"
    orch_task.plan = plan_dict
    await db.commit()

    plan_array = [
        {
            "subtask_id": str(st.subtask_id),
            "agent": {"id": str(st.agent_id), "name": st.agent_name},
            "instruction": st.instruction,
            "depends_on": st.depends_on,
            "mode": st.mode,
            "output_key": st.output_key,
        }
        for st in result.plan.subtasks
    ]
    yield _format_sse("message_start", {
        "version": "v1", "event_id": str(uuid4()),
        "conversation_id": str(conv_id), "message_id": str(plan_msg.id),
        "sender": {"type": "orchestrator", "id": str(orch_task.planner_agent_id or ""), "name": planner_name},
        "meta": {
            "plan": plan_array,
            "planner_agent_id": str(orch_task.planner_agent_id) if orch_task.planner_agent_id else None,
            "planner_agent_name": planner_name,
        },
    })

    chars = result.raw_text
    batch_size = 3
    for i in range(0, len(chars), batch_size):
        batch = chars[i:i + batch_size]
        yield _format_sse("token", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": str(plan_msg.id),
            "delta": batch, "index": i,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await asyncio.sleep(0.003)
    yield _format_sse("message_end", {
        "version": "v1", "event_id": str(uuid4()),
        "conversation_id": str(conv_id), "message_id": str(plan_msg.id),
        "finish_reason": "plan_draft",
        "usage": {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


async def _accumulate_stream_events(
    sse_stream: AsyncGenerator[str, None],
    conv_id: UUID,
) -> AsyncGenerator[str, None]:
    """Wrap an SSE event stream with accumulator-based message persistence.

    Parses each SSE payload, accumulates token deltas per message_id, and
    persists completed messages to the DB on ``message_end`` / ``error``.
    """
    accumulators: dict = {}

    async for sse_event in sse_stream:
        event_type = await _parse_sse_event_type(sse_event)
        event_data = _parse_sse_data(sse_event)

        if event_type == "message_start" and event_data:
            mid = event_data.get("message_id")
            sender = event_data.get("sender", {})
            if mid:
                accumulators[mid] = {
                    "content": "",
                    "sender_name": sender.get("name", "Agent") if isinstance(sender, dict) else "Agent",
                }

        elif event_type == "token" and event_data:
            mid = event_data.get("message_id")
            if mid and mid in accumulators:
                accumulators[mid]["content"] += event_data.get("delta", "")

        elif event_type == "message_end" and event_data:
            mid = event_data.get("message_id")
            acc = accumulators.pop(mid, None) if mid else None
            if acc and acc["content"]:
                clean_content = _strip_artifact_tags(acc["content"])
                real_msg = None
                try:
                    async with async_session_maker() as persist_db:
                        real_msg = await MessageService.persist_stream_message(
                            db=persist_db, conv_id=conv_id, message_id=mid,
                            sender_name=acc["sender_name"], content=clean_content,
                            status="done",
                        )
                        await persist_db.commit()
                except Exception:
                    logger.exception("persist stream message failed")
                real_msg_id = str(real_msg.id) if real_msg else str(uuid4())
                artifacts = await detect_artifacts(acc["content"])
                logger.info(
                    "_accumulate_stream_events: message_end mid=%s real_msg_id=%s content_len=%d artifacts_found=%d",
                    mid, real_msg_id, len(acc["content"]), len(artifacts),
                )
                for art in artifacts:
                    art_event_id = str(uuid4())
                    art_payload = {
                        "version": "v1",
                        "event_id": art_event_id,
                        "conversation_id": str(conv_id),
                        "message_id": real_msg_id,
                        "artifact": art,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    yield _format_sse("artifact", art_payload)
                    try:
                        async with async_session_maker() as db:
                            await ArtifactService.append_version(
                                db=db,
                                conversation_id=conv_id,
                                message_id=UUID(real_msg_id),
                                artifact_payload=art,
                                event_id=art_event_id,
                            )
                            await db.commit()
                    except Exception:
                        logger.exception("persist detected artifact failed")

        elif event_type == "error" and event_data:
            mid = event_data.get("message_id")
            acc = accumulators.pop(mid, None) if mid else None
            if acc:
                try:
                    async with async_session_maker() as persist_db:
                        await MessageService.persist_stream_message(
                            db=persist_db, conv_id=conv_id, message_id=mid,
                            sender_name=acc["sender_name"],
                            content=acc.get("content", ""),
                            status="failed",
                        )
                        await persist_db.commit()
                except Exception:
                    logger.exception("persist stream error message failed")

        yield sse_event

        try:
            await _persist_artifact_from_sse_payload(conv_id, sse_event)
        except Exception:
            logger.exception("persist artifact failed")

    # Fallback: persist remaining accumulators that didn't receive message_end
    for mid, acc in accumulators.items():
        if acc["content"]:
            clean_content = _strip_artifact_tags(acc["content"])
            try:
                async with async_session_maker() as persist_db:
                    await MessageService.persist_stream_message(
                        db=persist_db, conv_id=conv_id, message_id=mid,
                        sender_name=acc["sender_name"], content=clean_content,
                        status="done",
                    )
                    await persist_db.commit()
            except Exception:
                logger.exception("persist fallback stream message failed")

async def _coordinator_stream(
    conv_id: UUID,
    user_id: UUID,
    prompt: Optional[str],
    orch_task: OrchestratorTask,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """Coordinator mode: LLM dynamically schedules sub-agents via ADK Collaborative Workflow.

    When orch_task.planner_agent_id is set, that agent acts as the coordinator;
    otherwise the default DeepSeek orchestrator is used.
    """
    from app.models.agent import Agent as AgentModel
    from app.services.adk.runner import _sanitize_agent_name

    plan = orch_task.plan or {}
    subtasks = plan.get("subtasks", [])
    agent_ids = [UUID(st["agent_id"]) for st in subtasks if st.get("agent_id")]

    result = await db.execute(select(AgentModel).where(AgentModel.id.in_(agent_ids)))
    agent_models = list(result.scalars().all())

    if not agent_models:
        yield _format_sse("error", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": "",
            "code": "NO_AGENTS", "message": "No agents available for execution",
            "retryable": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return

    # Resolve coordinator agent if user specified one via planner_agent_id
    coordinator_agent_model = None
    if orch_task.planner_agent_id:
        coord_result = await db.execute(
            select(AgentModel).where(AgentModel.id == orch_task.planner_agent_id)
        )
        coordinator_agent_model = coord_result.scalar_one_or_none()
        if coordinator_agent_model:
            logger.info(
                "Coordinator: using agent-planned coordinator | agent=%s model=%s",
                coordinator_agent_model.name, coordinator_agent_model.model,
            )

    tracer = ExecutionTracer()
    coordinator = CoordinatorBuilder().build(
        agent_models,
        execution_tracer=tracer,
        coordinator_agent=coordinator_agent_model,
    )
    runner = AgentHubRunner(agent=coordinator, app_name="agenthub_orchestrator")

    # Build agent emission order using sanitized agent names (matching ADK naming)
    agent_order = [
        _sanitize_agent_name(am.name)
        for am in agent_models
    ]
    translator = ADKToSSETranslator(sequential=True, agent_order=agent_order)

    try:
        async for sse_event in _accumulate_stream_events(
            translator.translate(
                runner.stream_single_chat(
                    user_id=str(user_id),
                    session_id=str(conv_id),
                    message=prompt or "",
                ),
                conversation_id=str(conv_id),
            ),
            conv_id=conv_id,
        ):
            yield sse_event
    except Exception:
        logger.exception("Coordinator stream failed for conv=%s", conv_id)
        yield _format_sse("error", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": "",
            "code": "COORDINATOR_ERROR",
            "message": "Coordinator execution failed",
            "retryable": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # Update orchestrator_subtasks with execution metrics
    # Use sanitized names to match tracer records (ADK uses sanitized agent names)
    await _update_subtask_metrics(
        orch_task_id=orch_task.id,
        tracer=tracer,
        agent_name_to_agent_id={
            _sanitize_agent_name(am.name): am.id
            for am in agent_models
        },
    )

    # MergeAggregator: generate orchestrator summary and stream via SSE
    # (streaming ensures the frontend receives it before the connection closes;
    #  DB-only creation would race with the frontend's onMessageEnd refetch.)
    try:
        aggregator = MergeAggregator()
        merge_result = await aggregator.aggregate(db, orch_task.id)

        if merge_result.summary_text:
            # --- Step 1: Persist to DB FIRST (so frontend refetch finds it) ---
            from app.models.message import Message as MsgModel
            from app.models.artifact import Artifact

            summary_meta = {
                "summary": {
                    "total": len(merge_result.sub_summaries),
                    "success": sum(1 for s in merge_result.sub_summaries if s.status == "success"),
                    "failed": sum(1 for s in merge_result.sub_summaries if s.status == "failed"),
                    "results": [
                        {
                            "subtask_id": s.subtask_id,
                            "agent_name": s.agent_name,
                            "status": s.status,
                            "latency_ms": s.latency_ms,
                            "summary": s.summary[:200],
                        }
                        for s in merge_result.sub_summaries
                    ],
                }
            }

            summary_msg = MsgModel(
                conversation_id=conv_id,
                sender_type="orchestrator",
                content=merge_result.summary_text,
                status="done",
                meta_data=summary_meta,
            )
            db.add(summary_msg)
            await db.flush()

            artifact = Artifact(
                conversation_id=conv_id,
                message_id=summary_msg.id,
                artifact_type="orchestrator_summary",
                title="Orchestrator Summary",
                content={
                    "sub_summaries": [
                        {
                            "agent_name": s.agent_name,
                            "subtask_id": s.subtask_id,
                            "status": s.status,
                            "latency_ms": s.latency_ms,
                            "summary": s.summary,
                            "output_message_id": s.output_message_id,
                            "depends_on": s.depends_on,
                        }
                        for s in merge_result.sub_summaries
                    ],
                    "has_conflict": merge_result.has_conflict,
                    "conflict_detail": merge_result.conflict_detail,
                },
            )
            db.add(artifact)

            # --- Step 2: Stream via SSE (DB already flushed, refetch will see it) ---
            summary_msg_id = str(summary_msg.id)

            yield _format_sse("message_start", {
                "version": "v1",
                "event_id": str(uuid4()),
                "conversation_id": str(conv_id),
                "message_id": summary_msg_id,
                "sender": {"type": "orchestrator", "id": "orchestrator", "name": "Orchestrator"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            # token events for summary text
            summary_chars = list(merge_result.summary_text)
            for i, ch in enumerate(summary_chars):
                yield _format_sse("token", {
                    "version": "v1",
                    "event_id": str(uuid4()),
                    "conversation_id": str(conv_id),
                    "message_id": summary_msg_id,
                    "delta": ch,
                    "index": i,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            # message_end
            yield _format_sse("message_end", {
                "version": "v1",
                "event_id": str(uuid4()),
                "conversation_id": str(conv_id),
                "message_id": summary_msg_id,
                "finish_reason": "completed",
                "usage": {},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
    except Exception:
        logger.exception("MergeAggregator/SSE summary failed for task=%s", orch_task.id)

    # Persist DAG data from tracer
    dag_data = tracer.get_dag_data()
    if orch_task.result_summary is None:
        orch_task.result_summary = {}
    orch_task.result_summary["dag_data"] = dag_data

    orch_task.status = "completed"
    await db.commit()


async def _dag_workflow_stream(
    conv_id: UUID,
    user_id: UUID,
    prompt: Optional[str],
    orch_task: OrchestratorTask,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    """Static DAG mode: execute pre-generated dependency graph via ADK Workflow Graph.

    Each subtask runs as the real DB Agent (with its system_prompt, model, provider),
    enriched with the Planner's specific task instruction.
    """
    from app.models.agent import Agent as AgentModel
    from app.schemas.orchestrator import OrchestratorPlan, SubTaskPlan

    plan = orch_task.plan or {}
    subtasks = plan.get("subtasks", [])

    agent_ids = {UUID(st["agent_id"]) for st in subtasks if st.get("agent_id")}
    result = await db.execute(
        select(AgentModel).where(AgentModel.id.in_(agent_ids))
    )
    agent_models: dict[UUID, AgentModel] = {a.id: a for a in result.scalars().all()}

    plan_obj = OrchestratorPlan(subtasks=[
        SubTaskPlan(
            subtask_id=st.get("subtask_id", st.get("subtaskId", f"sub-{uuid4().hex[:8]}")),
            agent_id=UUID(st["agent_id"]),
            agent_name=st.get("agent_name", st.get("agentName", "")),
            instruction=st["instruction"],
            depends_on=st.get("depends_on", st.get("dependsOn", [])),
            mode=st.get("mode", "single_turn"),
            output_key=st.get("output_key", st.get("outputKey")),
        )
        for st in subtasks
    ])

    if not plan_obj.subtasks:
        yield _format_sse("error", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": "",
            "code": "EMPTY_PLAN", "message": "Plan has no subtasks",
            "retryable": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return

    tracer = ExecutionTracer()
    workflow = WorkflowBuilder().build(plan_obj, agent_models=agent_models, execution_tracer=tracer)
    runner = AgentHubRunner(node=workflow, app_name="agenthub_orchestrator")
    logger.info(
        "DAG workflow start: conv=%s task=%s subtasks=%d prompt=%.80s...",
        conv_id, orch_task.id, len(plan_obj.subtasks), (prompt or "(empty)")[:80],
    )

    # Build agent emission order from plan subtasks
    agent_order = _build_agent_order(plan_obj.subtasks)
    translator = ADKToSSETranslator(sequential=True, agent_order=agent_order)

    try:
        event_count = 0
        agent_events: dict[str, int] = {}
        async for sse_event in _accumulate_stream_events(
            translator.translate(
                runner.stream_single_chat(
                    user_id=str(user_id),
                    session_id=str(conv_id),
                    message=prompt or "",
                ),
                conversation_id=str(conv_id),
            ),
            conv_id=conv_id,
        ):
            event_count += 1
            # Track per-agent event counts from SSE payload
            event_data = _parse_sse_data(sse_event)
            if event_data:
                sender = event_data.get("sender", {})
                agent = (sender.get("name") or sender.get("id") or "unknown") if isinstance(sender, dict) else "unknown"
                agent_events[agent] = agent_events.get(agent, 0) + 1
            yield sse_event
        logger.info(
            "DAG workflow done: conv=%s total_sse_events=%d agent_breakdown=%s tracer_records=%d",
            conv_id, event_count, dict(agent_events), len(tracer.records),
        )
    except Exception:
        logger.exception("DAG workflow stream failed for conv=%s", conv_id)
        yield _format_sse("error", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": "",
            "code": "DAG_EXECUTION_ERROR",
            "message": "DAG workflow execution failed",
            "retryable": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # Update orchestrator_subtasks with execution metrics
    name_to_agent_id: dict[str, UUID] = {}
    agent_name_counter: dict[str, int] = {}
    for st in plan_obj.subtasks:
        base = "agent_" + str(st.agent_id).replace("-", "_")
        agent_name_counter[base] = agent_name_counter.get(base, 0) + 1
        if agent_name_counter[base] == 1:
            agent_name = base
        else:
            agent_name = f"{base}_{agent_name_counter[base]}"
        name_to_agent_id[agent_name] = st.agent_id
    await _update_subtask_metrics(
        orch_task_id=orch_task.id,
        tracer=tracer,
        agent_name_to_agent_id=name_to_agent_id,
    )

    # Capture ADK Workflow.edges as native DAG topology
    tracer.capture_edges(workflow.edges if hasattr(workflow, 'edges') else [])

    # MergeAggregator: generate orchestrator summary
    await _run_merge_aggregator(db, orch_task.id, conv_id)

    # Persist DAG data from tracer (edges + records)
    dag_data = tracer.get_dag_data()
    if orch_task.result_summary is None:
        orch_task.result_summary = {}
    orch_task.result_summary["dag_data"] = dag_data

    orch_task.status = "completed"
    await db.commit()


async def _run_merge_aggregator(
    db: AsyncSession,
    orch_task_id: UUID,
    conv_id: UUID,
) -> None:
    """Run MergeAggregator after orchestration completes and persist summary."""
    try:
        from app.models.message import Message as MsgModel
        from app.models.artifact import Artifact

        aggregator = MergeAggregator()
        merge_result = await aggregator.aggregate(db, orch_task_id)

        summary_msg = MsgModel(
            conversation_id=conv_id,
            sender_type="orchestrator",
            content=merge_result.summary_text,
            status="done",
        )
        db.add(summary_msg)
        await db.flush()

        artifact = Artifact(
            conversation_id=conv_id,
            message_id=summary_msg.id,
            artifact_type="orchestrator_summary",
            title="Orchestrator Summary",
            content={
                "sub_summaries": [
                    {
                        "agent_name": s.agent_name,
                        "subtask_id": s.subtask_id,
                        "status": s.status,
                        "latency_ms": s.latency_ms,
                        "summary": s.summary,
                        "output_message_id": s.output_message_id,
                        "depends_on": s.depends_on,
                    }
                    for s in merge_result.sub_summaries
                ],
                "has_conflict": merge_result.has_conflict,
                "conflict_detail": merge_result.conflict_detail,
            },
        )
        db.add(artifact)
    except Exception:
        logger.exception("MergeAggregator failed for task=%s", orch_task_id)


async def _update_subtask_metrics(
    orch_task_id: UUID,
    tracer: ExecutionTracer,
    agent_name_to_agent_id: dict[str, UUID],
) -> None:
    """Write ExecutionTracer metrics back to orchestrator_subtasks rows."""
    try:
        async with async_session_maker() as u_db:
            from sqlalchemy import select as sa_select
            from app.models.orchestrator_subtask import OrchestratorSubtask

            result = await u_db.execute(
                sa_select(OrchestratorSubtask).where(
                    OrchestratorSubtask.task_id == orch_task_id,
                )
            )
            subtask_rows = list(result.scalars().all())

                        # Sort subtask_rows by execution_order for deterministic dedup naming
            subtask_rows.sort(key=lambda r: r.execution_order or 0)
            name_counter: dict[str, int] = {}
            for row in subtask_rows:
                agent_id_str = str(row.agent_id)
                base = "agent_" + agent_id_str.replace("-", "_")
                name_counter[base] = name_counter.get(base, 0) + 1
                if name_counter[base] == 1:
                    expected_name = base
                else:
                    expected_name = f"{base}_{name_counter[base]}"
                # Find matching tracer record by agent_name patterns
                for rec in tracer.records.values():
                    # DAG mode: agent_name = "agent_<uuid-with-dashes-replaced>[_<n>]"
                    # Coordinator mode: agent_name = AgentModel.name
                    matched_agent_id = agent_name_to_agent_id.get(rec.agent_name)
                    if rec.agent_name == expected_name or matched_agent_id == row.agent_id:
                        if rec.end_time and rec.start_time:
                            row.latency_ms = int((rec.end_time - rec.start_time) * 1000)
                        row.status = rec.status
                        if rec.error:
                            row.error_detail = rec.error
                        if rec.output_message_id:
                            try:
                                row.output_message_id = UUID(rec.output_message_id)
                            except (ValueError, TypeError):
                                pass
                        break
            await u_db.commit()
    except Exception:
        logger.exception("Failed to update subtask metrics for task=%s", orch_task_id)


@router.get("/{conv_id}/stream")
async def stream_conversation(
    conv_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    prompt: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    orchestrate_mode: Optional[str] = Query(None, alias="orchestrateMode"),
    planner_agent_id: Optional[UUID] = Query(None, alias="plannerAgentId"),
):
    from app.services.artifact_format import inject_artifact_reminder
    if prompt:
        prompt = inject_artifact_reminder(prompt)

    # Phase 1: Plan generation (status=planning)
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
            _orchestrator_plan_stream(conv_id, orch_task, db, planner_agent_id),
            media_type="text/event-stream",
        )

    # Phase 1.5: Plan refinement (status=refining) — user asked to modify plan
    result = await db.execute(
        select(OrchestratorTask)
        .where(
            OrchestratorTask.conversation_id == conv_id,
            OrchestratorTask.status == "refining",
        )
        .order_by(OrchestratorTask.created_at.desc())
        .limit(1)
    )
    refine_task = result.scalar_one_or_none()
    if refine_task:
        return StreamingResponse(
            _orchestrator_refine_stream(conv_id, refine_task, db, planner_agent_id),
            media_type="text/event-stream",
        )
    # Phase 2: Plan confirmed — execute workflow (always Coordinator mode)
    # If planner_agent_id is set, _coordinator_stream uses that agent as
    # the coordinator; otherwise it falls back to the default orchestrator.
    result = await db.execute(
        select(OrchestratorTask)
        .where(
            OrchestratorTask.conversation_id == conv_id,
            OrchestratorTask.status == "confirmed",
        )
        .order_by(OrchestratorTask.created_at.desc())
        .limit(1)
    )
    confirmed_task = result.scalar_one_or_none()

    if confirmed_task:
        return StreamingResponse(
            _coordinator_stream(conv_id, user_id, prompt, confirmed_task, db),
            media_type="text/event-stream",
        )

    # If a previous orchestration attempt failed, surface the error instead of
    # silently falling through to single-agent CLI/ADK routing.
    if orchestrate_mode == "auto_orchestrate":
        failed_result = await db.execute(
            select(OrchestratorTask)
            .where(
                OrchestratorTask.conversation_id == conv_id,
                OrchestratorTask.status == "failed",
            )
            .order_by(OrchestratorTask.created_at.desc())
            .limit(1)
        )
        if failed_result.scalar_one_or_none():
            return StreamingResponse(
                _error_sse_stream("PLANNER_ERROR", "任务拆解失败，请重试"),
                media_type="text/event-stream",
            )
        # If orchestrate_mode is set but no OrchestratorTask exists at all,
        # return a clear error instead of silently falling through to single-chat.
        any_task = await db.execute(
            select(OrchestratorTask).where(
                OrchestratorTask.conversation_id == conv_id,
            ).limit(1)
        )
        if not any_task.scalar_one_or_none():
            return StreamingResponse(
                _error_sse_stream(
                    "NO_ORCHESTRATOR_TASK",
                    "群聊模式需要先创建编排任务，请检查对话是否已绑定 Agent 后重试",
                ),
                media_type="text/event-stream",
            )

    # Single-chat routing: delegate to the agent's adapter.
    conv = await db.get(Conversation, conv_id)
    if conv:
        parts_result = await db.execute(
            select(ConversationParticipant.participant_id).where(
                ConversationParticipant.conversation_id == conv_id,
                ConversationParticipant.participant_type == "agent",
            )
        )
        agent_ids = parts_result.scalars().all()
        if agent_ids:
            agents_result = await db.execute(
                select(AgentModel).where(AgentModel.id.in_(agent_ids))
            )
            conv_agents = agents_result.scalars().all()
            if conv_agents:
                agent = conv_agents[0]
                try:
                    adapter = AdapterRegistry.get_for_agent(agent)
                except ValueError:
                    # Fallback: treat as non-CLI ADK agent if no adapter registered
                    if _use_adk_stream():
                        return StreamingResponse(
                            _adk_sse_stream(conv_id, user_id, prompt, agent),
                            media_type="text/event-stream",
                        )
                    return StreamingResponse(
                        _error_sse_stream("NO_STREAM_BACKEND", "ADK 流未启用且对话未绑定 CLI Agent"),
                        media_type="text/event-stream",
                    )

                if adapter.is_cli():
                    return StreamingResponse(
                        adapter.stream(agent, conv_id, user_id, prompt),
                        media_type="text/event-stream",
                    )

                if _use_adk_stream():
                    return StreamingResponse(
                        _adk_sse_stream(conv_id, user_id, prompt, agent),
                        media_type="text/event-stream",
                    )

                return StreamingResponse(
                    _error_sse_stream("NO_STREAM_BACKEND", "ADK 流未启用且对话未绑定 CLI Agent"),
                    media_type="text/event-stream",
                )

    # No agents bound to this conversation
    return StreamingResponse(
        _error_sse_stream("NO_AGENT", "该对话未绑定任何 Agent，请先选择 Agent"),
        media_type="text/event-stream",
    )
