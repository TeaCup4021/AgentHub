"""Agent adapter base class and registry.

Each LLM platform (Anthropic, OpenAI/LiteLLM, CLI tools) implements an
AgentAdapter subclass. The AdapterRegistry maps provider strings to adapters,
eliminating if/else branches scattered across the codebase.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator
from uuid import UUID

from google.adk.agents import LlmAgent

from app.models.agent import Agent
from app.services.adk.tool_loader import ToolLoader
from app.services.pin_spec_injector import before_model_callback
from app.services.artifact_format import build_instruction

logger = logging.getLogger("agenthub.adapter")


class AgentAdapter(ABC):
    """Unified interface for building and running agents across platforms."""

    # ------------------------------------------------------------------
    # Abstract — every adapter must implement
    # ------------------------------------------------------------------

    @abstractmethod
    def resolve_model(self, agent: Agent) -> Any:
        """Resolve the DB agent's provider+model into an ADK model object.

        Returns an AnthropicLlm, LiteLlm, or None (for CLI agents that
        don't call a remote LLM).
        """
        ...

    @abstractmethod
    def is_cli(self) -> bool:
        """Return True if this is a local CLI tool, not a remote API."""
        ...

    # ------------------------------------------------------------------
    # Optional overrides
    # ------------------------------------------------------------------

    def build_agent(
        self,
        agent: Agent,
        tool_loader: ToolLoader | None = None,
    ) -> LlmAgent:
        """Build a complete ADK LlmAgent from a DB Agent record.

        Override for CLI adapters that need before_model_callback interception.
        """
        from app.services.adk.runner import _sanitize_agent_name

        tl = tool_loader or ToolLoader(agent_models={str(agent.id): agent})
        tools = tl.load(agent.tool_config)

        logger.info(
            "build_agent: name=%s provider=%s model=%s tools=%d",
            agent.name, agent.provider, agent.model, len(tools),
        )

        return LlmAgent(
            name=_sanitize_agent_name(agent.name),
            model=self.resolve_model(agent),
            instruction=build_instruction(agent),
            tools=tools,
            before_model_callback=before_model_callback,
        )

    async def verify(self, agent: Agent) -> bool:
        """Test connectivity by running a single turn with this agent's config.

        Raises HTTPException(400) on failure.
        """
        from fastapi import HTTPException

        try:
            from google.adk.agents import LlmAgent as AdkLlmAgent
            from google.adk.runners import Runner
            from google.adk.sessions import InMemorySessionService
            from google.genai import types

            resolved = self.resolve_model(agent)
            llm = AdkLlmAgent(
                name="adt_verify",
                model=resolved if resolved is not None else "claude-sonnet-4-6",
                instruction=agent.system_prompt or "Reply with 'ADK OK'",
            )

            session_service = InMemorySessionService()
            runner = Runner(
                agent=llm,
                app_name="agenthub_verify",
                session_service=session_service,
            )

            await session_service.create_session(
                app_name="agenthub_verify",
                user_id="verify_user",
                session_id="verify_session",
            )

            async for event in runner.run_async(
                user_id="verify_user",
                session_id="verify_session",
                new_message=types.Content(
                    role="user",
                    parts=[types.Part.from_text(text="Hi")],
                ),
            ):
                if event.author != "user":
                    return True
            return True
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Model verification failed: {str(e)}",
            )

    async def stream(
        self,
        agent: Agent,
        conv_id: UUID,
        user_id: UUID,
        prompt: str,
    ) -> AsyncGenerator[str, None]:
        """Execute a single-chat conversation and yield SSE events.

        The default implementation builds an ADK LlmAgent and streams via
        the ADK Runner + SSE translator. CLI adapters override this to
        stream from a local subprocess instead.
        """
        from app.services.adk.runner import AgentHubRunner, build_agent_from_model
        from app.services.adapters.adk_to_sse import ADKToSSETranslator
        from datetime import datetime, timezone
        import json
        from uuid import uuid4

        def _format_sse(event_name: str, data: dict) -> str:
            return f"event: {event_name}\ndata: {json.dumps(data)}\n\n"

        prompt_text = (prompt or "Hello from AgentHub").strip()
        logger.info(
            "adapter.stream: conv=%s agent=%s provider=%s model=%s prompt=%.80s...",
            conv_id, agent.name, agent.provider, agent.model, prompt_text,
        )

        adk_agent = build_agent_from_model(agent)
        runner = AgentHubRunner(agent=adk_agent)
        translator = ADKToSSETranslator(
            agent_name_map={
                adk_agent.name: {
                    "id": str(agent.id),
                    "name": agent.name,
                }
            }
        )

        event_stream = runner.stream_single_chat(
            user_id=str(user_id),
            session_id=str(conv_id),
            message=prompt_text,
        )
        async for payload in translator.translate(
            event_stream=event_stream,
            conversation_id=str(conv_id),
        ):
            yield payload


class AdapterRegistry:
    """Global registry mapping provider strings to AgentAdapter instances."""

    _adapters: dict[str, AgentAdapter] = {}

    @classmethod
    def register(cls, provider: str, adapter: AgentAdapter) -> None:
        """Register an adapter for one or more provider names."""
        cls._adapters[provider.lower().strip()] = adapter
        logger.info("AdapterRegistry: registered %s -> %s", provider, type(adapter).__name__)

    @classmethod
    def get(cls, provider: str) -> AgentAdapter:
        """Look up an adapter by provider string.

        Raises ValueError if no adapter is registered for this provider.
        """
        key = (provider or "").lower().strip()
        adapter = cls._adapters.get(key)
        if adapter is None:
            raise ValueError(
                f"No adapter registered for provider '{provider}'. "
                f"Registered providers: {list(cls._adapters.keys())}"
            )
        return adapter

    @classmethod
    def get_for_agent(cls, agent: Agent) -> AgentAdapter:
        """Convenience: get the adapter for an agent's provider."""
        return cls.get(agent.provider)
