"""Anthropic adapter — routes through the native Anthropic SDK."""

from __future__ import annotations

from typing import Any

from app.models.agent import Agent
from app.services.adapters.base import AgentAdapter, AdapterRegistry
from app.services.adk.models import ConfigurableAnthropicLlm


class AnthropicAdapter(AgentAdapter):
    """Adapter for Anthropic's native Messages API (Claude models).

    Uses ConfigurableAnthropicLlm which supports per-agent api_key/base_url
    overrides, unlike the default AnthropicLlm which only reads env vars.
    """

    def resolve_model(self, agent: Agent) -> Any:
        return ConfigurableAnthropicLlm(
            model=agent.model or "claude-sonnet-4-6",
            api_key=agent.api_key or None,
            base_url=agent.base_url or None,
        )

    def is_cli(self) -> bool:
        return False


# Register all provider aliases that map to the Anthropic API.
AdapterRegistry.register("anthropic", AnthropicAdapter())
AdapterRegistry.register("anthropicllm", AnthropicAdapter())
AdapterRegistry.register("claude", AnthropicAdapter())
