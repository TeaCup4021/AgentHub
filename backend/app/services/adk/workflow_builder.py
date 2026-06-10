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
import logging

logger = logging.getLogger("agenthub.workflow_builder")


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
        used_names: set[str] = set()
        for st in plan.subtasks:
            db_agent = agent_models.get(st.agent_id)
            # Build unique agent name: "agent_<agent_id>" with a dedup counter
            # when the same agent appears multiple times in the plan.
            base_name = "agent_" + str(st.agent_id).replace("-", "_")
            agent_name = base_name
            dedup = 1
            while agent_name in used_names:
                dedup += 1
                agent_name = f"{base_name}_{dedup}"
            used_names.add(agent_name)

            agent_mode = st.mode or "single_turn"

            if db_agent is not None:
                # Route through AdapterRegistry so CLI agents get proper
                # before_model_callback interception instead of being sent
                # to LiteLLM as an invalid model.
                try:
                    from app.services.adapters.base import AdapterRegistry as _AR
                    adapter = _AR.get_for_agent(db_agent)
                    agent = adapter.build_agent(db_agent, tool_loader=tool_loader)
                    # Override instruction with merged subtask instruction
                    # (fixes issue where CLI and LiteLLM agents only get system_prompt)
                    agent.instruction = self._merge_instruction(db_agent, st.instruction)
                    # Override name for DAG graph node usage
                    agent.name = agent_name
                    # Override mode: preserve Adapter's mode if it's Workflow-compatible,
                    # otherwise force to single_turn (Workflow only accepts single_turn/chat)
                    if agent.mode not in ("single_turn", "chat"):
                        agent.mode = "single_turn"
                    # Attach execution tracer callbacks
                    if execution_tracer is not None:
                        agent.before_agent_callback = execution_tracer.before_agent
                        agent.after_agent_callback = execution_tracer.after_agent
                except ValueError:
                    # No adapter registered: build directly (non-CLI agents)
                    from app.services.pin_spec_injector import before_model_callback
                    instruction = self._merge_instruction(db_agent, st.instruction)
                    model = self._resolve_model(db_agent)
                    tools = tool_loader.load(db_agent.tool_config)
                    agent_kwargs: dict = {
                        "name": agent_name,
                        "model": model,
                        "instruction": instruction,
                        "tools": tools,
                        "output_key": st.output_key,
                        "mode": agent_mode,
                        "before_model_callback": before_model_callback,
                    }
                    if execution_tracer is not None:
                        agent_kwargs["before_agent_callback"] = execution_tracer.before_agent
                        agent_kwargs["after_agent_callback"] = execution_tracer.after_agent
                    agent = LlmAgent(**agent_kwargs)
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
                    "mode": agent_mode,
                }
                if execution_tracer is not None:
                    agent_kwargs["before_agent_callback"] = execution_tracer.before_agent
                    agent_kwargs["after_agent_callback"] = execution_tracer.after_agent
                agent = LlmAgent(**agent_kwargs)

            agent_map[st.subtask_id] = agent
            logger.info(
                "DAG node[%d/%d]: name=%s mode=%s provider=%s instruction=%.80s...",
                len(agent_map), len(plan.subtasks), agent_name, agent_mode,
                getattr(db_agent, "provider", "unknown") if db_agent else "unknown",
                agent.instruction[:80],  # Print the actual merged instruction
            )

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
        max_c = min(len(agent_map), concurrency) if agent_map else 1
        logger.info(
            "Workflow.build: agents=%d edges=%d max_concurrency=%d",
            len(agent_map), len(edges), max_c,
        )
        for e in edges:
            logger.info(
                "  edge: %s -> %s",
                getattr(e.from_node, "name", str(e.from_node)),
                getattr(e.to_node, "name", str(e.to_node)),
            )
        return Workflow(
            name="orchestrator_plan",
            edges=edges,
            max_concurrency=min(len(agent_map), concurrency) if agent_map else 1,
        )

    # Execution-layer guard against an executor behaving like a coordinator.
    # The Planner prompt already forbids assigning "orchestrate/lead the rest"
    # instructions to executors (planner.py rule), but that is a soft LLM
    # constraint. This hard directive — injected into EVERY executor node —
    # ensures that even if a stray coordinating instruction slips through, the
    # agent only does its own subtask and never re-plans/delegates/takes over
    # other agents' work (root cause of "4.8 我来分工…完成剩下的三件事").
    _EXECUTOR_SCOPE_DIRECTIVE = (
        "\n\n[SYSTEM] You are ONE executor in a multi-agent plan. Do ONLY the "
        "single task below and produce ONLY its deliverable. Do NOT plan, "
        "assign, delegate, coordinate, or take over other agents' work, and do "
        "NOT announce who does what — task distribution was already decided by "
        "the orchestrator. [/SYSTEM]"
    )

    @staticmethod
    def _merge_instruction(db_agent: Agent, task_instruction: str) -> str:
        """Merge the DB agent's system_prompt (general capability) with the
        Planner's task instruction (specific task)."""
        from app.services.artifact_format import build_instruction
        base = build_instruction(db_agent)
        return (
            base
            + WorkflowBuilder._EXECUTOR_SCOPE_DIRECTIVE
            + "\n\nYour specific task: "
            + task_instruction
        )

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
