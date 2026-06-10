"""Smoke test for StreamSequentializer — verifies that agent events are
emitted sequentially in plan order even when they arrive interleaved.

Run from the backend directory:
    .venv/Scripts/python tests/test_stream_sequentializer.py
"""

import asyncio
from dataclasses import dataclass, field
from typing import AsyncGenerator, Optional


# ── Minimal ADK Event stub ────────────────────────────────────────────
# We don't import google.adk.events here so the test is self-contained.

@dataclass
class StubActions:
    end_of_agent: bool = False
    transfer_to_agent: Optional[str] = None
    artifact_delta: Optional[dict] = None


@dataclass
class StubEvent:
    author: str
    invocation_id: str = ""
    content: str = ""
    turn_complete: bool = False
    actions: Optional[StubActions] = None
    partial: bool = True

    def __post_init__(self):
        if not self.invocation_id:
            self.invocation_id = self.author


# ── Import the real sequentializer ────────────────────────────────────

from app.services.adk.stream_sequentializer import StreamSequentializer


# ── Test helpers ──────────────────────────────────────────────────────

async def collect(
    seq: StreamSequentializer,
    events: list[StubEvent],
) -> list[StubEvent]:
    """Feed *events* through the sequentializer and return output order."""
    async def event_stream():
        for e in events:
            yield e

    output: list[StubEvent] = []
    async for e in seq.sequentialize(event_stream()):
        output.append(e)
    return output


def event(author: str, content: str, turn_complete: bool = False) -> StubEvent:
    """Shorthand for a content-bearing event."""
    return StubEvent(author=author, content=content, turn_complete=turn_complete)


def end(author: str) -> StubEvent:
    """Shorthand for an end-of-agent event."""
    return StubEvent(
        author=author,
        content="",
        turn_complete=True,
        actions=StubActions(end_of_agent=True),
    )


# ── Tests ─────────────────────────────────────────────────────────────

async def test_passthrough_without_order():
    """Without agent_order, all events pass through unchanged."""
    events = [
        event("A", "a1"),
        event("B", "b1"),
        event("A", "a2"),
        end("A"),
        event("B", "b2"),
        end("B"),
    ]
    seq = StreamSequentializer(agent_order=None)
    out = await collect(seq, events)
    authors = [e.author for e in out]
    assert authors == ["A", "B", "A", "A", "B", "B"], f"Unexpected: {authors}"
    print("  [PASS] test_passthrough_without_order")


async def test_sequential_in_order():
    """Events arriving in plan order pass through in real-time."""
    events = [
        event("A", "a1"),
        event("A", "a2"),
        end("A"),
        event("B", "b1"),
        end("B"),
        event("C", "c1"),
        end("C"),
    ]
    seq = StreamSequentializer(agent_order=["A", "B", "C"])
    out = await collect(seq, events)
    authors = [e.author for e in out]
    assert authors == ["A", "A", "A", "B", "B", "C", "C"], f"Unexpected: {authors}"
    print("  [PASS] test_sequential_in_order")


async def test_interleaved_reordered():
    """Interleaved events are de-interleaved and emitted in plan order."""
    events = [
        event("A", "a1"),   # Active A → through
        event("B", "b1"),   # Non-active B → buffer
        event("A", "a2"),   # Active A → through
        event("C", "c1"),   # Non-active C → buffer
        end("A"),           # A done → advance
        # B's buffer should drain here (b1)
        event("B", "b2"),   # B now active → through
        event("C", "c2"),   # C → buffer (B still active)
        end("B"),           # B done → advance, drain C buffer (c1)
        event("C", "c3"),   # C now active → through
        end("C"),
    ]
    seq = StreamSequentializer(agent_order=["A", "B", "C"])
    out = await collect(seq, events)

    contents = [(e.author, e.content) for e in out]
    expected = [
        ("A", "a1"), ("A", "a2"), ("A", ""),     # A: real-time
        ("B", "b1"), ("B", "b2"), ("B", ""),     # B: b1 from buffer, b2 real-time
        ("C", "c1"), ("C", "c2"), ("C", "c3"), ("C", ""),  # C: c1 from buffer, rest real-time
    ]
    assert contents == expected, f"Mismatch:\n  got {contents}\n  exp {expected}"
    print("  [PASS] test_interleaved_reordered")


async def test_early_finisher():
    """Agent B finishes while A is still active → B's buffer replayed after A."""
    events = [
        event("A", "a1"),
        event("B", "b1"),
        event("B", "b2"),
        end("B"),           # B finishes early
        event("A", "a2"),
        event("A", "a3"),
        end("A"),           # A finishes → B replayed, then C
        event("C", "c1"),
        end("C"),
    ]
    seq = StreamSequentializer(agent_order=["A", "B", "C"])
    out = await collect(seq, events)

    contents = [(e.author, e.content) for e in out]
    expected = [
        ("A", "a1"), ("A", "a2"), ("A", "a3"), ("A", ""),     # A real-time
        ("B", "b1"), ("B", "b2"), ("B", ""),                   # B from buffer
        ("C", "c1"), ("C", ""),                                # C real-time
    ]
    assert contents == expected, f"Mismatch:\n  got {contents}\n  exp {expected}"
    print("  [PASS] test_early_finisher")


async def test_unknown_author_passthrough():
    """Events from authors not in agent_order pass through immediately."""
    events = [
        event("A", "a1"),
        event("orchestrator", "summary"),
        end("A"),
        event("B", "b1"),
        end("B"),
    ]
    seq = StreamSequentializer(agent_order=["A", "B"])
    out = await collect(seq, events)

    contents = [(e.author, e.content) for e in out]
    # orchestrator should pass through immediately (not in order)
    expected = [
        ("A", "a1"), ("orchestrator", "summary"), ("A", ""),
        ("B", "b1"), ("B", ""),
    ]
    assert contents == expected, f"Mismatch:\n  got {contents}\n  exp {expected}"
    print("  [PASS] test_unknown_author_passthrough")


# ── Main ──────────────────────────────────────────────────────────────

async def main():
    print("StreamSequentializer tests:")
    await test_passthrough_without_order()
    await test_sequential_in_order()
    await test_interleaved_reordered()
    await test_early_finisher()
    await test_unknown_author_passthrough()
    print("\n[PASS] All tests passed!")


if __name__ == "__main__":
    asyncio.run(main())
