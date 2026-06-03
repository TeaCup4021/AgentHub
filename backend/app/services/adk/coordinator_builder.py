from google.adk.agents import LlmAgent
from google.adk.agents.base_agent import BaseAgent
from google.adk.models.llm_response import LlmResponse
from google.genai import types
import re

from app.models.agent import Agent as AgentModel
from app.services.adapters.base import AdapterRegistry
from app.services.adk.execution_tracer import ExecutionTracer
from app.services.adk.models import get_deepseek_llm
from app.services.adk.tool_loader import ToolLoader

# Regex matching ADK template variables like {identifier} or {identifier?}
_ADK_TEMPLATE_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\??\}")


def _sanitize_for_adk_instruction(text: str) -> str:
    """Replace {identifier} patterns with (identifier) to prevent ADK from
    attempting session-state injection on text that is not meant to be a template."""
    if not text:
        return text
    return _ADK_TEMPLATE_RE.sub(r"(\1)", text)


class CoordinatorBuilder:
    """Build a Coordinator-centric collaborative workflow.

    Uses ADK 2.0 Collaborative Workflow: a root LlmAgent acts as coordinator
    and dynamically dispatches to sub_agents via request_task_<agent_name>.
    CLI-backed agents use before_model_callback to intercept LLM calls and
    run local CLI processes instead.
    """

    def build(
        self,
        agent_models: list[AgentModel],
        execution_tracer: ExecutionTracer | None = None,
        coordinator_agent: AgentModel | None = None,
    ) -> LlmAgent:
        """Build a coordinator LlmAgent with sub_agents.

        If *coordinator_agent* is provided, that agent's model + system_prompt
        is used as the coordinator; otherwise the default DeepSeek orchestrator
        handles coordination.
        """
        sub_agents = self._build_sub_agents(agent_models, execution_tracer)

        if coordinator_agent is not None:
            return self._build_external_coordinator(
                coordinator_agent, agent_models, sub_agents, execution_tracer
            )

        coordinator_kwargs: dict = {
            "name": "orchestrator",
            "model": get_deepseek_llm(),
            "instruction": self._build_coordinator_instruction(agent_models),
            "description": (
                "Main orchestrator that coordinates sub-agents to complete tasks"
            ),
            "sub_agents": sub_agents,
        }
        if execution_tracer is not None:
            coordinator_kwargs["before_agent_callback"] = execution_tracer.before_agent
            coordinator_kwargs["after_agent_callback"] = execution_tracer.after_agent
        return LlmAgent(**coordinator_kwargs)

    def _build_external_coordinator(
        self,
        agent: AgentModel,
        agent_models: list[AgentModel],
        sub_agents: list,
        execution_tracer: ExecutionTracer | None = None,
    ) -> LlmAgent:
        """Build a coordinator from a user-specified agent model.

        Uses the agent's own model, provider, and system_prompt so
        planning decisions reflect that agent's capabilities.
        """
        from app.services.adk.models import resolve_agent_model
        from app.services.adk.runner import _sanitize_agent_name

        model = resolve_agent_model(
            provider=agent.provider or "",
            model=agent.model or "",
            api_key=agent.api_key or None,
            base_url=agent.base_url or None,
        )

        instruction = agent.system_prompt or self._build_coordinator_instruction(agent_models)

        coordinator_kwargs: dict = {
            "name": _sanitize_agent_name(agent.name),
            "model": model,
            "instruction": instruction,
            "description": f"Coordinator powered by {agent.name}",
            "sub_agents": sub_agents,
        }
        if execution_tracer is not None:
            coordinator_kwargs["before_agent_callback"] = execution_tracer.before_agent
            coordinator_kwargs["after_agent_callback"] = execution_tracer.after_agent
        return LlmAgent(**coordinator_kwargs)

    def _build_sub_agents(
        self,
        agent_models: list[AgentModel],
        execution_tracer: ExecutionTracer | None = None,
    ) -> list:
        """Build sub-agents via the registered adapter for each agent's provider.

        Adapters handle all provider-specific logic:
        - LLM agents (Anthropic, LiteLLM) → standard LlmAgent with model + tools
        - CLI agents (Claude Code, Codex) → LlmAgent with before_model_callback
        """
        agent_model_map = {str(a.id): a for a in agent_models}
        tool_loader = ToolLoader(agent_models=agent_model_map)
        sub_agents: list = []

        for am in agent_models:
            try:
                adapter = AdapterRegistry.get_for_agent(am)
            except ValueError:
                # Fallback: treat unknown providers as standard LLM agent
                sub = self._build_fallback_sub_agent(am, tool_loader, execution_tracer)
                sub_agents.append(sub)
                continue

            sub = adapter.build_agent(am, tool_loader=tool_loader)

            # Attach execution tracer callbacks
            if execution_tracer is not None:
                sub.before_agent_callback = execution_tracer.before_agent
                sub.after_agent_callback = execution_tracer.after_agent

            sub_agents.append(sub)

        return sub_agents

    @staticmethod
    def _sanitize_name(name: str) -> str:
        return name.replace(" ", "_").replace("-", "_")

    def _build_fallback_sub_agent(
        self,
        am: AgentModel,
        tool_loader: ToolLoader,
        execution_tracer: ExecutionTracer | None = None,
    ) -> LlmAgent:
        """Build a standard LLM sub-agent for providers without a registered adapter."""
        from app.services.adk.models import resolve_agent_model

        capabilities = am.capabilities or []
        cap_tags = (
            ", ".join(capabilities) if isinstance(capabilities, list)
            else str(capabilities)
        )
        description = (
            am.system_prompt.strip()[:200] if am.system_prompt
            else f"Handles {am.name} tasks"
        )
        if cap_tags:
            description = f"[{cap_tags}] {description}"

        kwargs: dict = {
            "name": self._sanitize_name(am.name),
            "description": description,
            "model": resolve_agent_model(
                provider=am.provider or "",
                model=am.model or "",
                api_key=am.api_key or None,
                base_url=am.base_url or None,
            ),
            "instruction": am.system_prompt or "You are a helpful assistant.",
            "tools": tool_loader.load(am.tool_config),
            "mode": "task",
        }
        if execution_tracer is not None:
            kwargs["before_agent_callback"] = execution_tracer.before_agent
            kwargs["after_agent_callback"] = execution_tracer.after_agent

        return LlmAgent(**kwargs)
    def _build_coordinator_instruction(self, agents: list[AgentModel]) -> str:
        agent_descriptions = "\n".join(
            f"- {a.name} (call: request_task_{self._sanitize_name(a.name)}): "
            f"{_sanitize_for_adk_instruction(a.system_prompt[:150]) if a.system_prompt else 'No description'}"
            for a in agents
        )
        return (
            "You are an intelligent orchestrator. Understand the user's request "
            "and coordinate specialists to complete it.\n\n"
            "Guidelines:\n"
            "1. Analyze intent and delegate to the right specialist via request_task_<agent_name>\n"
            "2. If only one specialist was needed, present their output directly without rephrasing\n"
            "3. If multiple specialists were used, combine their results concisely\n"
            "4. Only ask for clarification when a specialist's output is incomplete or unclear\n"
            "5. Do not add unnecessary commentary or summaries\n\n"
            f"Available specialists:\n{agent_descriptions}\n\n"
            "Delegate to specialists; do not do their work yourself."
        )
