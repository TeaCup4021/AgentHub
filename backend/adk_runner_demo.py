"""ADK Runner.run_async() lifecycle demo (mock or live)."""

import argparse
import asyncio
import os
from dataclasses import dataclass
from typing import Iterable, Optional


@dataclass
class MockUsage:
    prompt_token_count: int
    candidates_token_count: int


@dataclass
class MockPart:
    text: Optional[str]


@dataclass
class MockContent:
    parts: Iterable[MockPart]


@dataclass
class MockEvent:
    author: str
    partial: bool
    content: Optional[MockContent]
    turn_complete: bool
    usage_metadata: Optional[MockUsage]
    timestamp: float


def _print_event(event, token_index: int) -> int:
    partial = getattr(event, "partial", False)
    content = getattr(event, "content", None)
    turn_complete = getattr(event, "turn_complete", False)
    usage_metadata = getattr(event, "usage_metadata", None)

    if partial and content and getattr(content, "parts", None):
        for part in content.parts:
            text = getattr(part, "text", None)
            if text:
                token_index += 1
                print(f"[token] {token_index}: {text}")

    if turn_complete:
        print("[turn_complete] True")

    if usage_metadata:
        input_tokens = getattr(usage_metadata, "prompt_token_count", 0)
        output_tokens = getattr(usage_metadata, "candidates_token_count", 0)
        print(f"[usage_metadata] input_tokens={input_tokens} output_tokens={output_tokens}")

    return token_index


async def run_mock() -> None:
    print("Running mock lifecycle demo...")
    events = [
        MockEvent(
            author="demo-agent",
            partial=True,
            content=MockContent(parts=[MockPart(text="Hello ")]),
            turn_complete=False,
            usage_metadata=None,
            timestamp=0.0,
        ),
        MockEvent(
            author="demo-agent",
            partial=True,
            content=MockContent(parts=[MockPart(text="world")]),
            turn_complete=False,
            usage_metadata=None,
            timestamp=0.1,
        ),
        MockEvent(
            author="demo-agent",
            partial=False,
            content=MockContent(parts=[MockPart(text=None)]),
            turn_complete=True,
            usage_metadata=MockUsage(prompt_token_count=12, candidates_token_count=8),
            timestamp=0.2,
        ),
    ]

    token_index = 0
    for event in events:
        token_index = _print_event(event, token_index)
        await asyncio.sleep(0)


async def run_live() -> None:
    print("Running live ADK Runner demo...")
    from google.adk import types
    from google.adk.agents import LlmAgent
    from google.adk.agents.run_config import RunConfig, StreamingMode
    from google.adk.artifacts import InMemoryArtifactService
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService

    model_name = os.getenv("ADK_DEMO_MODEL", "gemini-1.5-flash")
    agent = LlmAgent(name="demo-agent", model=model_name)

    runner = Runner(
        agent=agent,
        session_service=InMemorySessionService(),
        artifact_service=InMemoryArtifactService(),
    )

    token_index = 0
    async for event in runner.run_async(
        user_id="demo-user",
        session_id="demo-session",
        new_message=types.Content(
            role="user",
            parts=[types.Part.from_text(text="Say hello in two words.")],
        ),
        run_config=RunConfig(streaming_mode=StreamingMode.SSE),
    ):
        token_index = _print_event(event, token_index)


async def main() -> None:
    parser = argparse.ArgumentParser(description="ADK Runner.run_async() lifecycle demo")
    parser.add_argument(
        "--mode",
        choices=["mock", "live"],
        default="mock",
        help="mock: no external calls; live: run real Runner.run_async()",
    )
    args = parser.parse_args()

    if args.mode == "live":
        await run_live()
    else:
        await run_mock()


if __name__ == "__main__":
    asyncio.run(main())

