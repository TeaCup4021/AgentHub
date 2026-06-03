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
from app.services.adk.runner import AgentHubRunner, build_agent_from_model
from app.services.adk.models import get_deepseek_llm

logger = logging.getLogger("agenthub.planner")

# Regex matching ADK template variables like {identifier} or {identifier?}
_ADK_TEMPLATE_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\??\}")


def _sanitize_for_adk_instruction(text: str) -> str:
    """Replace {identifier} patterns with (identifier) to prevent ADK from
    attempting session-state injection on text that is not meant to be a template."""
    if not text:
        return text
    return _ADK_TEMPLATE_RE.sub(r"(\1)", text)


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
        planner_agent: Agent | None = None,
    ) -> OrchestratorPlanResult:
        """Generate an execution plan.

        If *planner_agent* is provided, that agent (its model + system_prompt)
        acts as the planner.  Otherwise the built-in Orchestrator LLM is used.
        """
        agents = await self._lookup_agents(db, agent_ids)

        if planner_agent is not None:
            logger.info(
                "Planner mode: agent-based | agent=%s model=%s provider=%s",
                planner_agent.name, planner_agent.model, planner_agent.provider,
            )
            return await self._plan_with_agent(
                planner_agent, agents, user_message, conversation_id
            )

        logger.info("Planner mode: built-in orchestrator | model=%s", get_deepseek_llm().model)
        return await self._plan_with_orchestrator(agents, user_message, conversation_id)

    async def refine(
        self,
        db: AsyncSession,
        current_plan: OrchestratorPlan,
        user_feedback: str,
        agent_ids: List[UUID],
        conversation_id: UUID,
        planner_agent: Agent | None = None,
    ) -> OrchestratorPlanResult:
        """Adjust an existing plan based on user feedback.

        Delegates to the same planner (agent or built-in) that created the
        original plan so the refinement style is consistent.
        """
        agents = await self._lookup_agents(db, agent_ids)

        if planner_agent is not None:
            logger.info(
                "Planner refine mode: agent-based | agent=%s model=%s provider=%s",
                planner_agent.name, planner_agent.model, planner_agent.provider,
            )
            return await self._refine_with_agent(
                planner_agent, agents, current_plan, user_feedback, conversation_id
            )

        logger.info("Planner refine mode: built-in orchestrator | model=%s", get_deepseek_llm().model)
        return await self._refine_with_orchestrator(
            agents, current_plan, user_feedback, conversation_id
        )

    # ── Agent-based planning ──────────────────────────────────────────────

    async def _plan_with_agent(
        self,
        planner_agent: Agent,
        executors: List[Agent],
        user_message: str,
        conversation_id: UUID,
    ) -> OrchestratorPlanResult:
        agent = build_agent_from_model(planner_agent)
        # Override the instruction with the planning prompt
        agent.instruction = self._build_agent_planner_instruction(user_message, executors)
        agent.tools = []  # Planner does not need the agent's tools
        agent.planner = BuiltInPlanner(
            thinking_config=types.ThinkingConfig(thinking_budget=1024)
        )
        return await self._run_planner(agent, user_message, conversation_id, executors)

    async def _refine_with_agent(
        self,
        planner_agent: Agent,
        executors: List[Agent],
        current_plan: OrchestratorPlan,
        user_feedback: str,
        conversation_id: UUID,
    ) -> OrchestratorPlanResult:
        agent = build_agent_from_model(planner_agent)
        agent.instruction = self._build_agent_refine_instruction(
            current_plan, user_feedback, executors
        )
        agent.tools = []  # Planner does not need the agent's tools
        agent.planner = BuiltInPlanner(
            thinking_config=types.ThinkingConfig(thinking_budget=1024)
        )
        return await self._run_planner(agent, user_feedback, conversation_id, executors)

    # ── Built-in Orchestrator (LLM) planning ──────────────────────────────

    async def _plan_with_orchestrator(
        self,
        agents: List[Agent],
        user_message: str,
        conversation_id: UUID,
    ) -> OrchestratorPlanResult:
        instruction = self._build_orchestrator_instruction(user_message, agents)
        agent = LlmAgent(
            name="orchestrator",
            model=get_deepseek_llm(),
            instruction=instruction,
            planner=BuiltInPlanner(
                thinking_config=types.ThinkingConfig(thinking_budget=1024)
            ),
        )
        return await self._run_planner(agent, user_message, conversation_id, agents)

    async def _refine_with_orchestrator(
        self,
        agents: List[Agent],
        current_plan: OrchestratorPlan,
        user_feedback: str,
        conversation_id: UUID,
    ) -> OrchestratorPlanResult:
        instruction = self._build_orchestrator_refine_instruction(
            current_plan, user_feedback, agents
        )
        agent = LlmAgent(
            name="orchestrator",
            model=get_deepseek_llm(),
            instruction=instruction,
            planner=BuiltInPlanner(
                thinking_config=types.ThinkingConfig(thinking_budget=1024)
            ),
        )
        return await self._run_planner(agent, user_feedback, conversation_id, agents)

    # ── Shared runner ─────────────────────────────────────────────────────

    async def _run_planner(
        self,
        agent: LlmAgent,
        message: str,
        conversation_id: UUID,
        agents: List[Agent],
    ) -> OrchestratorPlanResult:
        runner = AgentHubRunner(agent=agent, app_name="agenthub_planner")
        events = await runner.run_single_turn(
            user_id=str(conversation_id),
            session_id=f"plan-{conversation_id}",
            message=message,
        )
        raw_text = self._extract_text(events)
        plan = self._parse_plan(raw_text, message, agents)
        return OrchestratorPlanResult(plan=plan, raw_text=raw_text)

    # ── Instruction builders ──────────────────────────────────────────────

    def _build_agent_planner_instruction(
        self, user_message: str, agents: List[Agent]
    ) -> str:
        return self._plan_prompt("create", user_message, agents)

    def _build_orchestrator_instruction(
        self, user_message: str, agents: List[Agent]
    ) -> str:
        return (
            "You are a task orchestrator. Analyze the user's request and break it down "
            "into subtasks with dependencies.\n\n"
            + self._plan_prompt("create", user_message, agents)
        )

    def _build_agent_refine_instruction(
        self,
        current_plan: OrchestratorPlan,
        user_feedback: str,
        agents: List[Agent],
    ) -> str:
        return self._plan_prompt("refine", user_feedback, agents, current_plan)

    def _build_orchestrator_refine_instruction(
        self,
        current_plan: OrchestratorPlan,
        user_feedback: str,
        agents: List[Agent],
    ) -> str:
        return (
            "You are a task orchestrator. The user wants to modify the current "
            "execution plan based on their feedback. Update the plan accordingly.\n\n"
            + self._plan_prompt("refine", user_feedback, agents, current_plan)
        )

    def _plan_prompt(
        self,
        mode: str,
        user_message: str,
        agents: List[Agent],
        current_plan: OrchestratorPlan | None = None,
    ) -> str:
        agent_list = "\n".join(
            f"- {a.name} (id={a.id})"
            + (f": {_sanitize_for_adk_instruction(a.system_prompt[:120])}" if a.system_prompt else "")
            for a in agents
        ) if agents else "(none)"

        current_plan_text = ""
        if current_plan and current_plan.subtasks:
            lines = []
            for st in current_plan.subtasks:
                deps = ", ".join(st.depends_on) if st.depends_on else "none"
                lines.append(
                    f"  {st.subtask_id}: [{st.agent_name}] {st.instruction} "
                    f"(dependsOn: [{deps}], mode: {st.mode})"
                )
            current_plan_text = (
                "Current plan:\n" + "\n".join(lines) + "\n\n"
                "Modify the plan according to the user's feedback above. "
                "You may add, remove, reorder, or reassign subtasks. "
                "Keep subtaskIds unique; use new ids for new subtasks.\n\n"
            )

        return (
            f"{'Create' if mode == 'create' else 'Modify'} an execution plan for the "
            f"following request. Break it into subtasks with dependencies.\n\n"
            f"Available agents:\n{agent_list}\n\n"
            f"{current_plan_text}"
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
            '3. "dependsOn" lists subtaskIds that must finish before this subtask starts\n'
            "4. Independent subtasks should have empty dependsOn (they run in parallel)\n"
            '5. "mode": "single_turn" or "task" (for agents that may need clarification)\n'
            "6. subtaskId must be unique within the plan (e.g. s1, s2, s3)\n"
            f"User request: {user_message}"
        )

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _lookup_agents(self, db: AsyncSession, agent_ids: List[UUID]) -> List[Agent]:
        if not agent_ids:
            return []
        result = await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))
        return list(result.scalars().all())

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
        # Use raw_decode to extract the first complete JSON object, ignoring
        # any trailing text the LLM may have appended after the JSON block.
        start = raw_text.find("{")
        if start != -1:
            try:
                decoder = json.JSONDecoder()
                data, _ = decoder.raw_decode(raw_text, start)
                if "subtasks" in data:
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
