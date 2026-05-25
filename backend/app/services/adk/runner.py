import os
from typing import AsyncGenerator, Optional

from google.adk.agents import LlmAgent
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService, BaseSessionService
from google.genai import types

from app.services.adk.models import get_anthropic_llm, get_litellm
from app.services.pin_spec_injector import before_model_callback

_DEFAULT_SESSION_SERVICE = InMemorySessionService()


def build_single_chat_agent(
    model_provider: str = "anthropic",
    model_name: Optional[str] = None,
    instruction: str = "You are a helpful assistant.",
) -> LlmAgent:
    provider = os.getenv("AGENTHUB_MODEL_PROVIDER", model_provider).lower()
    env_model = os.getenv("AGENTHUB_MODEL_NAME")
    resolved_model = model_name or env_model
    if provider in ("anthropic", "anthropicllm", "claude"):
        model = get_anthropic_llm(model=resolved_model or "claude-sonnet-4-6")
    else:
        model = get_litellm(model=resolved_model or "openai/codex")
    return LlmAgent(
        name="agenthub_default",
        model=model,
        instruction=instruction,
        before_model_callback=before_model_callback,
    )


class AgentHubRunner:
    def __init__(
        self,
        agent: LlmAgent,
        app_name: str = "agenthub",
        session_service: Optional[BaseSessionService] = None,
    ) -> None:
        self.session_service = session_service or _DEFAULT_SESSION_SERVICE
        self.runner = Runner(
            agent=agent,
            app_name=app_name,
            session_service=self.session_service,
        )

    async def stream_single_chat(
        self,
        user_id: str,
        session_id: str,
        message: str,
    ) -> AsyncGenerator:
        await self._ensure_session(user_id=user_id, session_id=session_id)
        async for event in self.runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(
                role="user",
                parts=[types.Part.from_text(text=message)],
            ),
            run_config=RunConfig(streaming_mode=StreamingMode.SSE),
            state_delta={"conversation_id": session_id},
        ):
            yield event

    async def _ensure_session(self, user_id: str, session_id: str) -> None:
        try:
            await self.session_service.create_session(
                app_name="agenthub",
                user_id=user_id,
                session_id=session_id,
            )
        except Exception:
            # Session may already exist.
            return
