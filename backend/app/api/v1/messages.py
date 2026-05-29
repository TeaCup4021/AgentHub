from uuid import UUID, uuid4
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.message import ArtifactBrief, MessageCreate, MessageResponse, MessageListResponse
from app.models.agent import Agent
from app.models.message import Message
from app.models.artifact import Artifact
from app.services.message import MessageService
from app.api.deps import get_current_user_id

router = APIRouter()
messages_router = APIRouter()


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
    # confirm_plan: handle before message creation (does not create a Message)
    if data.mode == "confirm_plan":
        if not data.plan_id or not data.plan:
            raise HTTPException(status_code=400, detail="plan_id and plan are required for confirm_plan mode")

        from app.models.orchestrator_task import OrchestratorTask

        result = await db.execute(
            select(OrchestratorTask)
            .where(
                OrchestratorTask.conversation_id == conv_id,
                OrchestratorTask.status == "awaiting_confirmation",
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

        agent_ids_in_plan = [UUID(item["agent_id"]) for item in data.plan]
        agents_result = await db.execute(select(Agent).where(Agent.id.in_(agent_ids_in_plan)))
        agent_map = {str(a.id): a.name for a in agents_result.scalars().all()}

        new_plan_dict = {"subtasks": [
            {
                **item,
                "agent_name": agent_map.get(item["agent_id"], "Unknown"),
                "depends_on": item.get("depends_on", item.get("dependsOn", [])),
                "mode": item.get("mode", "single_turn"),
                "output_key": item.get("output_key", item.get("outputKey")),
            }
            for item in data.plan
        ]}
        from app.schemas.orchestrator import OrchestratorPlan, SubTaskPlan
        plan_obj = OrchestratorPlan(subtasks=[
            SubTaskPlan(
                subtask_id=item.get("subtask_id", item.get("subtaskId", f"sub-{uuid4().hex[:8]}")),
                agent_id=UUID(item["agent_id"]),
                agent_name=agent_map.get(item["agent_id"], "Unknown"),
                instruction=item["instruction"],
                depends_on=item.get("depends_on", item.get("dependsOn", [])),
                mode=item.get("mode", "single_turn"),
                output_key=item.get("output_key", item.get("outputKey")),
            )
            for item in data.plan
        ])

        if new_plan_dict["subtasks"] != task.plan.get("subtasks", []) if task.plan else True:
            task.plan = new_plan_dict
            from app.services.adk.workflow_builder import WorkflowBuilder
            WorkflowBuilder().build(plan_obj)

        task.status = "confirmed"
        task.result_summary = {"state_delta": {"plan_confirmed": True}}

        # Create orchestrator_subtasks rows for each confirmed subtask
        from app.models.orchestrator_subtask import OrchestratorSubtask
        existing_subtasks = await db.execute(
            select(OrchestratorSubtask).where(OrchestratorSubtask.task_id == task.id)
        )
        if not existing_subtasks.scalars().first():
            for i, item in enumerate(new_plan_dict["subtasks"]):
                db.add(OrchestratorSubtask(
                    task_id=task.id,
                    agent_id=UUID(item["agent_id"]),
                    instruction=item["instruction"],
                    status="queued",
                    depends_on=item.get("depends_on", []),
                    mode=item.get("mode", "single_turn"),
                    execution_order=i,
                ))

        await db.commit()
        return JSONResponse(content={"code": 200, "data": None, "message": "ok"})

    user_msg = await MessageService.create_message(db=db, conv_id=conv_id, user_id=user_id, data=data)

    if data.mode == "auto_orchestrate" and data.mentions:
        from app.models.orchestrator_task import OrchestratorTask

        orch_task = OrchestratorTask(
            conversation_id=conv_id,
            trigger_message_id=user_msg["id"],
            status="planning",
            plan={},
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
