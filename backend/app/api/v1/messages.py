from uuid import UUID, uuid4
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.message import ArtifactBrief, ArtifactUpdate, MessageCreate, MessageResponse, MessageListResponse
from app.models.agent import Agent
from app.models.conversation_participant import ConversationParticipant
from app.models.message import Message
from app.models.artifact import Artifact
from app.services.message import MessageService
from app.services.deployment_command import parse_deploy_command
from app.api.deps import get_current_user_id

router = APIRouter()
messages_router = APIRouter()

@router.get("/{conv_id}/messages", response_model=MessageListResponse)
async def list_messages(
    conv_id: UUID,
    cursor: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    sender_type: Optional[str] = Query(None, alias="senderType"),
    sender_id: Optional[UUID] = Query(None, alias="senderId"),
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    return await MessageService.list_messages(
        db=db, conv_id=conv_id, user_id=user_id, cursor=cursor, limit=limit,
        sender_type=sender_type, sender_id=sender_id,
    )


@router.post("/{conv_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    conv_id: UUID,
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    from app.models.orchestrator_task import OrchestratorTask
    from app.services.adk.workflow_builder import WorkflowBuilder
    from app.schemas.orchestrator import OrchestratorPlan, SubTaskPlan
    from app.models.orchestrator_subtask import OrchestratorSubtask

    # 鈹€鈹€ refine_plan: user wants to modify the current plan via chat 鈹€鈹€鈹€鈹€鈹€
    if data.mode == "refine_plan":
        if not data.plan_id:
            raise HTTPException(status_code=400, detail="plan_id is required for refine_plan mode")

        result = await db.execute(
            select(OrchestratorTask)
            .where(
                OrchestratorTask.conversation_id == conv_id,
                OrchestratorTask.status == "plan_draft",
            )
            .order_by(OrchestratorTask.created_at.desc())
            .limit(1)
        )
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="No plan_draft task found to refine")

        task.status = "refining"
        user_msg = await MessageService.create_message(
            db=db, conv_id=conv_id, user_id=user_id, data=data,
        )
        await db.commit()
        return user_msg

    # 鈹€鈹€ confirm_plan: user approves the plan 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    if data.mode == "confirm_plan":
        if not data.plan_id or not data.plan:
            raise HTTPException(status_code=400, detail="plan_id and plan are required for confirm_plan mode")

        result = await db.execute(
            select(OrchestratorTask)
            .where(
                OrchestratorTask.conversation_id == conv_id,
                OrchestratorTask.status.in_(["awaiting_confirmation", "plan_draft"]),
            )
            .order_by(OrchestratorTask.created_at.desc())
            .limit(1)
        )
        task = result.scalar_one_or_none()
        if not task:
            existing = await db.execute(
                select(OrchestratorTask).where(OrchestratorTask.conversation_id == conv_id).limit(1)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Plan already confirmed or executed")
            raise HTTPException(status_code=404, detail="No pending plan found")

        normalized_items: list[dict] = []
        subtask_ids: set[str] = set()
        has_reviewed_assignment = False
        for index, item in enumerate(data.plan):
            if not isinstance(item, dict):
                raise HTTPException(status_code=400, detail="each plan item must be an object")

            subtask_id = str(
                item.get("subtask_id", item.get("subtaskId")) or f"s{index + 1}"
            )
            if subtask_id in subtask_ids:
                raise HTTPException(status_code=400, detail=f"duplicate subtask_id: {subtask_id}")
            subtask_ids.add(subtask_id)

            instruction = str(item.get("instruction") or "").strip()
            if not instruction:
                raise HTTPException(status_code=400, detail=f"instruction is required for {subtask_id}")

            raw_agent_id = item.get("agent_id", item.get("agentId"))
            agent_id = str(raw_agent_id) if raw_agent_id else None
            agent_name = item.get("agent_name", item.get("agentName"))
            has_reviewed_assignment = has_reviewed_assignment or bool(agent_id or agent_name)

            raw_depends_on = item.get("depends_on", item.get("dependsOn", [])) or []
            if isinstance(raw_depends_on, str):
                depends_on = [
                    dep.strip()
                    for dep in raw_depends_on.split(",")
                    if dep.strip()
                ]
            elif isinstance(raw_depends_on, list):
                depends_on = [
                    str(dep).strip()
                    for dep in raw_depends_on
                    if str(dep).strip()
                ]
            else:
                raise HTTPException(status_code=400, detail=f"depends_on must be a list for {subtask_id}")

            mode = item.get("mode", "single_turn") or "single_turn"
            if mode != "single_turn":
                raise HTTPException(status_code=400, detail=f"unsupported mode for {subtask_id}: {mode}")

            normalized_items.append({
                **item,
                "subtask_id": subtask_id,
                "agent_id": agent_id,
                "agent_name": agent_name,
                "assignment_reason": item.get(
                    "assignment_reason",
                    item.get("assignmentReason"),
                ),
                "instruction": instruction,
                "recommended_capabilities": item.get(
                    "recommended_capabilities",
                    item.get("recommendedCapabilities", []),
                ) or [],
                "acceptance_criteria": item.get(
                    "acceptance_criteria",
                    item.get("acceptanceCriteria", []),
                ) or [],
                "can_parallel": item.get("can_parallel", item.get("canParallel", True)),
                "depends_on": depends_on,
                "mode": mode,
                "output_key": item.get("output_key", item.get("outputKey")),
            })

        for item in normalized_items:
            subtask_id = item["subtask_id"]
            if subtask_id in item["depends_on"]:
                raise HTTPException(status_code=400, detail=f"{subtask_id} cannot depend on itself")
            invalid_deps = [dep for dep in item["depends_on"] if dep not in subtask_ids]
            if invalid_deps:
                raise HTTPException(
                    status_code=400,
                    detail=f"invalid depends_on for {subtask_id}: {', '.join(invalid_deps)}",
                )

        if has_reviewed_assignment:
            missing_agent_items = [
                item["subtask_id"]
                for item in normalized_items
                if not item.get("agent_id")
            ]
            if missing_agent_items:
                raise HTTPException(
                    status_code=400,
                    detail=f"agent_id is required for reviewed assignments: {', '.join(missing_agent_items)}",
                )

            parts_result = await db.execute(
                select(ConversationParticipant.participant_id).where(
                    ConversationParticipant.conversation_id == conv_id,
                    ConversationParticipant.participant_type == "agent",
                )
            )
            participant_ids = list(parts_result.scalars().all())
            eligible_by_id: dict[str, Agent] = {}
            if participant_ids:
                agents_result = await db.execute(
                    select(Agent).where(
                        Agent.id.in_(participant_ids),
                        Agent.is_active == True,
                    )
                )
                eligible_by_id = {
                    str(agent.id): agent
                    for agent in agents_result.scalars().all()
                    if agent.id != task.planner_agent_id
                }

            for item in normalized_items:
                agent_id = item["agent_id"]
                if agent_id == str(task.planner_agent_id):
                    raise HTTPException(
                        status_code=400,
                        detail=f"planner agent cannot execute stage {item['subtask_id']}",
                    )
                agent = eligible_by_id.get(agent_id)
                if not agent:
                    raise HTTPException(
                        status_code=400,
                        detail=f"agent_id is not an active group executor for {item['subtask_id']}: {agent_id}",
                    )
                item["agent_name"] = agent.name

        new_plan_dict = {"subtasks": normalized_items}
        plan_obj = OrchestratorPlan(subtasks=[
            SubTaskPlan(
                subtask_id=item["subtask_id"],
                agent_id=item.get("agent_id"),
                agent_name=item.get("agent_name"),
                assignment_reason=item.get("assignment_reason"),
                instruction=item["instruction"],
                recommended_capabilities=item.get("recommended_capabilities", []),
                acceptance_criteria=item.get("acceptance_criteria", []),
                can_parallel=item.get("can_parallel", True),
                depends_on=item.get("depends_on", []),
                mode=item.get("mode", "single_turn"),
                output_key=item.get("output_key"),
            )
            for item in normalized_items
        ])

        # Persist the user-approved stage plan. Reviewed assignments are
        # validated above; legacy plans without agent_id can still fall back to
        # dynamic assignment during execution.
        if not plan_obj.subtasks:
            raise HTTPException(status_code=400, detail="plan cannot be empty")
        task.plan = {
            **(task.plan or {}),
            **new_plan_dict,
        }

        task.status = "confirmed"
        task.result_summary = {"state_delta": {"plan_confirmed": True}}
        await db.commit()
        return JSONResponse(content={"code": 200, "data": None, "message": "ok"})

    # 鈹€鈹€ normal message 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    user_msg = await MessageService.create_message(db=db, conv_id=conv_id, user_id=user_id, data=data)

    if data.mode == "auto_orchestrate" and not parse_deploy_command(data.content):
        # Resolve the Orchestrator (planner) agent from @mentions only.
        #   - exactly one @mention: that agent is the Orchestrator
        #   - zero or multiple @mentions: use the default DeepSeek Orchestrator
        planner_agent_id = None
        mention_ids = list(data.mentions or [])

        if len(mention_ids) == 1:
            planner_agent_id = mention_ids[0]

        if planner_agent_id is not None:
            planner_result = await db.execute(select(Agent).where(Agent.id == planner_agent_id))
            if not planner_result.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="planner_agent_id not found")

        orch_task = OrchestratorTask(
            conversation_id=conv_id,
            trigger_message_id=user_msg["id"],
            status="planning",
            plan={},
            planner_agent_id=planner_agent_id,
        )
        db.add(orch_task)
        await db.commit()

    return user_msg


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
            "artifactType": a.artifact_type,
            "title": a.title,
            "content": a.content,
            "storageKey": a.storage_key,
            "mimeType": a.mime_type,
            "version": a.version,
            "createdAt": a.created_at,
        }
        for a in artifacts
    ]


@messages_router.patch("/artifacts/{artifact_id}", response_model=ArtifactBrief)
async def update_artifact(
    artifact_id: UUID,
    data: ArtifactUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    """Persist a user edit as a new version of an existing artifact.

    Used by editable cards (e.g. CodeCard) so saved changes survive a reload
    instead of only downloading locally. Reuses the artifact's version chain.
    """
    from app.services.artifact import ArtifactService

    try:
        row = await ArtifactService.update_content(
            db=db, artifact_id=artifact_id, new_content=data.content,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Artifact not found")
    await db.commit()

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

