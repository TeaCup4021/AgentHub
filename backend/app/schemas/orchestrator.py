from uuid import UUID
from typing import List, Optional
from pydantic import Field
from app.schemas.base import BaseSchema


class SubTaskPlan(BaseSchema):
    subtask_id: str
    agent_id: UUID
    agent_name: str
    instruction: str
    depends_on: list[str] = []
    mode: str = "single_turn"
    output_key: Optional[str] = None


class OrchestratorPlan(BaseSchema):
    subtasks: List[SubTaskPlan]
    planner_agent_id: Optional[UUID] = None
    planner_agent_name: Optional[str] = None


class DagNode(BaseSchema):
    subtask_id: str
    agent_id: str
    agent_name: str
    instruction: str
    status: str
    latency_ms: Optional[int] = None
    output_message_id: Optional[str] = None


class DagEdge(BaseSchema):
    from_node: str = Field(alias="from")
    to_node: str = Field(alias="to")


class DagResponse(BaseSchema):
    task_id: str
    status: str
    nodes: List[DagNode]
    edges: List[DagEdge]
