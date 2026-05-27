from uuid import UUID
from typing import List
from app.schemas.base import BaseSchema


class SubTaskPlan(BaseSchema):
    subtask_id: str
    agent_id: UUID
    agent_name: str
    instruction: str


class OrchestratorPlan(BaseSchema):
    subtasks: List[SubTaskPlan]
