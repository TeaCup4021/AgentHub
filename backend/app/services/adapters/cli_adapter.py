"""CLI adapter — runs local CLI tools (Claude Code, Codex) as agents.

CLI agents don't call remote LLM APIs. Instead they spawn local subprocesses
and stream the output as SSE events. In orchestration mode, a
before_model_callback intercepts the LLM call and redirects to the CLI.

Consolidates logic previously scattered across:
- conversations.py:_cli_sse_stream (streaming)
- coordinator_builder.py:_build_cli_sub_agent (orchestration)
- conversations.py: provider label / timeout / runner selection
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, AsyncGenerator
from uuid import UUID, uuid4

from google.adk.agents import LlmAgent
from google.adk.models.llm_response import LlmResponse
from google.genai import types

from app.core.config import settings
from app.models.agent import Agent
from app.services.adapters.base import AgentAdapter, AdapterRegistry
from app.services.adk.cli_runner import (
    CliEvent,
    ClaudeCodeRunner,
    CodexCliRunner,
    get_claude_runner,
    get_codex_runner,
)

logger = logging.getLogger("agenthub.adapter.cli")

# Regex matching ADK template variables like {identifier}
import re
_ADK_TEMPLATE_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\??\}")


def _sanitize_for_adk(text: str) -> str:
    if not text:
        return text
    return _ADK_TEMPLATE_RE.sub(r"(\1)", text)


def _format_sse(event_name: str, data: dict) -> str:
    return f"event: {event_name}\ndata: {json.dumps(data)}\n\n"


class CliAdapter(AgentAdapter):
    """Adapter for CLI-based coding agents (Claude Code, Codex)."""

    def resolve_model(self, agent: Agent) -> Any:
        # CLI agents don't use a remote model — the CLI manages its own.
        return None

    def is_cli(self) -> bool:
        return True

    # ------------------------------------------------------------------
    # Single-chat streaming (overrides base class)
    # ------------------------------------------------------------------

    async def stream(
        self,
        agent: Agent,
        conv_id: UUID,
        user_id: UUID,
        prompt: str,
    ) -> AsyncGenerator[str, None]:
        """Stream CLI output as SSE events.

        Formerly _cli_sse_stream() in conversations.py (lines 182-257).
        """
        provider = (agent.provider or "").lower()
        runner = get_claude_runner() if provider == "claude-code-cli" else get_codex_runner()
        provider_label = "Claude Code" if provider == "claude-code-cli" else "Codex CLI"
        timeout = (
            settings.CLAUDE_CODE_TIMEOUT_SECONDS if provider == "claude-code-cli"
            else settings.CODEX_CLI_TIMEOUT_SECONDS
        )
        prompt_text = (prompt or "Hello").strip()
        message_id = str(uuid4())

        has_error = False
        accumulated = ""
        token_index = 0

        logger.info(
            "CLI stream start: conv=%s provider=%s prompt=%.50s",
            conv_id, provider, prompt_text,
        )

        yield _format_sse("message_start", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": message_id,
            "sender": {"type": "agent", "id": provider, "name": provider_label},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        try:
            async for event in runner.run_stream(prompt=prompt_text, timeout=timeout):
                if event.event_type == "text":
                    accumulated += event.content
                    token_index += 1
                    yield _format_sse("token", {
                        "version": "v1", "event_id": str(uuid4()),
                        "conversation_id": str(conv_id), "message_id": message_id,
                        "delta": event.content, "index": token_index,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                elif event.event_type == "error":
                    has_error = True
                    yield _format_sse("error", {
                        "version": "v1", "event_id": str(uuid4()),
                        "conversation_id": str(conv_id), "message_id": message_id,
                        "code": "CLI_ERROR", "message": event.content,
                        "retryable": True,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
        except Exception as e:
            has_error = True
            logger.exception("CLI stream failed for conv=%s", conv_id)
            yield _format_sse("error", {
                "version": "v1", "event_id": str(uuid4()),
                "conversation_id": str(conv_id), "message_id": message_id,
                "code": "CLI_EXECUTION_ERROR", "message": str(e),
                "retryable": True,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        # Persist the accumulated message
        try:
            from app.core.database import async_session_maker
            from app.services.message import MessageService
            async with async_session_maker() as db:
                await MessageService.persist_stream_message(
                    db=db, conv_id=conv_id, message_id=message_id,
                    sender_name=provider_label,
                    content=accumulated,
                    status="failed" if has_error else "done",
                )
                await db.commit()
        except Exception:
            logger.exception("Persist CLI stream message failed")

        yield _format_sse("message_end", {
            "version": "v1", "event_id": str(uuid4()),
            "conversation_id": str(conv_id), "message_id": message_id,
            "finish_reason": "error" if has_error else "completed",
            "usage": {"input_tokens": 0, "output_tokens": len(accumulated)},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    # ------------------------------------------------------------------
    # Orchestration sub-agent (overrides base class)
    # ------------------------------------------------------------------

    def build_agent(
        self,
        agent: Agent,
        tool_loader=None,
    ) -> LlmAgent:
        """Build a sub-agent for orchestration mode.

        Uses before_model_callback to intercept the LLM call and run the
        CLI process instead. The coordinator dispatches to this agent via
        request_task_<name> just like any other sub-agent.

        Formerly _build_cli_sub_agent() in coordinator_builder.py (lines 110-187).
        """
        provider = (agent.provider or "").lower()

        async def cli_before_model_callback(
            callback_context, llm_request
        ) -> LlmResponse | None:
            from app.services.adk.cli_tools import claude_code_tool, codex_cli_tool

            # Extract user prompt from the LLM request
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
            from app.services.artifact_format import build_instruction
            base_instruction = build_instruction(agent)
            full_prompt = base_instruction + "\n\nTask:\n" + user_prompt

            # Run the appropriate CLI (non-streaming for orchestration)
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

        # Build description with capability tags for Coordinator matching
        capabilities = agent.capabilities or []
        cap_tags = (
            ", ".join(capabilities) if isinstance(capabilities, list)
            else str(capabilities)
        )
        description = (
            agent.system_prompt.strip()[:200] if agent.system_prompt
            else f"{agent.name} - local CLI coding agent"
        )
        if cap_tags:
            description = f"[{cap_tags}] {description}"

        return LlmAgent(
            name=agent.name.replace(" ", "_").replace("-", "_"),
            description=description,
            instruction=agent.system_prompt or "You are a helpful coding agent.",
            before_model_callback=cli_before_model_callback,
            mode="task",
        )


# Register CLI providers.
AdapterRegistry.register("claude-code-cli", CliAdapter())
AdapterRegistry.register("codex-cli", CliAdapter())
