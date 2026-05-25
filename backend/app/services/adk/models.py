from google.adk.models.anthropic_llm import AnthropicLlm


def get_anthropic_llm(model: str = "claude-sonnet-4-6") -> AnthropicLlm:
    return AnthropicLlm(model=model)


def get_litellm(model: str = "openai/codex"):
    from google.adk.models.lite_llm import LiteLlm

    return LiteLlm(model=model)

