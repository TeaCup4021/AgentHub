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
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import get_db, async_session_maker
from app.schemas.conversation import ConversationCreate, ConversationUpdate, ConversationResponse, PinMessageRequest
from app.schemas.base import Page
from app.schemas.message import ArtifactUpdate
from app.models.conversation import Conversation
from app.models.conversation_participant import ConversationParticipant
from app.models.agent import Agent as AgentModel
from app.models.message import Message
from app.models.message_pin import MessagePin
from app.models.orchestrator_task import OrchestratorTask
from app.models.orchestrator_subtask import OrchestratorSubtask
from app.models.message_mention import MessageMention
from app.models.artifact import Artifact
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
from app.services.deployment import DeploymentService
from app.services.deployment_command import parse_deploy_command, should_handle_deployment_command
from app.services.message import MessageService

from app.api.deps import get_current_user, get_current_user_id

def _use_adk_stream() -> bool:
    flag = os.getenv("AGENTHUB_USE_ADK_STREAM", "0").strip().lower()
    return flag in {"1", "true", "yes"}

router = APIRouter()
logger = logging.getLogger("agenthub.stream")


def _iter_text_values(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, dict):
        texts: list[str] = []
        for key, item in value.items():
            texts.extend(_iter_text_values(key))
            texts.extend(_iter_text_values(item))
        return texts
    if isinstance(value, (list, tuple, set)):
        texts: list[str] = []
        for item in value:
            texts.extend(_iter_text_values(item))
        return texts
    return [str(value)]


def _contains_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def _prefers_chinese(*values) -> bool:
    return any(_contains_cjk(text) for value in values for text in _iter_text_values(value))


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


def _build_plan_agent_name_map(subtasks: list, agent_models: dict[UUID, AgentModel]) -> dict[str, dict]:
    """Map ADK workflow node names back to persisted Agent identities."""
    name_map: dict[str, dict] = {}
    counter: dict[str, int] = {}
    for st in subtasks:
        agent_id = None
        agent_name = None
        if hasattr(st, "agent_id"):
            agent_id = st.agent_id
            agent_name = getattr(st, "agent_name", None)
        elif isinstance(st, dict):
            raw_agent_id = st.get("agent_id", st.get("agentId"))
            if raw_agent_id:
                try:
                    agent_id = UUID(str(raw_agent_id))
                except (TypeError, ValueError):
                    agent_id = None
            agent_name = st.get("agent_name", st.get("agentName"))
        if not agent_id:
            continue
        agent_model = agent_models.get(agent_id)
        base = "agent_" + str(agent_id).replace("-", "_")
        counter[base] = counter.get(base, 0) + 1
        node_name = base if counter[base] == 1 else f"{base}_{counter[base]}"
        name_map[node_name] = {
            "id": str(agent_id),
            "name": agent_model.name if agent_model else (agent_name or node_name),
        }
    return name_map


def _build_sanitized_agent_name_map(agent_models: list[AgentModel]) -> dict[str, dict]:
    """Map ADK sanitized display names back to persisted Agent identities."""
    from app.services.adk.runner import _sanitize_agent_name

    name_map: dict[str, dict] = {}
    for agent_model in agent_models:
        name_map[_sanitize_agent_name(agent_model.name)] = {
            "id": str(agent_model.id),
            "name": agent_model.name,
        }
    return name_map


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


