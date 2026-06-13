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

    # Agent-based planning

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

    # Built-in Orchestrator (LLM) planning

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

    # Shared runner

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

    # Instruction builders

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
            + (f" | capabilities: {', '.join(a.capabilities)}" if isinstance(a.capabilities, list) and a.capabilities else "")
            for a in agents
        ) if agents else "(none)"

        current_plan_text = ""
        if current_plan and current_plan.subtasks:
            lines = []
            for st in current_plan.subtasks:
                deps = ", ".join(st.depends_on) if st.depends_on else "none"
                caps = ", ".join(st.recommended_capabilities or []) or "unspecified"
                assignee = (
                    f", agent: {st.agent_name} ({st.agent_id})"
                    if st.agent_id or st.agent_name
                    else ""
                )
                lines.append(
                    f"  {st.subtask_id}: {st.instruction} "
                    f"(capabilities: [{caps}], dependsOn: [{deps}], mode: {st.mode}{assignee})"
                )
            current_plan_text = (
                "Current stage plan:\n" + "\n".join(lines) + "\n\n"
                "Modify the plan according to the user's feedback above. "
                "You may add, remove, reorder, or adjust stages. "
                "Keep subtaskIds unique; use new ids for new stages.\n\n"
            )

        return (
            f"{'Create' if mode == 'create' else 'Modify'} a stage execution plan for the "
            f"following request. This plan is for user review and must include a concrete agent assignment for each stage.\n\n"
            f"Available group agents for capability reference:\n{agent_list}\n\n"
            f"{current_plan_text}"
            "Output ONLY a JSON object (no markdown, no extra text):\n"
            "{\n"
            "  \"subtasks\": [\n"
            "    {\n"
            "      \"subtaskId\": \"s1\",\n"
            "      \"instruction\": \"<stage goal and expected deliverable>\",\n"
            "      \"agentId\": \"<id of one available group agent>\",\n"
            "      \"agentName\": \"<name of that agent>\",\n"
            "      \"assignmentReason\": \"<why this agent is the best fit>\",\n"
            "      \"recommendedCapabilities\": [\"frontend\", \"testing\"],\n"
            "      \"acceptanceCriteria\": [\"<how the user can judge this stage done>\"],\n"
            "      \"dependsOn\": [],\n"
            "      \"canParallel\": true,\n"
            "      \"mode\": \"single_turn\",\n"
            "      \"outputKey\": \"result_s1\"\n"
            "    }\n"
            "  ]\n"
            "}\n\n"
            "Rules:\n"
            "1. Every stage MUST include agentId and agentName selected from Available group agents; never invent agents.\n"
            "2. assignmentReason must briefly explain why the selected agent matches the stage.\n"
            "3. Each stage must describe what should be done and what deliverable should exist.\n"
            "4. recommendedCapabilities should list capability tags or expertise needed for the stage.\n"
            "5. dependsOn controls stage dependencies and display ordering. Empty means the stage can start immediately.\n"
            "6. canParallel is true when the stage can run alongside other stages with satisfied dependencies.\n"
            "7. mode must always be single_turn.\n"
            "8. subtaskId must be unique within the plan.\n"
            "9. Write every instruction in the SAME language as the user request below, and explicitly tell the executor to reply in that language.\n"
            "10. Do not create stages for starting servers or manual deployment commands; the platform handles hosting artifacts automatically.\n"
            f"User request: {user_message}"
        )
    # Helpers

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
                # Skip BuiltInPlanner thinking blocks (part.thought=True). The
                # planner agent reasons out loud before emitting the JSON plan;
                # that reasoning must NOT end up in the plan message content or
                # it leaks the agent's internal deliberation to the user (mirrors
                # the adk_to_sse.py token filter --see CLAUDE.md thought rule).
                if getattr(part, "thought", False):
                    continue
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
                    subtasks = []
                    for item in data.get("subtasks", []):
                        agent_id = item.get("agentId", item.get("agent_id"))
                        parsed_agent_id = None
                        if agent_id:
                            try:
                                parsed_agent_id = UUID(str(agent_id))
                            except ValueError:
                                parsed_agent_id = None
                        subtasks.append(SubTaskPlan(
                            subtask_id=item.get("subtaskId", item.get("subtask_id", self._gen_subtask_id())),
                            agent_id=parsed_agent_id,
                            agent_name=item.get("agentName", item.get("agent_name")),
                            assignment_reason=item.get(
                                "assignmentReason",
                                item.get("assignment_reason"),
                            ),
                            instruction=item["instruction"],
                            recommended_capabilities=item.get(
                                "recommendedCapabilities",
                                item.get("recommended_capabilities", []),
                            ) or [],
                            acceptance_criteria=item.get(
                                "acceptanceCriteria",
                                item.get("acceptance_criteria", []),
                            ) or [],
                            can_parallel=item.get("canParallel", item.get("can_parallel", True)),
                            depends_on=item.get("dependsOn", item.get("depends_on", [])),
                            # Force single_turn mode (Workflow doesn't support "task" mode)
                            mode="single_turn" if item.get("mode") in ("task", None, "") else item.get("mode", "single_turn"),
                            output_key=item.get("outputKey", item.get("output_key")),
                        ))
                    if subtasks:
                        return OrchestratorPlan(subtasks=subtasks)
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.warning("Plan JSON parse failed: %s", e)

        if agents:
            return OrchestratorPlan(subtasks=[
                SubTaskPlan(
                    subtask_id=self._gen_subtask_id(),
                    instruction=user_message,
                    recommended_capabilities=[],
                    acceptance_criteria=[],
                    depends_on=[],
                    mode="single_turn",
                    output_key=None,
                )
            ])
        return OrchestratorPlan(subtasks=[])

