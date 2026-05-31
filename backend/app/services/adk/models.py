import os

from google.adk.models.anthropic_llm import AnthropicLlm
from google.adk.models.lite_llm import LiteLlm


def get_anthropic_llm(model: str = "claude-sonnet-4-6") -> AnthropicLlm:
    return AnthropicLlm(model=model)


def get_deepseek_llm(model: str | None = None) -> LiteLlm:
    """Return a LiteLlm instance configured for DeepSeek.

    The model is resolved in order:
    1. Explicit *model* argument
    2. ``AGENTHUB_ORCHESTRATOR_MODEL`` environment variable
    3. Default ``"deepseek/deepseek-v4-pro"``
    """
    resolved = model or os.getenv("AGENTHUB_ORCHESTRATOR_MODEL", "deepseek/deepseek-v4-pro")
    return LiteLlm(model=resolved)


def get_litellm(model: str = "openai/codex"):
    return LiteLlm(model=model)

