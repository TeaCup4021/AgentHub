from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.orchestrator_task import OrchestratorTask
from app.models.orchestrator_subtask import OrchestratorSubtask
from app.schemas.orchestrator import DagNode, DagEdge, DagResponse

router = APIRouter()


async def get_current_user_id() -> UUID:
    return UUID("00000000-0000-0000-0000-000000000001")


@router.get("/tasks/{task_id}/dag", response_model=DagResponse)
async def get_task_dag(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    user_id: UUID = Depends(get_current_user_id),
):
    task = await db.get(OrchestratorTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Orchestrator task not found")

    # Try loading from persisted dag_data in result_summary first
    result_summary = task.result_summary or {}
    dag_data = result_summary.get("dag_data")

    if not dag_data:
        # Fallback: rebuild from plan + subtask rows
        plan = task.plan or {}
        subtask_list = plan.get("subtasks", [])

        r = await db.execute(
            select(OrchestratorSubtask).where(OrchestratorSubtask.task_id == task_id)
        )
        subtask_rows = list(r.scalars().all())

        # Build instruction map from plan
        inst_map: dict[str, str] = {}
        for st in subtask_list:
            sid = st.get("subtask_id", st.get("subtaskId", ""))
            inst = st.get("instruction", "")
            if sid:
                inst_map[sid] = inst

        # Build nodes from subtask rows
        nodes: list[DagNode] = []
        for row in subtask_rows:
            st_id = None
            for st in subtask_list:
                if str(st.get("agentId", st.get("agent_id", ""))) == str(row.agent_id):
                    st_id = st.get("subtask_id", st.get("subtaskId", ""))
                    break
            instruction = inst_map.get(st_id or "", row.instruction or "")
            nodes.append(DagNode(
                subtask_id=st_id or str(row.agent_id)[:12],
                agent_id=str(row.agent_id),
                agent_name=instruction[:50] if instruction else row.agent_id.hex[:12],
                instruction=instruction,
                status=row.status or "unknown",
                latency_ms=row.latency_ms,
                output_message_id=str(row.output_message_id) if row.output_message_id else None,
            ))

        # Build edges from plan depends_on
        edges: list[DagEdge] = []
        for st in subtask_list:
            tid = st.get("subtask_id", st.get("subtaskId", ""))
            for dep in st.get("dependsOn", st.get("depends_on", [])):
                edges.append(DagEdge(from_node=str(dep), to_node=str(tid)))

        return DagResponse(
            task_id=str(task_id),
            status=task.status or "unknown",
            nodes=nodes,
            edges=edges,
        )

    # Return persisted DAG data
    nodes = [DagNode(**n) for n in dag_data.get("nodes", [])]
    edges = [DagEdge(**e) for e in dag_data.get("edges", [])]
    return DagResponse(
        task_id=str(task_id),
        status=task.status or "unknown",
        nodes=nodes,
        edges=edges,
    )
