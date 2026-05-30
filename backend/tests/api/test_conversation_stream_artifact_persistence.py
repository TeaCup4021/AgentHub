from __future__ import annotations

import json
from uuid import uuid4

import pytest

from app.api.v1 import conversations


@pytest.mark.asyncio
async def test_stream_keeps_sse_when_artifact_persist_fails(monkeypatch):
    conv_id = uuid4()
    user_id = uuid4()

    class _FakeRunner:
        async def stream_single_chat(self, **_kwargs):
            if False:
                yield None

    class _FakeTranslator:
        async def translate(self, **_kwargs):
            yield (
                'event: artifact\n'
                'data: {"event_id":"e1","message_id":"00000000-0000-0000-0000-000000000001",'
                '"artifact":{"id":"a1","artifactType":"code","content":{"x":1}}}\n\n'
            )
            yield 'event: message_end\ndata: {"message_id":"m1"}\n\n'

    async def _boom(*args, **kwargs):
        raise RuntimeError("db down")

    monkeypatch.setattr(conversations, "AgentHubRunner", lambda agent: _FakeRunner())
    monkeypatch.setattr(conversations, "ADKToSSETranslator", lambda: _FakeTranslator())
    monkeypatch.setattr(conversations, "build_single_chat_agent", lambda: object())
    monkeypatch.setattr(conversations, "_persist_artifact_from_sse_payload", _boom)

    items = []
    async for payload in conversations._adk_sse_stream(conv_id, user_id, "hi"):
        items.append(payload)

    assert any("event: artifact" in x for x in items)
    assert any("event: message_end" in x for x in items)


@pytest.mark.asyncio
async def test_stream_persists_artifact_on_success(monkeypatch):
    conv_id = uuid4()
    user_id = uuid4()
    calls: list[tuple] = []

    class _FakeRunner:
        async def stream_single_chat(self, **_kwargs):
            if False:
                yield None

    class _FakeTranslator:
        async def translate(self, **_kwargs):
            payload = {
                "event_id": "e2",
                "message_id": "00000000-0000-0000-0000-000000000001",
                "artifact": {"id": "a1", "artifactType": "code", "content": {"x": 2}},
            }
            yield f"event: artifact\\ndata: {json.dumps(payload)}\\n\\n"
            yield 'event: message_end\\ndata: {"message_id":"m1"}\\n\\n'

    async def _persist(conv_id_arg, payload):
        if payload.startswith("event: artifact"):
            calls.append((conv_id_arg, payload))

    monkeypatch.setattr(conversations, "AgentHubRunner", lambda agent: _FakeRunner())
    monkeypatch.setattr(conversations, "ADKToSSETranslator", lambda: _FakeTranslator())
    monkeypatch.setattr(conversations, "build_single_chat_agent", lambda: object())
    monkeypatch.setattr(conversations, "_persist_artifact_from_sse_payload", _persist)

    items = []
    async for payload in conversations._adk_sse_stream(conv_id, user_id, "hi"):
        items.append(payload)

    assert len(calls) == 1
    assert any("event: artifact" in x for x in items)
