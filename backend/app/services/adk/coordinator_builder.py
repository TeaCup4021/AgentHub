from google.adk.agents import LlmAgent
from google.adk.agents.base_agent import BaseAgent
from google.adk.models.llm_response import LlmResponse
from google.genai import types
import re

from app.models.agent import Agent as AgentModel
from app.services.adk.execution_tracer import ExecutionTracer
from app.services.adk.models import resolve_agent_model, get_deepseek_llm
from app.services.adk.tool_loader import ToolLoader

CLI_PROVIDERS = {"claude-code-cli", "codex-cli"}

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
    ) -> LlmAgent:
        sub_agents = self._build_sub_agents(agent_models, execution_tracer)
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

    def _build_sub_agents(
        self,
        agent_models: list[AgentModel],
        execution_tracer: ExecutionTracer | None = None,
    ) -> list:
        agent_model_map = {str(a.id): a for a in agent_models}
        tool_loader = ToolLoader(agent_models=agent_model_map)
        sub_agents: list = []

        for am in agent_models:
            provider = (am.provider or "").lower()
            if provider in CLI_PROVIDERS:
                sub = self._build_cli_sub_agent(am, execution_tracer)
            else:
                sub = self._build_llm_sub_agent(am, tool_loader, execution_tracer)
            sub_agents.append(sub)

        return sub_agents

    @staticmethod
    def _sanitize_name(name: str) -> str:
        return name.replace(" ", "_").replace("-", "_")

    def _build_llm_sub_agent(
        self,
        am: AgentModel,
        tool_loader: ToolLoader,
        execution_tracer: ExecutionTracer | None = None,
    ) -> LlmAgent:
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
            "model": self._resolve_model(am),
            "instruction": am.system_prompt or "You are a helpful assistant.",
            "tools": tool_loader.load(am.tool_config),
            "mode": "task",
        }
        if execution_tracer is not None:
            kwargs["before_agent_callback"] = execution_tracer.before_agent
            kwargs["after_agent_callback"] = execution_tracer.after_agent

        return LlmAgent(**kwargs)

    def _build_cli_sub_agent(
        self,
        am: AgentModel,
        execution_tracer: ExecutionTracer | None = None,
    ) -> LlmAgent:
        """Build a sub-agent backed by local CLI instead of LLM API.

        Uses before_model_callback to intercept the model call and run the
        CLI process. The coordinator dispatches to this agent via
        request_task_<name> just like any other sub-agent.
        """
        provider = (am.provider or "").lower()

        async def cli_before_model_callback(
            callback_context, llm_request
        ) -> LlmResponse | None:
            from app.services.adk.cli_tools import claude_code_tool, codex_cli_tool

            # Extract user prompt from the LLM request contents
            prompt_parts: list[str] = []
            for content in getattr(llm_request, "contents", []) or []:
                role = getattr(content, "role", "")
                if role == "user":
                    for part in getattr(content, "parts", []) or []:
                        text = getattr(part, "text", "")
                        if text:
                            prompt_parts.append(text)
            user_prompt = "\n".join(prompt_parts) if prompt_parts else ""

            # Merge system prompt with user request
            full_prompt = (
                am.system_prompt + "\n\nTask:\n" + user_prompt
                if am.system_prompt
                else user_prompt
            )

            # Run the appropriate CLI
            base_tool = claude_code_tool if provider == "claude-code-cli" else codex_cli_tool
            result = await base_tool(prompt=full_prompt)

            if result.get("success"):
                return LlmResponse(
                    content=types.Content(
                        role="model",
                        parts=[types.Part.from_text(text=result.get("result", ""))],
                    ),
                )
            else:
                return LlmResponse(
                    content=types.Content(
                        role="model",
                        parts=[types.Part.from_text(
                            text=f"Error: {result.get('error', 'CLI execution failed')}"
                        )],
                    ),
                )

        description = am.system_prompt.strip()[:200] if am.system_prompt else f"{am.name} - local CLI coding agent"
        capabilities = am.capabilities or []
        cap_tags = (
            ", ".join(capabilities) if isinstance(capabilities, list)
            else str(capabilities)
        )
        if cap_tags:
            description = f"[{cap_tags}] {description}"

        kwargs: dict = {
            "name": self._sanitize_name(am.name),
            "description": description,
            "instruction": am.system_prompt or "You are a helpful coding agent.",
            "before_model_callback": cli_before_model_callback,
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
            "You are an intelligent orchestrator. Your job is to understand the "
            "user's request and coordinate the appropriate specialists to complete it.\n\n"
            "Guidelines:\n"
            "1. Analyze the user's intent carefully before acting\n"
            "2. Break complex tasks into steps and execute them in the right order\n"
            "3. Delegate to specialists by calling request_task_<agent_name>\n"
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
        return resolve_agent_model(
            provider=agent.provider or "",
            model=agent.model or "",
            api_key=agent.api_key or None,
            base_url=agent.base_url or None,
        )
