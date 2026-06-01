import logging
import os
import re
from typing import Any, AsyncGenerator, Optional

from google.adk.agents import LlmAgent
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService, BaseSessionService
from google.genai import types

from app.models.agent import Agent as AgentModel
from app.services.adk.models import resolve_agent_model
from app.services.adk.tool_loader import ToolLoader
from app.services.pin_spec_injector import before_model_callback

logger = logging.getLogger("agenthub.runner")

_DEFAULT_SESSION_SERVICE = InMemorySessionService()

# Regex to strip characters that are invalid in a Python identifier.
_INVALID_IDENT_CHAR = re.compile(r"[^a-zA-Z0-9_]")


def _sanitize_agent_name(name: str) -> str:
    """Convert an agent display name to a valid Python identifier for ADK."""
    sanitized = _INVALID_IDENT_CHAR.sub("_", name)
    if sanitized[0].isdigit():
        sanitized = "_" + sanitized
    return sanitized


def build_agent_from_model(agent_model: AgentModel) -> LlmAgent:
    """Build an ADK LlmAgent from a database AgentModel.

    Uses the agent's configured provider, model, system_prompt, and tool_config
    so that every single-chat conversation uses the agent the user selected.
    """
    provider = (agent_model.provider or "").lower()
    model_name = agent_model.model or ""

    model = resolve_agent_model(
        provider=provider,
        model=model_name,
        api_key=agent_model.api_key or None,
        base_url=agent_model.base_url or None,
    )

    tool_loader = ToolLoader(agent_models={str(agent_model.id): agent_model})
    tools = tool_loader.load(agent_model.tool_config)

    logger.info(
        "build_agent_from_model: name=%s provider=%s model=%s tools=%d",
        agent_model.name, provider, model_name, len(tools),
    )

    return LlmAgent(
        name=_sanitize_agent_name(agent_model.name),
        model=model,
        instruction=agent_model.system_prompt or "You are a helpful assistant.",
        tools=tools,
        before_model_callback=before_model_callback,
    )


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
        agent: LlmAgent | None = None,
        node: Any = None,
        app_name: str = "agenthub",
        session_service: Optional[BaseSessionService] = None,
    ) -> None:
        self.session_service = session_service or _DEFAULT_SESSION_SERVICE
        self.runner = Runner(
            agent=agent,
            node=node,
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

    async def run_single_turn(
        self,
        user_id: str,
        session_id: str,
        message: str,
    ) -> list:
        await self._ensure_session(user_id=user_id, session_id=session_id)
        events = []
        async for event in self.runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(
                role="user",
                parts=[types.Part.from_text(text=message)],
            ),
        ):
            events.append(event)
        return events

    async def _ensure_session(self, user_id: str, session_id: str) -> None:
        try:
            await self.session_service.create_session(
                app_name=self.runner.app_name,
                user_id=user_id,
                session_id=session_id,
            )
        except Exception:
            # Session may already exist.
            return
