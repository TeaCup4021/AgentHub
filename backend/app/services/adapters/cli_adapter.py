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


# Recognized document extensions that the CLI agent may have generated
_CLI_DOC_EXTENSIONS = {".pptx", ".ppt", ".pdf", ".docx", ".doc", ".xlsx", ".xls"}

_DOC_EXT_TO_ARTIFACT_TYPE: dict[str, str] = {
    ".pptx": "pptx", ".ppt": "pptx",
    ".docx": "docx", ".doc": "docx",
    ".xlsx": "xlsx", ".xls": "xlsx",
    ".pdf": "pdf",
}


async def _emit_cli_generated_file_artifacts(
    runner, conv_id: str, message_id: str, accumulated: str,
) -> tuple[list[dict], list[str]]:
    """Scan CLI workspace for generated document files, upload them to MinIO,
    convert PPTX→PDF where applicable, and return (artifacts, sse_events).
    Each SSE event string already includes the artifact payload for the frontend;
    the raw artifacts list is for DB persistence."""
    import os as _os
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    from uuid import uuid4 as _uuid4

    workspace = getattr(runner, "_workspace_dir", None) or "."
    if not _os.path.isdir(workspace):
        return [], []

    from app.services.storage import upload_file as _minio_upload
    from app.services.artifact_detector import _maybe_convert_pptx

    # Look for files with recognised extensions; skip hidden / temp files
    cutoff = _dt.now(_tz.utc) - _td(minutes=10)
    artifacts: list[dict] = []
    sse_events: list[str] = []

    try:
        for entry in _os.scandir(workspace):
            if not entry.is_file():
                continue
            name = entry.name
            if name.startswith(".") or name.startswith("~"):
                continue
            ext = _os.path.splitext(name)[1].lower()
            if ext not in _CLI_DOC_EXTENSIONS:
                continue
            try:
                stat = entry.stat()
                mtime = _dt.fromtimestamp(stat.st_mtime, tz=_tz.utc)
                if mtime < cutoff:
                    continue
            except OSError:
                pass

            file_type = _DOC_EXT_TO_ARTIFACT_TYPE.get(ext, "pdf")
            file_id = str(_uuid4())

            try:
                with open(entry.path, "rb") as f:
                    file_bytes = f.read()
            except OSError:
                logger.exception("CLI artifact: cannot read %s", entry.path)
                continue

            _minio_upload(file_bytes, f"files/{file_id}", "application/octet-stream")
            doc_url = f"/api/v1/files/{file_id}/download"

            final_url, final_type = await _maybe_convert_pptx(doc_url, file_type, name)

            artifact = {
                "artifactType": "document",
                "title": name,
                "content": {
                    "fileName": name,
                    "fileUrl": final_url,
                    "fileType": final_type,
                    "fileSize": len(file_bytes),
                },
                "id": str(_uuid4()),
            }
            artifacts.append(artifact)
            sse_events.append(_format_sse("artifact", {
                "version": "v1",
                "event_id": str(_uuid4()),
                "conversation_id": conv_id,
                "message_id": message_id,
                "artifact": artifact,
                "timestamp": _dt.now(_tz.utc).isoformat(),
            }))
            logger.info(
                "CLI artifact: %s → fileType=%s fileUrl=%s",
                name, final_type, final_url,
            )
    except OSError:
        logger.exception("CLI artifact: workspace scan failed")

    return artifacts, sse_events


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

        # After CLI finishes, scan workspace for generated files (e.g. PPTX)
        # and upload them to MinIO so the artifact detection pipeline can
        # produce DocumentCard / PDF preview cards.
        if not has_error:
            try:
                cli_artifacts, cli_art_sse = await _emit_cli_generated_file_artifacts(
                    runner, str(conv_id), message_id, accumulated,
                )
                for art_sse in cli_art_sse:
                    yield art_sse
                # Persist artifacts to DB so they survive page refresh
                if cli_artifacts:
                    try:
                        from app.core.database import async_session_maker
                        from app.services.artifact import ArtifactService
                        async with async_session_maker() as db:
                            for art in cli_artifacts:
                                await ArtifactService.append_version(
                                    db=db,
                                    conversation_id=conv_id,
                                    message_id=UUID(message_id),
                                    artifact_payload=art,
                                )
                            await db.commit()
                    except Exception:
                        logger.exception("CLI artifact persist failed")
            except Exception:
                logger.exception("CLI file artifact scan failed")

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
            from app.services.adk.cli_runner import claude_code_tool, codex_cli_tool

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

            # Run the appropriate CLI (non-streaming for orchestration).
            # Use the configured timeout from settings; CLI agents doing
            # file creation + server startup may need generous headroom.
            timeout = (
                settings.CLAUDE_CODE_TIMEOUT_SECONDS if provider == "claude-code-cli"
                else settings.CODEX_CLI_TIMEOUT_SECONDS
            )
            base_tool = claude_code_tool if provider == "claude-code-cli" else codex_cli_tool
            result = await base_tool(prompt=full_prompt, timeout=timeout)

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
