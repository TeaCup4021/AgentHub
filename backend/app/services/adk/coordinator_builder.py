from google.adk.agents import LlmAgent, Agent

from app.models.agent import Agent as AgentModel
from app.services.adk.execution_tracer import ExecutionTracer
from app.services.adk.models import get_anthropic_llm, get_litellm
from app.services.adk.tool_loader import ToolLoader


class CoordinatorBuilder:
    """Build a Coordinator-centric collaborative workflow.

    Uses ADK 2.0 Collaborative Workflow: a root LlmAgent acts as coordinator
    and dynamically dispatches to sub_agents via request_task_<agent_name>.
    Sub-agents use ``mode`` to control interaction and return behavior.
    """

    def build(
        self,
        agent_models: list[AgentModel],
        execution_tracer: ExecutionTracer | None = None,
    ) -> Agent:
        sub_agents = self._build_sub_agents(agent_models, execution_tracer)
        coordinator_kwargs: dict = {
            "name": "orchestrator",
            "model": get_anthropic_llm(),
            "instruction": self._build_coordinator_instruction(agent_models),
            "description": "Main orchestrator that coordinates sub-agents to complete tasks",
            "sub_agents": sub_agents,
        }
        if execution_tracer is not None:
            coordinator_kwargs["before_agent_callback"] = execution_tracer.before_agent
            coordinator_kwargs["after_agent_callback"] = execution_tracer.after_agent
        coordinator = LlmAgent(**coordinator_kwargs)
        return coordinator

    def _build_sub_agents(
        self, agent_models: list[AgentModel], execution_tracer: ExecutionTracer | None = None,
    ) -> list[Agent]:
        agent_model_map = {str(a.id): a for a in agent_models}
        tool_loader = ToolLoader(agent_models=agent_model_map)

        sub_agents: list[Agent] = []
        for am in agent_models:
            capabilities = am.capabilities or []
            cap_tags = ", ".join(capabilities) if isinstance(capabilities, list) else str(capabilities)
            description = am.system_prompt.strip()[:200] if am.system_prompt else f"Handles {am.name} tasks"
            if cap_tags:
                description = f"[{cap_tags}] {description}"

            sub_kwargs: dict = {
                "name": am.name,
                "description": description,
                "model": self._resolve_model(am),
                "instruction": am.system_prompt or "You are a helpful assistant.",
                "tools": tool_loader.load(am.tool_config),
                "mode": "task",
            }
            if execution_tracer is not None:
                sub_kwargs["before_agent_callback"] = execution_tracer.before_agent
                sub_kwargs["after_agent_callback"] = execution_tracer.after_agent

            sub = Agent(**sub_kwargs)
            sub_agents.append(sub)
        return sub_agents

    def _build_coordinator_instruction(self, agents: list[AgentModel]) -> str:
        agent_descriptions = "\n".join(
            f"- {a.name}: {a.system_prompt[:150] if a.system_prompt else 'No description'}"
            for a in agents
        )
        return (
            "You are an intelligent orchestrator. Your job is to understand the "
            "user's request and coordinate the appropriate specialists to complete it.\n\n"
            "Guidelines:\n"
            "1. Analyze the user's intent carefully before acting\n"
            "2. Break complex tasks into steps and execute them in the right order\n"
            "3. Use the available specialists by calling request_task_<agent_name>\n"
            "4. Wait for each specialist to complete before using their results\n"
            "5. If a specialist's output is unclear or incomplete, ask the user for clarification\n"
            "6. Combine results from multiple specialists into a single coherent response\n"
            "7. If you discover you need information you don't have, ask the user\n\n"
            f"Available specialists:\n{agent_descriptions}\n\n"
            "Remember: you are the conductor. Delegate to specialists, "
            "don't try to do their work yourself."
        )

    @staticmethod
    def _resolve_model(agent: AgentModel):
        provider = (agent.provider or "").lower()
        if provider in ("anthropic", "anthropicllm", "claude"):
            return get_anthropic_llm(model=agent.model or "claude-sonnet-4-6")
        return get_litellm(model=agent.model or "openai/codex")
