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
from app.core.database import get_db, async_session_maker
from app.schemas.conversation import ConversationCreate, ConversationUpdate, ConversationResponse, PinMessageRequest
from app.schemas.base import Page
from app.models.conversation import Conversation
from app.models.message_pin import MessagePin
from app.models.orchestrator_task import OrchestratorTask
from app.models.message_mention import MessageMention
from app.services.conversation import ConversationService
from app.services.adapters.adk_to_sse import ADKToSSETranslator
from app.services.adk.runner import AgentHubRunner, build_single_chat_agent
from app.services.adk.coordinator_builder import CoordinatorBuilder
from app.services.adk.workflow_builder import WorkflowBuilder
from app.services.adk.execution_tracer import ExecutionTracer
from app.services.adk.merge_aggregator import MergeAggregator
from app.services.artifact import ArtifactService
from app.services.message import MessageService

from app.api.deps import get_current_user, get_current_user_id

def _use_adk_stream() -> bool:
    flag = os.getenv("AGENTHUB_USE_ADK_STREAM", "0").strip().lower()
    return flag in {"1", "true", "yes"}

router = APIRouter()
logger = logging.getLogger("agenthub.stream")


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
    accumulators: dict = {}
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
                try:
                    async with async_session_maker() as db:
                        await MessageService.persist_stream_message(
                            db=db,
                            conv_id=conv_id,
                            message_id=mid,
                            sender_name=acc["sender_name"],
                            content=acc["content"],
                            status="done",
                        )
                        await db.commit()
                except Exception:
                    logger.exception("persist stream message failed")
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

@router.get("", response_model=Page[ConversationResponse])
async def get_conversations(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100, alias="pageSize"),
    keyword: Optional[str] = None,
    project_id: Optional[UUID] = Query(None, alias="projectId"),
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
        logger.exception("Planner failed for conv=%s task=%s", conv_id, orch_task.id)
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
                try:
                    async with async_session_maker() as persist_db:
                        await MessageService.persist_stream_message(
                            db=persist_db, conv_id=conv_id, message_id=mid,
                            sender_name=acc["sender_name"], content=acc["content"],
                            status="done",
                        )
                        await persist_db.commit()
                except Exception:
                    logger.exception("persist stream message failed")

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
            try:
                async with async_session_maker() as persist_db:
                    await MessageService.persist_stream_message(
                        db=persist_db, conv_id=conv_id, message_id=mid,
                        sender_name=acc["sender_name"], content=acc["content"],
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
    """Coordinator mode: LLM dynamically schedules sub-agents via ADK Collaborative Workflow."""
    from app.models.agent import Agent as AgentModel

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

    tracer = ExecutionTracer()
    coordinator = CoordinatorBuilder().build(agent_models, execution_tracer=tracer)
    runner = AgentHubRunner(agent=coordinator, app_name="agenthub_orchestrator")
    translator = ADKToSSETranslator()

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
    await _update_subtask_metrics(
        orch_task_id=orch_task.id,
        tracer=tracer,
        agent_name_to_agent_id={
            am.name: am.id for am in agent_models
        },
    )

    # MergeAggregator: generate orchestrator summary
    await _run_merge_aggregator(db, orch_task.id, conv_id)

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
    translator = ADKToSSETranslator()

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
    for st in plan_obj.subtasks:
        agent_name = "agent_" + str(st.agent_id).replace("-", "_")
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

            for row in subtask_rows:
                agent_id_str = str(row.agent_id)
                # Find matching tracer record by agent_name patterns
                for rec in tracer.records.values():
                    # DAG mode: agent_name = "agent_<uuid-with-dashes-replaced>"
                    expected_name = "agent_" + agent_id_str.replace("-", "_")
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
):
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
            _orchestrator_plan_stream(conv_id, orch_task, db),
            media_type="text/event-stream",
        )

    # Phase 2: Plan confirmed — execute workflow
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

    if confirmed_task and orchestrate_mode == "auto_orchestrate":
        # Coordinator mode: LLM dynamically schedules sub-agents
        return StreamingResponse(
            _coordinator_stream(conv_id, user_id, prompt, confirmed_task, db),
            media_type="text/event-stream",
        )

    if confirmed_task and orchestrate_mode == "auto_orchestrate_dag":
        # Static DAG mode: Planner-generated dependency graph
        return StreamingResponse(
            _dag_workflow_stream(conv_id, user_id, prompt, confirmed_task, db),
            media_type="text/event-stream",
        )

    if _use_adk_stream():
        return StreamingResponse(
            _adk_sse_stream(conv_id, user_id, prompt),
            media_type="text/event-stream",
        )
    return StreamingResponse(_mock_sse_stream(conv_id), media_type="text/event-stream")
