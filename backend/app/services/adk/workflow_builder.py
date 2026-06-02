import os
from uuid import UUID

from google.adk.agents import LlmAgent
from google.adk.workflow import Workflow, Edge, JoinNode
from google.adk.workflow._graph import START

from app.models.agent import Agent
from app.schemas.orchestrator import OrchestratorPlan
from app.services.adk.execution_tracer import ExecutionTracer
from app.services.adk.models import get_anthropic_llm
from app.services.adk.tool_loader import ToolLoader


class WorkflowBuilder:

    def build(
        self,
        plan: OrchestratorPlan,
        agent_models: dict[UUID, Agent] | None = None,
        execution_tracer: ExecutionTracer | None = None,
    ) -> Workflow:
        if agent_models is None:
            agent_models = {}

        # Normalize agent_models keys to uuid.UUID for consistent lookup
        normalized: dict[UUID, Agent] = {}
        for k, v in agent_models.items():
            normalized[UUID(k) if not isinstance(k, UUID) else k] = v
        agent_models = normalized

        tool_loader = ToolLoader(agent_models={
            str(aid): a for aid, a in agent_models.items()
        })

        agent_map: dict[str, LlmAgent] = {}
        for st in plan.subtasks:
            db_agent = agent_models.get(st.agent_id)
            agent_name = "agent_" + str(st.agent_id).replace("-", "_")

            if db_agent is not None:
                instruction = self._merge_instruction(db_agent, st.instruction)
                model = self._resolve_model(db_agent)
                tools = tool_loader.load(db_agent.tool_config)
            else:
                instruction = st.instruction
                model = get_anthropic_llm()
                tools = []

            agent_kwargs: dict = {
                "name": agent_name,
                "model": model,
                "instruction": instruction,
                "tools": tools,
                "output_key": st.output_key,
            }
            if execution_tracer is not None:
                agent_kwargs["before_agent_callback"] = execution_tracer.before_agent
                agent_kwargs["after_agent_callback"] = execution_tracer.after_agent

            agent = LlmAgent(**agent_kwargs)
            agent_map[st.subtask_id] = agent

        edges: list[Edge] = []
        dependent_ids: set[str] = set()
        for st in plan.subtasks:
            for dep_id in st.depends_on:
                dependent_ids.add(dep_id)

        for st in plan.subtasks:
            if not st.depends_on:
                edges.append(Edge(from_node=START, to_node=agent_map[st.subtask_id]))
            elif len(st.depends_on) == 1:
                dep_agent = agent_map.get(st.depends_on[0])
                if dep_agent is not None:
                    edges.append(Edge(from_node=dep_agent, to_node=agent_map[st.subtask_id]))
            else:
                join = JoinNode(name=f"join_{st.subtask_id}")
                for dep_id in st.depends_on:
                    dep_agent = agent_map.get(dep_id)
                    if dep_agent is not None:
                        edges.append(Edge(from_node=dep_agent, to_node=join))
                edges.append(Edge(from_node=join, to_node=agent_map[st.subtask_id]))

        # If multiple terminal nodes, add a final JoinNode to gather results
        terminal_ids = [
            st.subtask_id for st in plan.subtasks
            if st.subtask_id not in dependent_ids
        ]
        if len(terminal_ids) > 1:
            final_join = JoinNode(name="final_join")
            for tid in terminal_ids:
                edges.append(Edge(from_node=agent_map[tid], to_node=final_join))

        concurrency = int(os.getenv("AGENTHUB_WORKFLOW_MAX_CONCURRENCY", "3"))
        return Workflow(
            name="orchestrator_plan",
            edges=edges,
            max_concurrency=min(len(agent_map), concurrency) if agent_map else 1,
        )

    @staticmethod
    def _merge_instruction(db_agent: Agent, task_instruction: str) -> str:
        """Merge the DB agent's system_prompt (general capability) with the
        Planner's task instruction (specific task)."""
        base = db_agent.system_prompt.strip() if db_agent.system_prompt else ""
        if base:
            return base + "\n\nYour specific task: " + task_instruction
        return task_instruction

    @staticmethod
    def _resolve_model(db_agent: Agent):
        """Resolve the LLM model from the agent's provider/model config."""
        from app.services.adk.models import resolve_agent_model
        return resolve_agent_model(
            provider=db_agent.provider or "",
            model=db_agent.model or "",
            api_key=db_agent.api_key or None,
            base_url=db_agent.base_url or None,
        )
