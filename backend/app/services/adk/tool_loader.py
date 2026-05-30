"""Tool config loader — converts DB Agent.tool_config JSONB to ADK Tool instances.

Supports:
- ``"builtin"`` — look up a pre-registered Python callable by name.
- ``"agent_tool"`` — wrap another DB Agent as an ADK AgentTool.

Usage::

    from app.services.adk.tool_loader import ToolLoader, register_builtin

    @register_builtin("get_weather")
    def get_weather(city: str) -> dict: ...

    loader = ToolLoader(agent_models={...})
    tools = loader.load(agent.tool_config)
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from google.adk.agents import Agent
from google.adk.tools import FunctionTool, AgentTool

from app.models.agent import Agent as AgentModel
from app.services.adk.models import get_anthropic_llm, get_litellm

logger = logging.getLogger("agenthub.tool_loader")

_builtin_registry: dict[str, Callable[..., Any]] = {}


def register_builtin(name: str):
    """Decorator that registers a callable in the builtin tool registry.

    Example::

        @register_builtin("get_weather")
        def get_weather(city: str) -> dict:
            ...
    """
    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        _builtin_registry[name] = func
        return func
    return decorator


class ToolLoader:
    """Converts ``tool_config`` JSONB to a list of ADK Tool instances.

    Parameters
    ----------
    agent_models:
        Optional map of agent_id → Agent DB model, used to resolve
        ``"agent_tool"`` entries.
    """

    _builtins_loaded: bool = False

    def __init__(
        self,
        agent_models: dict[str, AgentModel] | None = None,
    ) -> None:
        self._agent_models = agent_models or {}

    @classmethod
    def _ensure_builtins_loaded(cls) -> None:
        if not cls._builtins_loaded:
            from app.services.adk import cli_tools  # noqa: F401  triggers @register_builtin
            cls._builtins_loaded = True

    def load(self, tool_config: dict | None) -> list:
        """Parse tool_config and return ADK Tool list.

        ``tool_config`` shape::

            {
              "tools": [
                {"type": "builtin", "name": "get_weather"},
                {"type": "agent_tool", "agent_id": "<uuid>"}
              ]
            }
        """
        self._ensure_builtins_loaded()
        if not tool_config:
            return []

        tools: list = []
        for item in tool_config.get("tools", []) or []:
            t = self._load_one(item)
            if t is not None:
                tools.append(t)
        return tools

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _load_one(self, item: dict):
        kind = (item.get("type") or "").strip().lower()
        if kind == "builtin":
            return self._load_builtin(item)
        if kind in ("agent_tool", "agenttool"):
            return self._load_agent_tool(item)
        logger.warning("Unknown tool type %r in tool_config", kind)
        return None

    def _load_builtin(self, item: dict) -> FunctionTool | None:
        name = item.get("name", "").strip()
        func = _builtin_registry.get(name)
        if func is None:
            logger.warning("Builtin tool %r not found in registry", name)
            return None
        return FunctionTool(func=func)

    def _load_agent_tool(self, item: dict) -> AgentTool | None:
        agent_id = item.get("agent_id", "").strip()
        agent_model = self._agent_models.get(agent_id)
        if agent_model is None:
            logger.warning(
                "AgentTool referenced unknown agent %r", agent_id
            )
            return None
        agent = Agent(
            name=agent_model.name,
            description=agent_model.system_prompt[:200] if agent_model.system_prompt
            else f"Handles {agent_model.name} tasks",
            model=self._resolve_model(agent_model),
            instruction=agent_model.system_prompt or "You are a helpful assistant.",
            mode="single_turn",
        )
        return AgentTool(agent=agent)

    @staticmethod
    def _resolve_model(agent: AgentModel):
        provider = (agent.provider or "").lower()
        if provider in ("anthropic", "anthropicllm", "claude"):
            return get_anthropic_llm(model=agent.model or "claude-sonnet-4-6")
        return get_litellm(model=agent.model or "openai/codex")