async def _deployment_command_stream(
    conv_id: UUID,
    user_id: UUID,
    target: str,
    prompt: Optional[str],
) -> AsyncGenerator[str, None]:
    message_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()
    status_text = {
        "preview": "Deployment card created. A preview URL can be generated.",
        "static_site": "Deployment card created. A static site can be published.",
        "source_package": "Deployment card created. A source package can be downloaded.",
        "container": "Deployment card created. Container deployment is queued.",
    }.get(target, "Deployment card created.")

    try:
        async with async_session_maker() as db:
            msg = await MessageService.persist_stream_message(
                db=db,
                conv_id=conv_id,
                message_id=str(message_id),
                sender_name="Deployment Agent",
                content=status_text,
                status="done",
            )
            deployment = await DeploymentService.create_job(
                db=db,
                conv_id=conv_id,
                user_id=user_id,
                name="Deploy",
                target=target,
                trigger_message_id=msg.id if msg else message_id,
                auto_run=target in {"preview", "source_package"},
            )
            artifact = DeploymentService.build_status_artifact(deployment)
            artifact_event_id = str(uuid4())
            await ArtifactService.append_version(
                db=db,
                conversation_id=conv_id,
                message_id=msg.id if msg else message_id,
                artifact_payload=artifact,
                event_id=artifact_event_id,
            )
            await db.commit()
    except ValueError as exc:
        logger.info("deployment command failed: conv=%s prompt=%r error=%s", conv_id, prompt, exc)
        yield _format_sse("error", {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": str(message_id),
            "code": "NO_DEPLOYABLE_SOURCE",
            "message": str(exc),
            "retryable": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return
    except Exception as exc:
        logger.exception("deployment command stream failed conv=%s", conv_id)
        error_text = str(exc)
        if isinstance(exc, ProgrammingError) and "deployments" in error_text and "does not exist" in error_text:
            code = "DEPLOYMENT_SCHEMA_MISSING"
            message = "閮ㄧ讲琛ㄦ湭鍒濆鍖栵紝璇峰湪鍚庣鎵ц鏁版嵁搴撹縼绉伙細python -m alembic upgrade head"
            retryable = False
        else:
            code = "DEPLOYMENT_COMMAND_ERROR"
            message = "閮ㄧ讲浠诲姟鍒涘缓澶辫触"
            retryable = True
        yield _format_sse("error", {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": str(message_id),
            "code": code,
            "message": message,
            "retryable": retryable,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return

    base_payload = {
        "version": "v1",
        "conversation_id": str(conv_id),
        "message_id": str(message_id),
    }
    yield _format_sse("message_start", {
        **base_payload,
        "event_id": str(uuid4()),
        "sender": {"type": "agent", "id": "deployment", "name": "Deployment Agent"},
        "timestamp": now,
    })
    yield _format_sse("token", {
        **base_payload,
        "event_id": str(uuid4()),
        "delta": status_text,
        "index": 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    yield _format_sse("artifact", {
        **base_payload,
        "event_id": artifact_event_id,
        "artifact": artifact,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    yield _format_sse("message_end", {
        **base_payload,
        "event_id": str(uuid4()),
        "finish_reason": "completed",
        "usage": {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


async def _latest_agent_config_artifact(conv_id: UUID) -> Optional[dict]:
    async with async_session_maker() as db:
        result = await db.execute(
            select(Artifact)
            .where(
                Artifact.conversation_id == conv_id,
                Artifact.artifact_type == "agent_config",
            )
            .order_by(Artifact.created_at.desc())
            .limit(1)
        )
        artifact = result.scalar_one_or_none()
        if not artifact:
            return None
        return dict(artifact.content or {})


async def _agent_builder_stream(
    conv_id: UUID,
    user_id: UUID,
    prompt: Optional[str],
) -> AsyncGenerator[str, None]:
    from app.services.agent_builder import AgentBuilderService

    prompt_text = (prompt or "").strip()
    message_id = uuid4()
    now = datetime.now(timezone.utc).isoformat()

    try:
        previous_config = await _latest_agent_config_artifact(conv_id)
        draft = await AgentBuilderService.build_draft(
            prompt_text,
            previous_config,
            conversation_id=conv_id,
            user_id=user_id,
        )
        artifact_event_id = str(uuid4())
        artifact_payload = {
            "id": str(uuid4()),
            "artifactType": "agent_config",
            "title": "Agent 配置草案",
            "content": draft.agent_config,
            "storageKey": None,
            "mimeType": None,
            "version": 1,
            "createdAt": now,
        }

        async with async_session_maker() as db:
            msg = Message(
                id=message_id,
                conversation_id=conv_id,
                sender_type="agent",
                sender_id=None,
                content_type="text",
                content=draft.reply,
                status="done",
                meta_data={"agent_name": "Agent Builder", "builder": "agent_builder"},
            )
            db.add(msg)
            await db.flush()
            await ArtifactService.append_version(
                db=db,
                conversation_id=conv_id,
                message_id=msg.id,
                artifact_payload=artifact_payload,
                event_id=artifact_event_id,
            )
            conv = await db.get(Conversation, conv_id)
            if conv and conv.owner_id == user_id:
                conv.last_active_at = datetime.now(timezone.utc)
            await db.commit()
    except Exception:
        logger.exception("agent builder stream failed conv=%s", conv_id)
        yield _format_sse("error", {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": str(message_id),
            "code": "AGENT_BUILDER_ERROR",
            "message": "Agent 配置草案生成失败，请重试。",
            "retryable": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return

    base_payload = {
        "version": "v1",
        "conversation_id": str(conv_id),
        "message_id": str(message_id),
    }
    yield _format_sse("message_start", {
        **base_payload,
        "event_id": str(uuid4()),
        "sender": {"type": "orchestrator", "id": "agent_builder", "name": "Agent Builder"},
        "timestamp": now,
    })
    for i in range(0, len(draft.reply), 3):
        yield _format_sse("token", {
            **base_payload,
            "event_id": str(uuid4()),
            "delta": draft.reply[i:i + 3],
            "index": i,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await asyncio.sleep(0.003)
    yield _format_sse("artifact", {
        **base_payload,
        "event_id": artifact_event_id,
        "artifact": artifact_payload,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    yield _format_sse("message_end", {
        **base_payload,
        "event_id": str(uuid4()),
        "finish_reason": "agent_config_draft",
        "usage": {},
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
        artifact_event = _extract_artifact_event(_parse_sse_data(payload))
        if not artifact_event:
            return

        await _persist_artifact_event(
            conv_id=conv_id,
            message_id=artifact_event["message_id"],
            artifact=artifact_event["artifact"],
            event_id=artifact_event["event_id"],
        )
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


def _extract_artifact_event(event_data: Optional[dict]) -> Optional[dict]:
    if not isinstance(event_data, dict):
        return None
    artifact = event_data.get("artifact")
    message_id = event_data.get("message_id")
    if not isinstance(artifact, dict) or not message_id:
        return None
    event_id = event_data.get("event_id")
    return {
        "message_id": str(message_id),
        "artifact": artifact,
        "event_id": event_id if isinstance(event_id, str) else None,
    }


async def _persist_artifact_event(
    conv_id: UUID,
    message_id: UUID | str,
    artifact: dict,
    event_id: Optional[str],
) -> None:
    async with async_session_maker() as db:
        await ArtifactService.append_version(
            db=db,
            conversation_id=conv_id,
            message_id=UUID(str(message_id)),
            artifact_payload=artifact,
            event_id=event_id,
        )
        await db.commit()


async def _persist_pending_artifact_events(
    conv_id: UUID,
    message_id: UUID | str,
    artifact_events: list[dict],
    source: str,
) -> None:
    for artifact_event in artifact_events:
        try:
            await _persist_artifact_event(
                conv_id=conv_id,
                message_id=message_id,
                artifact=artifact_event["artifact"],
                event_id=artifact_event["event_id"],
            )
        except Exception:
            logger.exception("%s: persist pending artifact failed", source)



from app.services.artifact_detector import strip_artifact_tags

# Backward-compatible alias
_strip_artifact_tags = strip_artifact_tags


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
    translator = ADKToSSETranslator(
        agent_name_map={
            agent.name: {
                "id": str(agent_model.id),
                "name": agent_model.name,
            }
        }
    )
    event_stream = runner.stream_single_chat(
        user_id=str(user_id),
        session_id=str(conv_id),
        message=prompt_text,
    )
    accumulators: dict = {}
    pending_artifacts: dict[str, list[dict]] = {}
    try:
        async for payload in translator.translate(
            event_stream=event_stream,
            conversation_id=str(conv_id),
        ):
            event_type = await _parse_sse_event_type(payload)
            event_data = _parse_sse_data(payload)

            if event_type == "message_end" and event_data:
                mid = event_data.get("message_id")
                pending = pending_artifacts.pop(str(mid), []) if mid else []
                acc = accumulators.pop(mid, None) if mid else None
                if (acc and acc["content"]) or pending:
                    raw_content = acc["content"] if acc else ""
                    sender_name = acc["sender_name"] if acc else "Agent"
                    sender_id = acc.get("sender_id") if acc else None
                    clean_content = _strip_artifact_tags(raw_content)
                    real_msg = None
                    try:
                        async with async_session_maker() as db:
                            real_msg = await MessageService.persist_stream_message(
                                db=db,
                                conv_id=conv_id,
                                message_id=mid,
                                sender_name=sender_name,
                                sender_id=sender_id,
                                content=clean_content,
                                status="done",
                            )
                            await db.commit()
                    except Exception:
                        logger.exception("persist stream message failed")
                    real_msg_id = str(real_msg.id) if real_msg else ""
                    if real_msg_id and pending:
                        await _persist_pending_artifact_events(
                            conv_id=conv_id,
                            message_id=real_msg_id,
                            artifact_events=pending,
                            source="_adk_sse_stream",
                        )
                    artifacts = await detect_artifacts(raw_content) if raw_content else []
                    logger.info(
                        "_adk_sse_stream: message_end mid=%s real_msg_id=%s content_len=%d artifacts_found=%d pending_artifacts=%d",
                        mid, real_msg_id, len(raw_content), len(artifacts), len(pending),
                    )
                    if real_msg_id:
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
                            "sender_id": sender.get("id") if isinstance(sender, dict) else None,
                        }
                elif event_type == "token" and event_data:
                    mid = event_data.get("message_id")
                    if mid and mid in accumulators:
                        accumulators[mid]["content"] += event_data.get("delta", "")
                elif event_type == "artifact" and event_data:
                    artifact_event = _extract_artifact_event(event_data)
                    if artifact_event:
                        pending_artifacts.setdefault(artifact_event["message_id"], []).append(artifact_event)
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
                                    sender_id=acc.get("sender_id"),
                                    content=acc.get("content", ""),
                                    status="failed",
                                )
                                await db.commit()
                        except Exception:
                            logger.exception("persist stream error message failed")
        for pending_mid, pending in pending_artifacts.items():
            await _persist_pending_artifact_events(
                conv_id=conv_id,
                message_id=pending_mid,
                artifact_events=pending,
                source="_adk_sse_stream.final",
            )
    except Exception:
        logger.exception("_adk_sse_stream: unhandled exception conv=%s", conv_id)
        yield _format_sse("error", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": "",
            "code": "STREAM_ERROR",
            "message": "Stream processing error. Check backend logs.",
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


async def _ensure_conversation_owner(
    db: AsyncSession,
    conv_id: UUID,
    user_id: UUID,
) -> None:
    result = await db.execute(
        select(Conversation.id).where(
            Conversation.id == conv_id,
            Conversation.owner_id == user_id,
            Conversation.is_deleted == False,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Conversation not found")


def _serialize_artifact(row: Artifact) -> dict:
    return {
        "id": row.id,
        "artifactType": row.artifact_type,
        "title": row.title,
        "content": row.content,
        "storageKey": row.storage_key,
        "mimeType": row.mime_type,
        "version": row.version,
        "createdAt": row.created_at,
    }


@router.get("/{conv_id}/artifacts/{merge_key}/versions")
async def get_artifact_versions(
    conv_id: UUID,
    merge_key: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    await _ensure_conversation_owner(db, conv_id, user_id)
    versions, total = await ArtifactService.get_versions(
        db=db,
        conversation_id=conv_id,
        merge_key=merge_key,
        page=page,
        page_size=page_size,
    )
    return {
        "list": [_serialize_artifact(row) for row in versions],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }


@router.patch("/{conv_id}/artifacts/{artifact_id}")
async def update_conversation_artifact(
    conv_id: UUID,
    artifact_id: UUID,
    data: ArtifactUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    await _ensure_conversation_owner(db, conv_id, user_id)
    existing = await db.get(Artifact, artifact_id)
    if not existing or existing.conversation_id != conv_id:
        raise HTTPException(status_code=404, detail="Artifact not found")

    try:
        row = await ArtifactService.update_content(
            db=db,
            artifact_id=artifact_id,
            new_content=data.content,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Artifact not found")
    await db.commit()

    return {
        "artifact": _serialize_artifact(row),
        "version": row.version,
    }


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

        execution_candidates = await _load_group_execution_agents(
            db=db,
            conv_id=conv_id,
            orchestrator_agent_id=effective_planner_id,
        )
        candidate_agent_ids = [agent.id for agent in execution_candidates]

        planner = OrchestratorPlanner()
        result = await asyncio.wait_for(
            planner.plan(
                db=db,
                user_message=user_msg.content,
                agent_ids=candidate_agent_ids,
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
                "message": f"Planning timed out after {_PLANNER_TIMEOUT_SECONDS}s. Please retry or simplify the request.",
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
                "message": "Planning failed. Please retry.",
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

    plan_array = [
        {
            "subtask_id": str(st.subtask_id),
            "agent": {"id": str(st.agent_id or ""), "name": st.agent_name or ""},
            "agent_id": str(st.agent_id) if st.agent_id else None,
            "agent_name": st.agent_name,
            "assignment_reason": st.assignment_reason,
            "instruction": st.instruction,
            "recommended_capabilities": st.recommended_capabilities,
            "acceptance_criteria": st.acceptance_criteria,
            "can_parallel": st.can_parallel,
            "depends_on": st.depends_on,
            "mode": st.mode,
            "output_key": st.output_key,
        }
        for st in result.plan.subtasks
    ]

    plan_msg = MsgModel(
        conversation_id=conv_id,
        sender_type="orchestrator",
        content_type="plan",
        content=result.raw_text,
        status="done",
    )
    db.add(plan_msg)
    await db.flush()
    plan_msg.meta_data = {
        "planId": str(plan_msg.id),
        "plan_id": str(plan_msg.id),
        "subtasks": plan_array,
        "plannerAgentId": str(orch_task.planner_agent_id) if orch_task.planner_agent_id else None,
        "planner_agent_id": str(orch_task.planner_agent_id) if orch_task.planner_agent_id else None,
        "plannerAgentName": planner_name,
        "planner_agent_name": planner_name,
    }

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
                "code": "NO_PLAN", "message": "No editable plan found.",
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

        # Resolve planner agent
        planner_agent = None
        planner_name = "Orchestrator"
        effective_planner_id = orch_task.planner_agent_id or planner_agent_id_fallback
        if effective_planner_id:
            planner_agent = await db.get(AgentModel, effective_planner_id)
            if planner_agent:
                planner_name = planner_agent.name

        execution_candidates = await _load_group_execution_agents(
            db=db,
            conv_id=conv_id,
            orchestrator_agent_id=effective_planner_id,
        )
        agent_ids = [agent.id for agent in execution_candidates]

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
            "message": "Plan refinement timed out. Please retry.",
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
            "message": "Plan refinement failed. Please retry.",
            "retryable": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return

    # Persist the updated plan
    plan_array = [
        {
            "subtask_id": str(st.subtask_id),
            "agent": {"id": str(st.agent_id or ""), "name": st.agent_name or ""},
            "agent_id": str(st.agent_id) if st.agent_id else None,
            "agent_name": st.agent_name,
            "assignment_reason": st.assignment_reason,
            "instruction": st.instruction,
            "recommended_capabilities": st.recommended_capabilities,
            "acceptance_criteria": st.acceptance_criteria,
            "can_parallel": st.can_parallel,
            "depends_on": st.depends_on,
            "mode": st.mode,
            "output_key": st.output_key,
        }
        for st in result.plan.subtasks
    ]

    plan_msg = MsgModel(
        conversation_id=conv_id,
        sender_type="orchestrator",
        content_type="plan",
        content=result.raw_text,
        status="done",
    )
    db.add(plan_msg)
    await db.flush()
    plan_msg.meta_data = {
        "planId": str(plan_msg.id),
        "plan_id": str(plan_msg.id),
        "subtasks": plan_array,
        "plannerAgentId": str(orch_task.planner_agent_id) if orch_task.planner_agent_id else None,
        "planner_agent_id": str(orch_task.planner_agent_id) if orch_task.planner_agent_id else None,
        "plannerAgentName": planner_name,
        "planner_agent_name": planner_name,
    }

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
    pending_artifacts: dict[str, list[dict]] = {}

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
                    "sender_id": sender.get("id") if isinstance(sender, dict) else None,
                }

        elif event_type == "token" and event_data:
            mid = event_data.get("message_id")
            if mid and mid in accumulators:
                accumulators[mid]["content"] += event_data.get("delta", "")

        elif event_type == "message_end" and event_data:
            mid = event_data.get("message_id")
            pending = pending_artifacts.pop(str(mid), []) if mid else []
            acc = accumulators.pop(mid, None) if mid else None
            if (acc and acc["content"]) or pending:
                raw_content = acc["content"] if acc else ""
                sender_name = acc["sender_name"] if acc else "Agent"
                sender_id = acc.get("sender_id") if acc else None
                clean_content = _strip_artifact_tags(raw_content)
                real_msg = None
                try:
                    async with async_session_maker() as persist_db:
                        real_msg = await MessageService.persist_stream_message(
                            db=persist_db, conv_id=conv_id, message_id=mid,
                            sender_name=sender_name, sender_id=sender_id, content=clean_content,
                            status="done",
                        )
                        await persist_db.commit()
                except Exception:
                    logger.exception("persist stream message failed")
                real_msg_id = str(real_msg.id) if real_msg else ""
                if real_msg_id and pending:
                    await _persist_pending_artifact_events(
                        conv_id=conv_id,
                        message_id=real_msg_id,
                        artifact_events=pending,
                        source="_accumulate_stream_events",
                    )
                artifacts = await detect_artifacts(raw_content) if raw_content else []
                logger.info(
                    "_accumulate_stream_events: message_end mid=%s real_msg_id=%s content_len=%d artifacts_found=%d pending_artifacts=%d",
                    mid, real_msg_id, len(raw_content), len(artifacts), len(pending),
                )
                if real_msg_id:
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

        elif event_type == "artifact" and event_data:
            artifact_event = _extract_artifact_event(event_data)
            if artifact_event:
                pending_artifacts.setdefault(artifact_event["message_id"], []).append(artifact_event)

        elif event_type == "error" and event_data:
            mid = event_data.get("message_id")
            acc = accumulators.pop(mid, None) if mid else None
            if acc:
                try:
                    async with async_session_maker() as persist_db:
                        await MessageService.persist_stream_message(
                            db=persist_db, conv_id=conv_id, message_id=mid,
                            sender_name=acc["sender_name"],
                            sender_id=acc.get("sender_id"),
                            content=acc.get("content", ""),
                            status="failed",
                        )
                        await persist_db.commit()
                except Exception:
                    logger.exception("persist stream error message failed")

        yield sse_event

    # Fallback: persist remaining accumulators that didn't receive message_end
    for mid, acc in accumulators.items():
        if acc["content"]:
            clean_content = _strip_artifact_tags(acc["content"])
            real_msg = None
            try:
                async with async_session_maker() as persist_db:
                    real_msg = await MessageService.persist_stream_message(
                        db=persist_db, conv_id=conv_id, message_id=mid,
                        sender_name=acc["sender_name"], sender_id=acc.get("sender_id"), content=clean_content,
                        status="done",
                    )
                    await persist_db.commit()
            except Exception:
                logger.exception("persist fallback stream message failed")
            pending = pending_artifacts.pop(str(mid), [])
            if real_msg and pending:
                await _persist_pending_artifact_events(
                    conv_id=conv_id,
                    message_id=real_msg.id,
                    artifact_events=pending,
                    source="_accumulate_stream_events.final",
                )

    for pending_mid, pending in pending_artifacts.items():
        await _persist_pending_artifact_events(
            conv_id=conv_id,
            message_id=pending_mid,
            artifact_events=pending,
            source="_accumulate_stream_events.final",
        )


def _normalize_plan_stage(stage: dict, index: int) -> dict:
    stage_id = stage.get("subtask_id", stage.get("subtaskId")) or f"s{index + 1}"
    return {
        "subtask_id": str(stage_id),
        "agent_id": stage.get("agent_id", stage.get("agentId")),
        "agent_name": stage.get("agent_name", stage.get("agentName")),
        "assignment_reason": stage.get(
            "assignment_reason",
            stage.get("assignmentReason"),
        ),
        "instruction": stage.get("instruction", ""),
        "recommended_capabilities": stage.get(
            "recommended_capabilities",
            stage.get("recommendedCapabilities", []),
        ) or [],
        "acceptance_criteria": stage.get(
            "acceptance_criteria",
            stage.get("acceptanceCriteria", []),
        ) or [],
        "can_parallel": stage.get("can_parallel", stage.get("canParallel", True)),
        "depends_on": stage.get("depends_on", stage.get("dependsOn", [])) or [],
        "mode": stage.get("mode", "single_turn"),
        "output_key": stage.get("output_key", stage.get("outputKey")),
    }


def _agent_capabilities(agent: AgentModel) -> list[str]:
    caps = agent.capabilities or []
    if isinstance(caps, list):
        return [str(c).lower() for c in caps]
    if isinstance(caps, dict):
        return [str(k).lower() for k, v in caps.items() if v]
    return [str(caps).lower()] if caps else []


def _score_agent_for_stage(agent: AgentModel, stage: dict) -> int:
    needs = [str(c).lower() for c in stage.get("recommended_capabilities", [])]
    if not needs:
        return 0
    haystack = " ".join(
        [
            agent.name or "",
            agent.system_prompt or "",
            " ".join(_agent_capabilities(agent)),
        ]
    ).lower()
    return sum(1 for need in needs if need and need in haystack)


def _build_assignment_instruction(stage: dict, agent: AgentModel, fallback: bool = False) -> str:
    caps = stage.get("recommended_capabilities", [])
    criteria = stage.get("acceptance_criteria", [])
    use_chinese = _prefers_chinese(stage)
    parts: list[str] = []
    if use_chinese:
        if fallback:
            parts.append("这是首次分配智能体执行失败后的兜底重试。")
        parts.append(f"阶段：{stage['subtask_id']}")
        parts.append(f"目标：{stage.get('instruction', '')}")
        if caps:
            parts.append("推荐能力：" + "、".join(str(c) for c in caps))
        if criteria:
            parts.append("验收标准：\n" + "\n".join(f"- {c}" for c in criteria))
        parts.append(
            "只完成当前被分配的阶段任务，不要协调其他智能体，不要重新规划或分工。"
            "请直接产出本阶段的具体交付物。最终回复必须使用中文，"
            "不要使用英文开场白或英文状态说明。"
        )
    else:
        if fallback:
            parts.append("This is a fallback attempt after the first assigned agent failed.")
        parts.append(f"Stage: {stage['subtask_id']}")
        parts.append(f"Goal: {stage.get('instruction', '')}")
        if caps:
            parts.append("Recommended capabilities: " + ", ".join(str(c) for c in caps))
        if criteria:
            parts.append("Acceptance criteria:\n" + "\n".join(f"- {c}" for c in criteria))
        parts.append(
            "Work only on this assigned stage. Do not coordinate other agents. "
            "Produce the concrete deliverable for this stage and reply in the user's language. "
            "Avoid generic preambles; start with the deliverable."
        )
    return "\n\n".join(parts)


def _stage_agent_id(stage: dict) -> str | None:
    raw = stage.get("agent_id", stage.get("agentId"))
    return str(raw) if raw else None


def _stage_agent_name(stage: dict) -> str | None:
    raw = stage.get("agent_name", stage.get("agentName"))
    return str(raw) if raw else None


def _stage_assignment_reason(stage: dict) -> str | None:
    raw = stage.get("assignment_reason", stage.get("assignmentReason"))
    return str(raw) if raw else None


def _build_confirmed_assignments(
    stages: list[dict],
    agents: list[AgentModel],
) -> list[dict]:
    """Convert user-reviewed planner assignments into executable assignments.

    Returns an empty list when any stage lacks a valid current execution agent,
    so the legacy dynamic assignment path can safely take over.
    """
    if not stages or not agents:
        return []

    agent_by_id = {str(agent.id): agent for agent in agents}
    assignments: list[dict] = []
    for stage in stages:
        agent_id = _stage_agent_id(stage)
        if not agent_id or agent_id not in agent_by_id:
            return []
        agent = agent_by_id[agent_id]
        assignments.append({
            "stage_id": stage["subtask_id"],
            "subtask_id": f"{stage['subtask_id']}__{agent_id.replace('-', '_')}",
            "agent_id": agent_id,
            "agent_name": _stage_agent_name(stage) or agent.name,
            "assignment_reason": _stage_assignment_reason(stage),
            "instruction": _build_assignment_instruction(stage, agent),
            "depends_on": stage["depends_on"],
            "mode": stage.get("mode", "single_turn"),
            "output_key": stage.get("output_key"),
            "recommended_capabilities": stage.get("recommended_capabilities", []),
            "acceptance_criteria": stage.get("acceptance_criteria", []),
            "fallback_agent_ids": [
                str(candidate.id)
                for candidate in agents
                if candidate.id != agent.id
            ],
            "attempt": 1,
            "source": "planner_confirmed",
        })
    return assignments


def _extract_assignment_goal(instruction: str) -> str:
    text = instruction or ""
    if "目标：" in text:
        goal = text.split("目标：", 1)[-1]
        for marker in ("推荐能力：", "验收标准："):
            goal = goal.split(marker, 1)[0]
        return goal.strip()
    goal = text.split("Goal:", 1)[-1]
    for marker in ("Recommended capabilities:", "Acceptance criteria:"):
        goal = goal.split(marker, 1)[0]
    return goal.strip()


async def _load_group_execution_agents(
    db: AsyncSession,
    conv_id: UUID,
    orchestrator_agent_id: Optional[UUID],
) -> list[AgentModel]:
    parts_result = await db.execute(
        select(ConversationParticipant.participant_id).where(
            ConversationParticipant.conversation_id == conv_id,
            ConversationParticipant.participant_type == "agent",
        )
    )
    participant_ids = list(parts_result.scalars().all())
    if orchestrator_agent_id:
        participant_ids = [aid for aid in participant_ids if aid != orchestrator_agent_id]
    if not participant_ids:
        return []
    result = await db.execute(
        select(AgentModel).where(
            AgentModel.id.in_(participant_ids),
            AgentModel.is_active == True,
        )
    )
    agent_map = {agent.id: agent for agent in result.scalars().all()}
    return [agent_map[aid] for aid in participant_ids if aid in agent_map]


async def _build_dynamic_assignments(
    db: AsyncSession,
    orch_task: OrchestratorTask,
    agents: list[AgentModel],
) -> list[dict]:
    plan = orch_task.plan or {}
    stages = [
        _normalize_plan_stage(stage, index)
        for index, stage in enumerate(plan.get("subtasks", []))
    ]
    if not stages or not agents:
        return []

    confirmed_assignments = _build_confirmed_assignments(stages, agents)
    if confirmed_assignments:
        logger.info(
            "Using planner-confirmed assignments: task=%s stages=%d",
            orch_task.id,
            len(confirmed_assignments),
        )
        plan["subtasks"] = stages
        plan["assignments"] = confirmed_assignments
        orch_task.plan = plan
        await db.flush()
        return confirmed_assignments

    assignments: list[dict] = []
    usage_count: dict[UUID, int] = {agent.id: 0 for agent in agents}
    for index, stage in enumerate(stages):
        ranked = sorted(
            agents,
            key=lambda a: (-_score_agent_for_stage(a, stage), usage_count[a.id], a.name.lower()),
        )
        primary = ranked[0]
        usage_count[primary.id] += 1
        fallback_ids = [str(agent.id) for agent in ranked[1:]]
        assignments.append({
            "stage_id": stage["subtask_id"],
            "subtask_id": f"{stage['subtask_id']}__{str(primary.id).replace('-', '_')}",
            "agent_id": str(primary.id),
            "agent_name": primary.name,
            "instruction": _build_assignment_instruction(stage, primary),
            "depends_on": stage["depends_on"],
            "mode": stage.get("mode", "single_turn"),
            "output_key": stage.get("output_key"),
            "recommended_capabilities": stage.get("recommended_capabilities", []),
            "acceptance_criteria": stage.get("acceptance_criteria", []),
            "fallback_agent_ids": fallback_ids,
            "attempt": 1,
        })

    plan["subtasks"] = stages
    plan["assignments"] = assignments
    orch_task.plan = plan
    await db.flush()
    return assignments


def _format_assignment_summary(assignments: list[dict], orchestrator_name: str) -> str:
    use_chinese = _prefers_chinese(assignments)
    lines = [
        f"{orchestrator_name} 已确认执行分配："
        if use_chinese
        else f"{orchestrator_name} confirmed the execution assignment:"
    ]
    for i, item in enumerate(assignments, start=1):
        caps = item.get("recommended_capabilities") or []
        if use_chinese:
            cap_text = f"（能力：{'、'.join(str(c) for c in caps)}）" if caps else ""
            goal = _extract_assignment_goal(item["instruction"])
            lines.append(
                f"{i}. 阶段 {item['stage_id']} -> @{item['agent_name']}{cap_text}\n"
                f"   {goal}"
            )
        else:
            cap_text = f" (capabilities: {', '.join(caps)})" if caps else ""
            goal = _extract_assignment_goal(item["instruction"])
            lines.append(
                f"{i}. Stage {item['stage_id']} -> @{item['agent_name']}{cap_text}\n"
                f"   {goal}"
            )
    return "\n".join(lines)

async def _persist_orchestrator_message(
    db: AsyncSession,
    conv_id: UUID,
    content: str,
    meta: Optional[dict] = None,
) -> Message:
    msg = Message(
        conversation_id=conv_id,
        sender_type="orchestrator",
        sender_id=None,
        content_type="text",
        content=content,
        status="done",
        meta_data=meta,
    )
    db.add(msg)
    await db.flush()
    return msg


def _assignment_to_plan_subtask(
    assignment: dict,
    agent: AgentModel,
    stage_to_subtask: dict[str, str],
):
    from app.schemas.orchestrator import SubTaskPlan

    return SubTaskPlan(
        subtask_id=assignment["subtask_id"],
        agent_id=agent.id,
        agent_name=agent.name,
        assignment_reason=assignment.get("assignment_reason"),
        instruction=assignment["instruction"],
        recommended_capabilities=assignment.get("recommended_capabilities", []),
        acceptance_criteria=assignment.get("acceptance_criteria", []),
        depends_on=[
            stage_to_subtask[dep]
            for dep in assignment.get("depends_on", [])
            if dep in stage_to_subtask
        ],
        mode=assignment.get("mode", "single_turn"),
        output_key=assignment.get("output_key"),
    )


async def _ensure_dynamic_subtasks(
    db: AsyncSession,
    orch_task: OrchestratorTask,
    assignments: list[dict],
) -> None:
    existing_result = await db.execute(
        select(OrchestratorSubtask).where(OrchestratorSubtask.task_id == orch_task.id)
    )
    existing = list(existing_result.scalars().all())
    if existing:
        return
    for order, item in enumerate(assignments):
        db.add(OrchestratorSubtask(
            task_id=orch_task.id,
            agent_id=UUID(item["agent_id"]),
            instruction=item["instruction"],
            status="queued",
            depends_on=[item["stage_id"], *(item.get("depends_on", []) or [])],
            mode=item.get("mode", "single_turn"),
            execution_order=order,
        ))
    await db.flush()


def _build_assignment_agent_name_map(assignments: list[dict]) -> dict[str, dict]:
    name_map: dict[str, dict] = {}
    counter: dict[str, int] = {}
    for assignment in assignments:
        agent_id = assignment["agent_id"]
        base = "agent_" + agent_id.replace("-", "_")
        counter[base] = counter.get(base, 0) + 1
        name = base if counter[base] == 1 else f"{base}_{counter[base]}"
        name_map[name] = {
            "id": agent_id,
            "name": assignment.get("agent_name", name),
        }
    return name_map


async def _execute_assignment_workflow(
    conv_id: UUID,
    user_id: UUID,
    prompt: Optional[str],
    assignments: list[dict],
    agent_models: dict[UUID, AgentModel],
) -> tuple[ExecutionTracer, AsyncGenerator[str, None]]:
    from app.schemas.orchestrator import OrchestratorPlan

    stage_to_subtask = {
        item["stage_id"]: item["subtask_id"]
        for item in assignments
    }
    plan_subtasks = [
        _assignment_to_plan_subtask(
            assignment=item,
            agent=agent_models[UUID(item["agent_id"])],
            stage_to_subtask=stage_to_subtask,
        )
        for item in assignments
    ]
    plan_obj = OrchestratorPlan(subtasks=plan_subtasks)
    tracer = ExecutionTracer()
    workflow = WorkflowBuilder().build(
        plan_obj,
        agent_models=agent_models,
        execution_tracer=tracer,
    )
    runner = AgentHubRunner(node=workflow, app_name="agenthub_dynamic_orchestrator")
    agent_order = _build_agent_order(plan_obj.subtasks)
    translator = ADKToSSETranslator(
        sequential=True,
        agent_order=agent_order,
        agent_name_map=_build_assignment_agent_name_map(assignments),
    )
    stream = _accumulate_stream_events(
        translator.translate(
            runner.stream_single_chat(
                user_id=str(user_id),
                session_id=str(conv_id),
                message=prompt or "",
            ),
            conversation_id=str(conv_id),
        ),
        conv_id=conv_id,
    )
    return tracer, stream


async def _run_fallback_assignments(
    conv_id: UUID,
    user_id: UUID,
    prompt: Optional[str],
    orch_task: OrchestratorTask,
    assignments: list[dict],
    agent_by_id: dict[UUID, AgentModel],
) -> AsyncGenerator[str, None]:
    failed_rows_result = await db_execute_subtasks_for_task(orch_task.id)
    failed_rows = [
        row for row in failed_rows_result
        if row.status not in {"success", "done", "completed"}
    ]
    if not failed_rows:
        return

    fallback_assignments: list[dict] = []
    for row in failed_rows:
        matched = None
        for item in assignments:
            row_stage = (row.depends_on or [None])[0]
            if UUID(item["agent_id"]) == row.agent_id and row_stage == item["stage_id"]:
                matched = item
                break
        if not matched:
            continue
        fallback_id = None
        for raw_id in matched.get("fallback_agent_ids", []):
            candidate_id = UUID(raw_id)
            if candidate_id != row.agent_id and candidate_id in agent_by_id:
                fallback_id = candidate_id
                break
        if fallback_id is None:
            continue
        fallback_agent = agent_by_id[fallback_id]
        fallback_stage = {
            "subtask_id": matched["stage_id"],
            "instruction": _extract_assignment_goal(matched["instruction"]),
            "recommended_capabilities": matched.get("recommended_capabilities", []),
            "acceptance_criteria": matched.get("acceptance_criteria", []),
            "depends_on": [],
            "mode": matched.get("mode", "single_turn"),
            "output_key": matched.get("output_key"),
        }
        fallback_assignments.append({
            **matched,
            "subtask_id": f"{matched['stage_id']}__fallback__{str(fallback_id).replace('-', '_')}",
            "agent_id": str(fallback_id),
            "agent_name": fallback_agent.name,
            "instruction": _build_assignment_instruction(fallback_stage, fallback_agent, fallback=True),
            "depends_on": [],
            "fallback_for_agent_id": str(row.agent_id),
            "attempt": 2,
        })

    if not fallback_assignments:
        return

    for order, item in enumerate(fallback_assignments, start=len(assignments)):
        async with async_session_maker() as fallback_db:
            fallback_db.add(OrchestratorSubtask(
                task_id=orch_task.id,
                agent_id=UUID(item["agent_id"]),
                instruction=item["instruction"],
                status="queued",
                depends_on=[item["stage_id"]],
                mode=item.get("mode", "single_turn"),
                execution_order=order,
            ))
            await fallback_db.commit()

    retry_notice_id = str(uuid4())
    notice = (
        "部分分配执行失败，Orchestrator 正在进行一次兜底重试。"
        if _prefers_chinese(prompt, assignments)
        else "Some assignments failed. The Orchestrator is running one fallback attempt."
    )
    yield _format_sse("message_start", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": retry_notice_id,
        "sender": {"type": "orchestrator", "id": "orchestrator", "name": "Orchestrator"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    yield _format_sse("token", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": retry_notice_id,
        "delta": notice,
        "index": 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    yield _format_sse("message_end", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": retry_notice_id,
        "finish_reason": "completed",
        "usage": {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    tracer, stream = await _execute_assignment_workflow(
        conv_id=conv_id,
        user_id=user_id,
        prompt=prompt,
        assignments=fallback_assignments,
        agent_models={UUID(item["agent_id"]): agent_by_id[UUID(item["agent_id"])] for item in fallback_assignments},
    )
    async for event in stream:
        yield event
    await _update_subtask_metrics(
        orch_task_id=orch_task.id,
        tracer=tracer,
        agent_name_to_agent_id={
            name: UUID(meta["id"])
            for name, meta in _build_assignment_agent_name_map(fallback_assignments).items()
        },
    )


async def db_execute_subtasks_for_task(task_id: UUID) -> list[OrchestratorSubtask]:
    async with async_session_maker() as task_db:
        result = await task_db.execute(
            select(OrchestratorSubtask).where(OrchestratorSubtask.task_id == task_id)
        )
        return list(result.scalars().all())


async def _dynamic_group_stream(
    conv_id: UUID,
    user_id: UUID,
    prompt: Optional[str],
    orch_task: OrchestratorTask,
    db: AsyncSession,
) -> AsyncGenerator[str, None]:
    orchestrator_name = "Orchestrator"
    if orch_task.planner_agent_id:
        orchestrator_agent = await db.get(AgentModel, orch_task.planner_agent_id)
        if orchestrator_agent:
            orchestrator_name = orchestrator_agent.name

    execution_agents = await _load_group_execution_agents(
        db=db,
        conv_id=conv_id,
        orchestrator_agent_id=orch_task.planner_agent_id,
    )
    if not execution_agents:
        yield _format_sse("error", {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": "",
            "code": "NO_EXECUTION_AGENTS",
            "message": "No eligible group agents are available after excluding the Orchestrator.",
            "retryable": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        orch_task.status = "failed"
        await db.commit()
        return

    assignments = (orch_task.plan or {}).get("assignments") or []
    if not assignments:
        assignments = await _build_dynamic_assignments(db, orch_task, execution_agents)
    if not assignments:
        yield _format_sse("error", {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": "",
            "code": "NO_ASSIGNMENTS",
            "message": "The confirmed plan did not produce executable assignments.",
            "retryable": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        orch_task.status = "failed"
        await db.commit()
        return

    await _ensure_dynamic_subtasks(db, orch_task, assignments)
    assignment_text = _format_assignment_summary(assignments, orchestrator_name)
    assignment_msg = await _persist_orchestrator_message(
        db=db,
        conv_id=conv_id,
        content=assignment_text,
        meta={"assignments": assignments},
    )
    await db.commit()

    assignment_msg_id = str(assignment_msg.id)
    yield _format_sse("message_start", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": assignment_msg_id,
        "sender": {"type": "orchestrator", "id": str(orch_task.planner_agent_id or ""), "name": orchestrator_name},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    yield _format_sse("token", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": assignment_msg_id,
        "delta": assignment_text,
        "index": 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    yield _format_sse("message_end", {
        "version": "v1",
        "event_id": str(uuid4()),
        "conversation_id": str(conv_id),
        "message_id": assignment_msg_id,
        "finish_reason": "assignment",
        "usage": {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    agent_by_id = {agent.id: agent for agent in execution_agents}
    agent_models = {
        UUID(item["agent_id"]): agent_by_id[UUID(item["agent_id"])]
        for item in assignments
    }
    tracer, stream = await _execute_assignment_workflow(
        conv_id=conv_id,
        user_id=user_id,
        prompt=prompt,
        assignments=assignments,
        agent_models=agent_models,
    )
    async for event in stream:
        yield event

    await _update_subtask_metrics(
        orch_task_id=orch_task.id,
        tracer=tracer,
        agent_name_to_agent_id={
            name: UUID(meta["id"])
            for name, meta in _build_assignment_agent_name_map(assignments).items()
        },
    )

    async for event in _run_fallback_assignments(
        conv_id=conv_id,
        user_id=user_id,
        prompt=prompt,
        orch_task=orch_task,
        assignments=assignments,
        agent_by_id=agent_by_id,
    ):
        yield event

    try:
        aggregator = MergeAggregator()
        merge_result = await aggregator.aggregate(db, orch_task.id)
        llm_summary = await aggregator.summarize_with_llm(
            db=db,
            orch_task_id=orch_task.id,
            sub_summaries=merge_result.sub_summaries,
            user_request=prompt or "",
        )
        if llm_summary:
            merge_result.summary_text = llm_summary

        summary_msg = Message(
            conversation_id=conv_id,
            sender_type="orchestrator",
            content=merge_result.summary_text,
            status="done",
            meta_data={
                "summary": {
                    "total": len(merge_result.sub_summaries),
                    "success": sum(1 for s in merge_result.sub_summaries if s.status in {"success", "done", "completed"}),
                    "failed": sum(1 for s in merge_result.sub_summaries if s.status in {"failed", "timeout"}),
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
            },
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
        await db.flush()

        summary_msg_id = str(summary_msg.id)
        yield _format_sse("message_start", {
            "version": "v1",
            "event_id": str(uuid4()),
            "conversation_id": str(conv_id),
            "message_id": summary_msg_id,
            "sender": {"type": "orchestrator", "id": str(orch_task.planner_agent_id or ""), "name": orchestrator_name},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        for i, ch in enumerate(merge_result.summary_text):
            yield _format_sse("token", {
                "version": "v1",
                "event_id": str(uuid4()),
                "conversation_id": str(conv_id),
                "message_id": summary_msg_id,
                "delta": ch,
                "index": i,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
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
        logger.exception("Dynamic group summary failed for task=%s", orch_task.id)

    if orch_task.result_summary is None:
        orch_task.result_summary = {}
    orch_task.result_summary["dag_data"] = tracer.get_dag_data()
    orch_task.status = "completed"
    await db.commit()


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
    translator = ADKToSSETranslator(
        sequential=True,
        agent_order=agent_order,
        agent_name_map=_build_sanitized_agent_name_map(agent_models),
    )

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
    translator = ADKToSSETranslator(
        sequential=True,
        agent_order=agent_order,
        agent_name_map=_build_plan_agent_name_map(plan_obj.subtasks, agent_models),
    )

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

            # Sort subtask_rows by execution_order for deterministic dedup naming.
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
                # Find matching tracer record by agent_name patterns.
                for rec in tracer.records.values():
                    # DAG mode: agent_name = "agent_<uuid-with-dashes-replaced>[_<n>]"
                    # Coordinator mode: agent_name = AgentModel.name
                    matched_agent_id = agent_name_to_agent_id.get(rec.agent_name)
                    is_exact_dag_record = rec.agent_name == expected_name
                    is_legacy_agent_record = (
                        matched_agent_id == row.agent_id
                        and not (rec.agent_name or "").startswith("agent_")
                    )
                    if is_exact_dag_record or is_legacy_agent_record:
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
                        elif rec.invocation_id and rec.agent_name:
                            try:
                                from app.services.adapters.adk_to_sse import agent_message_id
                                row.output_message_id = UUID(agent_message_id(rec.invocation_id, rec.agent_name))
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
    raw_prompt = prompt
    deploy_target = parse_deploy_command(prompt)
    if deploy_target and should_handle_deployment_command(orchestrate_mode):
        return StreamingResponse(
            _deployment_command_stream(conv_id, user_id, deploy_target, prompt),
            media_type="text/event-stream",
        )

    conv = await db.get(Conversation, conv_id)
    if orchestrate_mode == "agent_builder" or (conv and getattr(conv, "purpose", None) == "agent_builder"):
        if not conv or conv.owner_id != user_id:
            return StreamingResponse(
                _error_sse_stream("CONVERSATION_NOT_FOUND", "Conversation not found"),
                media_type="text/event-stream",
            )
        return StreamingResponse(
            _agent_builder_stream(conv_id, user_id, raw_prompt),
            media_type="text/event-stream",
        )

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

    # Phase 1.5: Plan refinement (status=refining) 鈥?user asked to modify plan
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
    # Phase 2: Plan confirmed — dynamically assign stages to current group
    # agents, execute them, and stream member-style replies.
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
            _dynamic_group_stream(conv_id, user_id, prompt, confirmed_task, db),
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
                _error_sse_stream("PLANNER_ERROR", "浠诲姟鎷嗚В澶辫触锛岃閲嶈瘯"),
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
                    "Group orchestration requires an orchestrator task. Check that the conversation has agents and retry.",
                ),
                media_type="text/event-stream",
            )

    # Single-chat routing: delegate to the agent's adapter.
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
                        _error_sse_stream("NO_STREAM_BACKEND", "ADK 娴佹湭鍚敤涓斿璇濇湭缁戝畾 CLI Agent"),
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
                    _error_sse_stream("NO_STREAM_BACKEND", "ADK 娴佹湭鍚敤涓斿璇濇湭缁戝畾 CLI Agent"),
                    media_type="text/event-stream",
                )

    # No agents bound to this conversation
    return StreamingResponse(
        _error_sse_stream("NO_AGENT", "璇ュ璇濇湭缁戝畾浠讳綍 Agent锛岃鍏堥€夋嫨 Agent"),
        media_type="text/event-stream",
    )
