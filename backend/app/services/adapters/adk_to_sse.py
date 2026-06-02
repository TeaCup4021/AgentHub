import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import AsyncGenerator, Dict, Optional

from google.adk.events import Event


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
    ) -> None:
        self.version = version
        self.sequential = sequential
        self.agent_order = agent_order

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

            message_id = getattr(event, "invocation_id", None) or str(uuid.uuid4())

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
        return {
            "version": self.version,
            "event_id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "message_id": message_id,
            "sender": {
                "type": "agent",
                "id": str(author),
                "name": str(author),
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

    # 获取事件中的actions属性，如果没有则设为None
        actions = getattr(event, "actions", None)
    # 检查是否存在artifact_delta
        has_action_artifact = bool(actions and getattr(actions, "artifact_delta", None))
    # 获取事件的custom_metadata属性
        custom_metadata = getattr(event, "custom_metadata", None)
    # 如果custom_metadata是字典类型，则获取其中的artifact值
        custom_artifact = custom_metadata.get("artifact") if isinstance(custom_metadata, dict) else None
    # 检查是否存在自定义工件
        has_custom_artifact = isinstance(custom_artifact, dict) and bool(custom_artifact)
    # 如果既没有动作工件也没有自定义工件，则返回None
        if not has_action_artifact and not has_custom_artifact:
            return None
    # 提取工件数据
        artifact = self._extract_artifact(event)
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
