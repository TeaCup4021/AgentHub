import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import AsyncGenerator, Dict, Optional

from google.adk.events import Event


# Fixed namespace so a given (invocation_id, author) always maps to the SAME
# message UUID across the translator, the accumulator persistence layer, and
# the subtask-metrics linker. This is the key to splitting a multi-agent ADK
# Workflow (which runs every agent under ONE invocation_id) into one SSE
# message per agent: we identify a message by (invocation_id, author/agent),
# not by invocation_id alone.
MESSAGE_ID_NAMESPACE = uuid.UUID("a7f3c2d1-0b4e-4c6a-9f2d-8e1b5a3c7d90")


def agent_message_id(invocation_id: str, author: str) -> str:
    """Deterministic message UUID for one agent's turn within an invocation."""
    return str(uuid.uuid5(MESSAGE_ID_NAMESPACE, f"{invocation_id}|{author}"))


@dataclass
class _TranslationState:
    seen_invocations: set = field(default_factory=set)
    ended_invocations: set = field(default_factory=set)
    token_index_by_invocation: Dict[str, int] = field(default_factory=dict)


class ADKToSSETranslator:
    def __init__(
        self,
        version: str = "v1",
        sequential: bool = False,
        agent_order: list[str] | None = None,
        agent_name_map: dict[str, dict] | None = None,
    ) -> None:
        self.version = version
        self.sequential = sequential
        self.agent_order = agent_order
        # Maps an ADK author/node name (e.g. "agent_<uuid>") to the real
        # agent identity {"id": ..., "name": ...} for SSE sender display.
        self.agent_name_map = agent_name_map or {}

    async def translate(
        self,
        event_stream: AsyncGenerator[Event, None],
        conversation_id: str,
    ) -> AsyncGenerator[str, None]:
        # Group-chat mode: inject sequentializer so agent outputs are
        # emitted one at a time in plan order, even when ADK runs them
        # in parallel.
        if self.sequential:
            from app.services.adk.stream_sequentializer import StreamSequentializer
            sequentializer = StreamSequentializer(agent_order=self.agent_order)
            event_stream = sequentializer.sequentialize(event_stream)

        state = _TranslationState()
        async for event in event_stream:
            if not event:
                continue

            inv_id = getattr(event, "invocation_id", None)
            author = getattr(event, "author", None)

            # In DAG mode (agent_name_map populated) the workflow itself emits
            # events under its own name (e.g. "orchestrator_plan"), which is NOT
            # an agent. Skip any author that isn't a known agent node so it
            # doesn't get turned into a spurious extra message and fragment the
            # per-agent stream. Single-chat/Coordinator leave the map empty and
            # are unaffected.
            if (
                self.agent_name_map
                and author and author != "user"
                and str(author) not in self.agent_name_map
            ):
                continue

            # Identify the message by (invocation, author). An ADK Workflow runs
            # every sub-agent under ONE invocation_id, so keying on invocation
            # alone would collapse all agents into a single message. Keying on
            # author splits them into one message per agent.
            if inv_id and author and author != "user":
                message_id = agent_message_id(inv_id, str(author))
            elif inv_id:
                message_id = inv_id[2:] if inv_id.startswith("e-") else inv_id
            else:
                message_id = str(uuid.uuid4())

            message_start = self._to_message_start(event, conversation_id, message_id, state)
            if message_start:
                yield self._format_sse("message_start", message_start)

            async for token_payload in self._to_token(event, conversation_id, message_id, state):
                yield self._format_sse("token", token_payload)

            artifact_payload = self._to_artifact(event, conversation_id, message_id)
            if artifact_payload:
                yield self._format_sse("artifact", artifact_payload)

            async for status_payload in self._to_agent_status(event, conversation_id, message_id):
                yield self._format_sse("agent_status", status_payload)

            message_end = self._to_message_end(event, conversation_id, message_id, state)
            if message_end:
                yield self._format_sse("message_end", message_end)

            error_payload = self._to_error(event, conversation_id, message_id)
            if error_payload:
                yield self._format_sse("error", error_payload)

        # Fallback: emit message_end for any started invocation that didn't receive one
        for mid in state.seen_invocations:
            if mid not in state.ended_invocations:
                yield self._format_sse("message_end", {
                    "version": self.version,
                    "event_id": str(uuid.uuid4()),
                    "conversation_id": conversation_id,
                    "message_id": mid,
                    "finish_reason": "completed",
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

    def _to_message_start(
        self,
        event: Event,
        conversation_id: str,
        message_id: str,
        state: _TranslationState,
    ) -> Optional[dict]:
        author = getattr(event, "author", None)
        if not author or author == "user":
            return None
        if message_id in state.seen_invocations:
            return None
        state.seen_invocations.add(message_id)
        mapped = self.agent_name_map.get(str(author))
        sender_id = mapped.get("id") if mapped else str(author)
        sender_name = mapped.get("name") if mapped else str(author)
        return {
            "version": self.version,
            "event_id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "message_id": message_id,
            "sender": {
                "type": "agent",
                "id": str(sender_id),
                "name": str(sender_name),
            },
            "timestamp": self._format_timestamp(getattr(event, "timestamp", None)),
        }

    async def _to_token(
        self,
        event: Event,
        conversation_id: str,
        message_id: str,
        state: _TranslationState,
    ) -> AsyncGenerator[dict, None]:
        content = getattr(event, "content", None)
        parts = getattr(content, "parts", None) if content else None
        if not parts:
            return

        # Skip non-partial (complete) text if we already streamed partial tokens
        if not getattr(event, "partial", False):
            if message_id in state.token_index_by_invocation:
                return
            for part in parts:
                text = getattr(part, "text", None)
                if not text or getattr(part, "thought", False):
                    continue
                state.token_index_by_invocation.setdefault(message_id, 0)
                state.token_index_by_invocation[message_id] += 1
                yield {
                    "version": self.version,
                    "event_id": str(uuid.uuid4()),
                    "conversation_id": conversation_id,
                    "message_id": message_id,
                    "delta": text,
                    "index": state.token_index_by_invocation[message_id],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            return

        for part in parts:
            text = getattr(part, "text", None)
            if not text or getattr(part, "thought", False):
                continue
            state.token_index_by_invocation.setdefault(message_id, 0)
            state.token_index_by_invocation[message_id] += 1
            yield {
                "version": self.version,
                "event_id": str(uuid.uuid4()),
                "conversation_id": conversation_id,
                "message_id": message_id,
                "delta": text,
                "index": state.token_index_by_invocation[message_id],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    def _to_artifact(self, event: Event, conversation_id: str, message_id: str) -> Optional[dict]:

        artifact = self._extract_artifact(event)
        if not artifact:
            artifact = self._extract_tool_download_artifact(event)
    # 如果提取的工件为空，则返回None
        if not artifact:
            return None
    # 规范化字段名
        artifact = self._normalize_artifact_fields(artifact)
    # 返回格式化后的工件字典
        return {
            "version": self.version,  # 工件版本
            "event_id": str(uuid.uuid4()),  # 唯一事件ID
            "conversation_id": conversation_id,  # 对话ID
            "message_id": message_id,  # 消息ID
            "artifact": artifact,  # 工件数据
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def _to_agent_status(
        self,
        event: Event,
        conversation_id: str,
        message_id: str,
    ) -> AsyncGenerator[dict, None]:
        actions = getattr(event, "actions", None)
        if not actions:
            return

        transfer_agent = getattr(actions, "transfer_to_agent", None)
        if transfer_agent:
            yield {
                "version": self.version,
                "event_id": str(uuid.uuid4()),
                "conversation_id": conversation_id,
                "message_id": message_id,
                "subtask_id": getattr(event, "branch", None) or "",
                "agent": {
                    "id": str(transfer_agent),
                    "name": str(transfer_agent),
                },
                "status": "queued",
                "progress": 0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        if getattr(actions, "end_of_agent", False):
            author = getattr(event, "author", None) or transfer_agent or "agent"
            yield {
                "version": self.version,
                "event_id": str(uuid.uuid4()),
                "conversation_id": conversation_id,
                "message_id": message_id,
                "subtask_id": getattr(event, "branch", None) or "",
                "agent": {
                    "id": str(author),
                    "name": str(author),
                },
                "status": "success",
                "progress": 100,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    def _to_message_end(
        self,
        event: Event,
        conversation_id: str,
        message_id: str,
        state: _TranslationState,
    ) -> Optional[dict]:
        if message_id in state.ended_invocations:
            return None

        actions = getattr(event, "actions", None)
        turn_complete = getattr(event, "turn_complete", False)
        end_of_agent = getattr(actions, "end_of_agent", False) if actions else False
        if not turn_complete and not end_of_agent:
            return None

        state.ended_invocations.add(message_id)
        finish_reason = getattr(event, "finish_reason", None)
        return {
            "version": self.version,
            "event_id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "message_id": message_id,
            "finish_reason": str(finish_reason) if finish_reason else "completed",
            "usage": self._extract_usage(event),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _to_error(self, event: Event, conversation_id: str, message_id: str) -> Optional[dict]:
        error_code = getattr(event, "error_code", None)
        error_message = getattr(event, "error_message", None)
        if not error_code and not error_message:
            return None
        return {
            "version": self.version,
            "event_id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "message_id": message_id,
            "code": error_code or "UNKNOWN",
            "message": error_message or "Unknown error",
            "retryable": False,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _format_sse(self, event_name: str, data: dict) -> str:
        return f"event: {event_name}\ndata: {json.dumps(data)}\n\n"

    def _extract_artifact(self, event: Event) -> dict:
        custom_metadata = getattr(event, "custom_metadata", None) or {}
        artifact = custom_metadata.get("artifact") if isinstance(custom_metadata, dict) else None
        if isinstance(artifact, dict) and artifact:
            return artifact

        actions = getattr(event, "actions", None)
        artifact_delta = getattr(actions, "artifact_delta", None) if actions else None
        return artifact_delta if isinstance(artifact_delta, dict) else {}

    def _extract_tool_download_artifact(self, event: Event) -> dict:
        try:
            function_responses = event.get_function_responses()
        except Exception:
            function_responses = []

        if not function_responses:
            return {}

        from app.services.artifact_detector import extract_download_artifacts_from_tool_response

        for function_response in function_responses:
            artifacts = extract_download_artifacts_from_tool_response(
                getattr(function_response, "response", None)
            )
            if artifacts:
                return artifacts[0]
        return {}

    @staticmethod
    def _normalize_artifact_fields(artifact: dict) -> dict:
        normalized = dict(artifact)
        if "type" in normalized and "artifactType" not in normalized:
            normalized["artifactType"] = normalized.pop("type")
        if "artifact_type" in normalized and "artifactType" not in normalized:
            normalized["artifactType"] = normalized.pop("artifact_type")
        return normalized

    def _extract_usage(self, event: Event) -> dict:
        usage = getattr(event, "usage_metadata", None)
        if not usage:
            return {"input_tokens": 0, "output_tokens": 0}
        return {
            "input_tokens": getattr(usage, "prompt_token_count", 0) or 0,
            "output_tokens": getattr(usage, "candidates_token_count", 0) or 0,
        }

    def _format_timestamp(self, timestamp: Optional[float]) -> str:
        if timestamp is None:
            return datetime.now(timezone.utc).isoformat()
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
