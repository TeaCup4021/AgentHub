import os

from anthropic import AsyncAnthropic
from google.adk.models.anthropic_llm import AnthropicLlm
from google.adk.models.lite_llm import LiteLlm


class ConfigurableAnthropicLlm(AnthropicLlm):
    """AnthropicLlm that accepts per-agent api_key and base_url.

    The default AnthropicLlm reads credentials only from environment variables
    (``ANTHROPIC_API_KEY``, ``ANTHROPIC_BASE_URL``). This subclass allows
    overriding them per agent instance.
    """

    def __init__(
        self,
        model: str = "claude-sonnet-4-6",
        api_key: str | None = None,
        base_url: str | None = None,
    ):
        super().__init__(model=model)
        self._custom_api_key = api_key
        self._custom_base_url = base_url

    @property
    def _anthropic_client(self) -> AsyncAnthropic:
        kwargs: dict = {}
        if self._custom_api_key:
            kwargs["api_key"] = self._custom_api_key
        if self._custom_base_url:
            # Strip trailing /v1/messages — Anthropic SDK appends it automatically
            cleaned = self._custom_base_url.rstrip("/")
            if cleaned.endswith("/v1/messages"):
                cleaned = cleaned[:-len("/v1/messages")]
            elif cleaned.endswith("/v1"):
                cleaned = cleaned[:-len("/v1")]
            kwargs["base_url"] = cleaned
        return AsyncAnthropic(**kwargs) if kwargs else AsyncAnthropic()


def get_anthropic_llm(model: str = "claude-sonnet-4-6") -> AnthropicLlm:
    return AnthropicLlm(model=model)


def get_deepseek_llm(model: str | None = None) -> LiteLlm:
    """
    返回一个为DeepSeek配置的LiteLlm实例。
    该模型按以下顺序解析：1. 显式*model*参数 2. “AGENTHUB_ORCHESTRATOR_MODEL”环境变量 3. 默认值“deepseek/deepseek-v4-pro”
    凭据从环境变量“DEEPSEEK_API_KEY”/“DEEPSEEK_BASE_URL”中读取，并明确传递给LiteLlm。
    """
    import logging
    from app.core.config import settings

    resolved = model or os.getenv("AGENTHUB_ORCHESTRATOR_MODEL", "deepseek/deepseek-v4-pro")
    logging.getLogger("agenthub.planner").info("Orchestrator LLM resolved: %s", resolved)

    litellm_kwargs: dict = {}
    if settings.DEEPSEEK_API_KEY:
        litellm_kwargs["api_key"] = settings.DEEPSEEK_API_KEY
    if settings.DEEPSEEK_BASE_URL:
        litellm_kwargs["api_base"] = settings.DEEPSEEK_BASE_URL

    return LiteLlm(model=resolved, **litellm_kwargs)


def get_litellm(model: str = "openai/codex", **kwargs):
    return LiteLlm(model=model, **kwargs)


def resolve_agent_model(
    provider: str,
    model: str,
    api_key: str | None = None,
    base_url: str | None = None,
) -> AnthropicLlm | LiteLlm:
    """Resolve the LLM backend for an agent's provider + model combination.

    Args:
        provider: The agent's provider (anthropic, litellm, etc.).
        model: The model name.
        api_key: Optional per-agent API key override.
        base_url: Optional per-agent base URL override.

    Raises:
        ValueError: if provider is "anthropic" but model is not a Claude model.

    Returns:
        An AnthropicLlm or LiteLlm instance configured with custom credentials.
    """
    provider_lower = (provider or "").lower().strip()
    model_name = (model or "").strip()
    is_anthropic_provider = provider_lower in ("anthropic", "anthropicllm", "claude")

    if is_anthropic_provider:
        resolved = model_name or "claude-sonnet-4-6"
        return ConfigurableAnthropicLlm(model=resolved, api_key=api_key, base_url=base_url)

    # LiteLLM / any other provider → route through LiteLlm
    # "litellm" is a routing mechanism, not a real LLM provider. Don't use it
    # as a model prefix; default to "openai/" for OpenAI-compatible APIs.
    if model_name and "/" not in model_name:
        if provider_lower and provider_lower != "litellm":
            model_name = f"{provider_lower}/{model_name}"
        else:
            model_name = f"openai/{model_name}"

    # Build LiteLlm kwargs for custom credentials
    litellm_kwargs: dict = {}
    if api_key:
        litellm_kwargs["api_key"] = api_key
    if base_url:
        # Strip trailing /chat/completions if user included the full path;
        # LiteLlm/LiteLLM will append it automatically.
        cleaned = base_url.rstrip("/")
        if cleaned.endswith("/chat/completions"):
            cleaned = cleaned[:-len("/chat/completions")].rstrip("/")
        litellm_kwargs["api_base"] = cleaned

    import logging
    logging.getLogger("agenthub.runner").info(
        "resolve_agent_model: provider=%s model=%s resolved=%s base_url=%s",
        provider, model, model_name, base_url,
    )

    return LiteLlm(model=model_name or "openai/codex", **litellm_kwargs)
