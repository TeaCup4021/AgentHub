import os
import sys
import asyncio
import time
from dataclasses import dataclass
from typing import AsyncGenerator, Optional

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.adapters.adk_to_sse import ADKToSSETranslator


@dataclass
class FakeUsageMetadata:
    prompt_token_count: int
    candidates_token_count: int


@dataclass
class FakePart:
    text: str


@dataclass
class FakeContent:
    parts: list[FakePart]


@dataclass
class FakeActions:
    artifact_delta: Optional[dict] = None
    transfer_to_agent: Optional[str] = None
    end_of_agent: bool = False


@dataclass
class FakeEvent:
    invocation_id: str
    author: str
    content: Optional[FakeContent]
    partial: bool
    turn_complete: bool
    actions: Optional[FakeActions]
    usage_metadata: Optional[FakeUsageMetadata]
    error_code: Optional[str]
    error_message: Optional[str]
    custom_metadata: Optional[dict]
    timestamp: float
    branch: Optional[str]
    finish_reason: Optional[str]


async def fake_event_stream() -> AsyncGenerator[FakeEvent, None]:
    now = time.time()
    invocation_id = "demo-invocation"
    yield FakeEvent(
        invocation_id=invocation_id,
        author="demo-agent",
        content=None,
        partial=False,
        turn_complete=False,
        actions=FakeActions(transfer_to_agent="demo-agent"),
        usage_metadata=None,
        error_code=None,
        error_message=None,
        custom_metadata=None,
        timestamp=now,
        branch="branch-1",
        finish_reason=None,
    )
    yield FakeEvent(
        invocation_id=invocation_id,
        author="demo-agent",
        content=FakeContent(parts=[FakePart(text="Hello ")]),
        partial=True,
        turn_complete=False,
        actions=None,
        usage_metadata=None,
        error_code=None,
        error_message=None,
        custom_metadata=None,
        timestamp=now,
        branch="branch-1",
        finish_reason=None,
    )
    yield FakeEvent(
        invocation_id=invocation_id,
        author="demo-agent",
        content=FakeContent(parts=[FakePart(text="world!")]),
        partial=True,
        turn_complete=False,
        actions=FakeActions(artifact_delta={"artifactType": "code", "title": "demo.py"}),
        usage_metadata=None,
        error_code=None,
        error_message=None,
        custom_metadata=None,
        timestamp=now,
        branch="branch-1",
        finish_reason=None,
    )
    yield FakeEvent(
        invocation_id=invocation_id,
        author="demo-agent",
        content=None,
        partial=False,
        turn_complete=True,
        actions=FakeActions(end_of_agent=True),
        usage_metadata=FakeUsageMetadata(prompt_token_count=3, candidates_token_count=5),
        error_code=None,
        error_message=None,
        custom_metadata=None,
        timestamp=now,
        branch="branch-1",
        finish_reason="completed",
    )


async def main() -> None:
    translator = ADKToSSETranslator()
    async for payload in translator.translate(
        event_stream=fake_event_stream(),
        conversation_id="demo-conv",
    ):
        print(payload, end="")


if __name__ == "__main__":
    asyncio.run(main())
