from uuid import UUID
from typing import List, Optional
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
