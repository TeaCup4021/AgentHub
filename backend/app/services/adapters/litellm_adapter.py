"""LiteLLM adapter — routes through LiteLLM for OpenAI-compatible APIs.

Handles providers like openai, litellm, deepseek, and any other
OpenAI-compatible API endpoint. The model name is auto-prefixed with
the provider name for LiteLLM routing (e.g. "openai/gpt-5.4").

provider="litellm" is treated specially: it is NOT used as a model prefix
since it's not a real LLM provider. The model name is used as-is, falling
back to "openai/" prefix if no provider prefix is present.
"""

from __future__ import annotations

import logging
from typing import Any

from google.adk.models.lite_llm import LiteLlm

from app.models.agent import Agent
from app.services.adapters.base import AgentAdapter, AdapterRegistry

logger = logging.getLogger("agenthub.adapter.litellm")


class LiteLlmAdapter(AgentAdapter):
    """Adapter for OpenAI-compatible APIs via LiteLLM."""

    def resolve_model(self, agent: Agent) -> Any:
        provider_lower = (agent.provider or "").lower().strip()
        model_name = (agent.model or "").strip()

        # Auto-prefix model with provider for LiteLLM routing.
        # "litellm" is not a real provider — don't use it as a prefix.
        if model_name and "/" not in model_name:
            if provider_lower and provider_lower != "litellm":
                model_name = f"{provider_lower}/{model_name}"
            else:
                model_name = f"openai/{model_name}"

        litellm_kwargs: dict = {}
        if agent.api_key:
            litellm_kwargs["api_key"] = agent.api_key
        if agent.base_url:
            litellm_kwargs["api_base"] = agent.base_url

        logger.info(
            "LiteLlmAdapter.resolve_model: provider=%s model=%s resolved=%s base_url=%s",
            agent.provider, agent.model, model_name, agent.base_url,
        )

        return LiteLlm(model=model_name or "openai/codex", **litellm_kwargs)

    def is_cli(self) -> bool:
        return False


# Register providers that route through LiteLLM.
AdapterRegistry.register("openai", LiteLlmAdapter())
AdapterRegistry.register("litellm", LiteLlmAdapter())
AdapterRegistry.register("deepseek", LiteLlmAdapter())
