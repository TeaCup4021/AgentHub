from __future__ import annotations

import json
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.v1 import conversations
from app.services.adk import runner as runner_module


@pytest.mark.asyncio
async def test_stream_keeps_sse_when_artifact_persist_fails(monkeypatch):
    conv_id = uuid4()
    user_id = uuid4()
    message_id = "00000000-0000-0000-0000-000000000001"

    class _FakeRunner:
        async def stream_single_chat(self, **_kwargs):
            if False:
                yield None

    class _FakeTranslator:
        async def translate(self, **_kwargs):
            yield (
                "event: message_start\n"
                f'data: {{"message_id":"{message_id}","sender":{{"id":"{agent_id}","name":"Agent"}}}}\n\n'
            )
            yield (
                'event: artifact\n'
                f'data: {{"event_id":"e1","message_id":"{message_id}",'
                '"artifact":{"id":"a1","artifactType":"code","content":{"x":1}}}\n\n'
            )
            yield f'event: token\ndata: {{"message_id":"{message_id}","delta":"done"}}\n\n'
            yield f'event: message_end\ndata: {{"message_id":"{message_id}"}}\n\n'

    async def _persist_message(**kwargs):
        return SimpleNamespace(id=kwargs["message_id"])

    async def _boom(*args, **kwargs):
        raise RuntimeError("db down")

    monkeypatch.setattr(conversations, "AgentHubRunner", lambda agent: _FakeRunner())
    monkeypatch.setattr(conversations, "ADKToSSETranslator", lambda **_kwargs: _FakeTranslator())
    monkeypatch.setattr(
        runner_module,
        "build_agent_from_model",
        lambda agent_model: SimpleNamespace(name="Agent"),
    )
    monkeypatch.setattr(conversations.MessageService, "persist_stream_message", _persist_message)
    monkeypatch.setattr(conversations, "_persist_artifact_event", _boom)

    items = []
    agent_id = uuid4()
    agent_model = SimpleNamespace(id=agent_id, name="Agent", provider="litellm", model="fake-model")
    async for payload in conversations._adk_sse_stream(conv_id, user_id, "hi", agent_model):
        items.append(payload)

    assert any("event: artifact" in x for x in items)
    assert any("event: message_end" in x for x in items)


@pytest.mark.asyncio
async def test_stream_persists_artifact_on_success(monkeypatch):
    conv_id = uuid4()
    user_id = uuid4()
    message_id = "00000000-0000-0000-0000-000000000001"
    calls: list[dict] = []
    persist_calls: list[dict] = []

    class _FakeRunner:
        async def stream_single_chat(self, **_kwargs):
            if False:
                yield None

    class _FakeTranslator:
        async def translate(self, **_kwargs):
            yield (
                "event: message_start\n"
                f'data: {{"message_id":"{message_id}","sender":{{"id":"{agent_id}","name":"Agent"}}}}\n\n'
            )
            payload = {
                "event_id": "e2",
                "message_id": message_id,
                "artifact": {"id": "a1", "artifactType": "code", "content": {"x": 2}},
            }
            yield f"event: artifact\ndata: {json.dumps(payload)}\n\n"
            yield f'event: token\ndata: {{"message_id":"{message_id}","delta":"done"}}\n\n'
            yield f'event: message_end\ndata: {{"message_id":"{message_id}"}}\n\n'

    async def _persist_message(**kwargs):
        persist_calls.append(kwargs)
        return SimpleNamespace(id=kwargs["message_id"])

    async def _persist_artifact(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(conversations, "AgentHubRunner", lambda agent: _FakeRunner())
    monkeypatch.setattr(conversations, "ADKToSSETranslator", lambda **_kwargs: _FakeTranslator())
    monkeypatch.setattr(
        runner_module,
        "build_agent_from_model",
        lambda agent_model: SimpleNamespace(name="Agent"),
    )
    monkeypatch.setattr(conversations.MessageService, "persist_stream_message", _persist_message)
    monkeypatch.setattr(conversations, "_persist_artifact_event", _persist_artifact)

    items = []
    agent_id = uuid4()
    agent_model = SimpleNamespace(id=agent_id, name="Agent", provider="litellm", model="fake-model")
    async for payload in conversations._adk_sse_stream(conv_id, user_id, "hi", agent_model):
        items.append(payload)

    assert len(calls) == 1
    assert calls[0]["conv_id"] == conv_id
    assert calls[0]["message_id"] == message_id
    assert calls[0]["artifact"]["id"] == "a1"
    assert calls[0]["event_id"] == "e2"
    assert persist_calls[0]["sender_id"] == str(agent_id)
    assert persist_calls[0]["sender_name"] == "Agent"
    assert any("event: artifact" in x for x in items)


@pytest.mark.asyncio
async def test_stream_maps_sanitized_adk_author_to_real_agent_identity(monkeypatch):
    conv_id = uuid4()
    user_id = uuid4()
    agent_id = uuid4()
    captured_kwargs: dict = {}

    class _FakeRunner:
        async def stream_single_chat(self, **_kwargs):
            if False:
                yield None

    class _FakeTranslator:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

        async def translate(self, **_kwargs):
            if False:
                yield ""

    monkeypatch.setattr(conversations, "AgentHubRunner", lambda agent: _FakeRunner())
    monkeypatch.setattr(conversations, "ADKToSSETranslator", _FakeTranslator)
    monkeypatch.setattr(
        runner_module,
        "build_agent_from_model",
        lambda agent_model: SimpleNamespace(name="______"),
    )

    agent_model = SimpleNamespace(
        id=agent_id,
        name="\u540e\u7aef\u5f00\u53d1\u52a9\u624b",
        provider="litellm",
        model="deepseek-v4-pro",
    )
    items = []
    async for payload in conversations._adk_sse_stream(conv_id, user_id, "\u4f60\u662f\u8c01\uff1f", agent_model):
        items.append(payload)

    assert items == []
    assert captured_kwargs["agent_name_map"] == {
        "______": {
            "id": str(agent_id),
            "name": "\u540e\u7aef\u5f00\u53d1\u52a9\u624b",
        }
    }
