import json
import logging
import re
from dataclasses import dataclass, field
from uuid import UUID, uuid4
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from google.adk.agents import LlmAgent
from google.adk.planners import BuiltInPlanner
from google.adk.workflow import Workflow
from google.genai import types

from app.models.agent import Agent
from app.schemas.orchestrator import OrchestratorPlan, SubTaskPlan
from app.services.adk.runner import AgentHubRunner
from app.services.adk.models import get_anthropic_llm

logger = logging.getLogger("agenthub.planner")


@dataclass
class OrchestratorPlanResult:
    plan: OrchestratorPlan
    raw_text: str = ""
    workflow: Workflow | None = None


class OrchestratorPlanner:

    async def plan(
        self,
        db: AsyncSession,
        user_message: str,
        agent_ids: List[UUID],
        conversation_id: UUID,
    ) -> OrchestratorPlanResult:
        agents = await self._lookup_agents(db, agent_ids)

        instruction = self._build_instruction(user_message, agents)

        agent = LlmAgent(
            name="orchestrator",
            model=get_anthropic_llm(),
            instruction=instruction,
            planner=BuiltInPlanner(
                thinking_config=types.ThinkingConfig(thinking_budget=1024)
            ),
        )

        runner = AgentHubRunner(agent=agent, app_name="agenthub_planner")
        events = await runner.run_single_turn(
            user_id=str(conversation_id),
            session_id=f"plan-{conversation_id}",
            message=user_message,
        )

        raw_text = self._extract_text(events)
        plan = self._parse_plan(raw_text, user_message, agents)

        return OrchestratorPlanResult(plan=plan, raw_text=raw_text)

    async def _lookup_agents(self, db: AsyncSession, agent_ids: List[UUID]) -> List[Agent]:
        if not agent_ids:
            return []
        result = await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))
        return list(result.scalars().all())

    def _build_instruction(self, user_message: str, agents: List[Agent]) -> str:
        agent_list = "\n".join(
            f"- {a.name} (id={a.id})"
            + (f": {a.system_prompt[:120]}" if a.system_prompt else "")
            for a in agents
        ) if agents else "(none)"
        return (
            "You are a task orchestrator. Analyze the user's request and break it down "
            "into subtasks with dependencies.\n\n"
            f"Available agents:\n{agent_list}\n\n"
            "Output ONLY a JSON object (no markdown, no extra text):\n"
            '{\n'
            '  "subtasks": [\n'
            '    {\n'
            '      "subtaskId": "s1",\n'
            '      "agentId": "<uuid>",\n'
            '      "agentName": "<name>",\n'
            '      "instruction": "<self-contained instruction>",\n'
            '      "dependsOn": [],\n'
            '      "mode": "single_turn",\n'
            '      "outputKey": "result_s1"\n'
            '    }\n'
            '  ]\n'
            '}\n\n'
            "Rules:\n"
            "1. Use exact agentId and agentName from the list above\n"
            "2. Each instruction must be self-contained and actionable\n"
            '3. "dependsOn" lists subtaskIds that must finish before this subtask starts;\n'
            "   if subtask B needs subtask A's output, add A's subtaskId to B's dependsOn\n"
            "4. Independent subtasks should have empty dependsOn (they run in parallel)\n"
            '5. "mode": "single_turn" (no user interaction, auto-return) or '
            '"task" (can ask user for clarification, auto-return)\n'
            '6. "outputKey" is the session state key where this subtask stores its result;\n'
            "   downstream subtasks can reference it via {key} in their instruction\n"
            "7. subtaskId must be unique within the plan (e.g. s1, s2, s3)\n"
            f"User request: {user_message}"
        )

    def _gen_subtask_id(self) -> str:
        return f"sub-{uuid4().hex[:8]}"

    def _extract_text(self, events: list) -> str:
        parts_list: list[str] = []
        for event in events:
            content = getattr(event, "content", None)
            if content is None:
                continue
            for part in getattr(content, "parts", None) or []:
                text = getattr(part, "text", None)
                if text:
                    parts_list.append(text)
        return "".join(parts_list)

    def _parse_plan(
        self,
        raw_text: str,
        user_message: str,
        agents: List[Agent],
    ) -> OrchestratorPlan:
        match = re.search(r"\{[\s\S]*\"subtasks\"[\s\S]*\}", raw_text)
        if match:
            try:
                data = json.loads(match.group(0))
                subtasks = [
                    SubTaskPlan(
                        subtask_id=item.get("subtaskId", self._gen_subtask_id()),
                        agent_id=UUID(item["agentId"]),
                        agent_name=item["agentName"],
                        instruction=item["instruction"],
                        depends_on=item.get("dependsOn", []),
                        mode=item.get("mode", "single_turn"),
                        output_key=item.get("outputKey"),
                    )
                    for item in data.get("subtasks", [])
                ]
                if subtasks:
                    return OrchestratorPlan(subtasks=subtasks)
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.warning("Plan JSON parse failed: %s", e)

        if agents:
            return OrchestratorPlan(subtasks=[
                SubTaskPlan(
                    subtask_id=self._gen_subtask_id(),
                    agent_id=agents[0].id,
                    agent_name=agents[0].name,
                    instruction=user_message,
                    depends_on=[],
                    mode="single_turn",
                    output_key=None,
                )
            ])
        return OrchestratorPlan(subtasks=[])
