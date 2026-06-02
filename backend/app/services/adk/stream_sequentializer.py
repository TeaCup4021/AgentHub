"""StreamSequentializer: ensures agents emit to SSE one at a time in plan order,
while allowing parallel execution behind the scenes.

Active agent → events pass through in real-time (streaming UX preserved).
Other agents → events are buffered until their turn.
"""

import logging
from typing import AsyncGenerator, Optional

from google.adk.events import Event

logger = logging.getLogger("agenthub.stream_sequentializer")


class StreamSequentializer:
    """Wraps an ADK event stream to guarantee sequential agent output.

    While the ADK Workflow may execute multiple agents in parallel, this
    class ensures the SSE-facing event stream emits one agent at a time,
    in the order specified by the Orchestrator's plan.
    """

    def __init__(self, agent_order: list[str] | None = None):
        """
        Args:
            agent_order: ADK agent names in desired emission order,
                         e.g. ["agent_<uuid1>", "agent_<uuid2>"].
                         If None or empty, all events pass through unchanged.
        """
        self._order = agent_order or []
        self._buffers: dict[str, list[Event]] = {}
        self._complete: set[str] = set()
        self._seen: set[str] = set()
        self._active: Optional[str] = None

    @property
    def active(self) -> Optional[str]:
        """Current active agent (events pass through in real-time)."""
        return self._active

    # ── public API ──────────────────────────────────────────────────────

    async def sequentialize(
        self,
        event_stream: AsyncGenerator[Event, None],
    ) -> AsyncGenerator[Event, None]:
        """Wrap *event_stream* so that agent outputs are yielded one agent
        at a time in plan order."""
        async for event in event_stream:
            if not event:
                continue

            author = getattr(event, "author", None)
            inv_id = author if author else "_global"
            self._seen.add(inv_id)

            # Lazy-init buffer
            if inv_id not in self._buffers:
                self._buffers[inv_id] = []

            # Detect agent completion
            if self._is_terminal_event(event):
                self._complete.add(inv_id)

            # Passthrough when no order is configured
            if not self._order:
                yield event
                continue

            # Set initial active agent (first agent in order that has started)
            if self._active is None:
                self._active = self._pick_next_active()

            if inv_id == self._active:
                # ── Active agent: real-time passthrough ──
                yield event

                if inv_id in self._complete:
                    # Active done → advance to next agent(s), draining
                    # any buffers that are already complete
                    async for e in self._advance_and_drain():
                        yield e

            elif inv_id not in self._order:
                # ── Not in plan order: passthrough immediately ──
                yield event

            else:
                # ── Non-active agent: buffer and wait ──
                self._buffers[inv_id].append(event)

        # End of stream: emit any remaining buffered events in plan order
        for name in self._order:
            buf = self._buffers.get(name, [])
            for event in buf:
                yield event
            buf.clear()

    # ── helpers ─────────────────────────────────────────────────────────

    def _pick_next_active(self) -> Optional[str]:
        """Pick the earliest agent in the plan order that should emit next.

        Priority:
        1. Agent with buffered events (needs replay, may be complete).
        2. Agent seen but not complete (make active for real-time streaming).
        3. First unseen agent (wait for its first event).
        """
        # Priority 1: agent with buffered events to drain
        for name in self._order:
            if name in self._seen and self._buffers.get(name):
                return name
        # Priority 2: agent that started but hasn't finished
        for name in self._order:
            if name in self._seen and name not in self._complete:
                return name
        # Priority 3: first agent that hasn't been seen at all
        for name in self._order:
            if name not in self._seen:
                return name
        return None

    async def _advance_and_drain(self):
        """After the active agent completes, advance to subsequent agents.
        If their buffers already contain events (they finished early),
        replay those events and continue advancing. Stop at an agent
        that is still running (its future events will pass through)."""
        while True:
            self._active = self._pick_next_active()
            if self._active is None:
                break

            buf = self._buffers.get(self._active, [])
            if buf:
                for event in buf:
                    yield event
                buf.clear()

            # If this agent already completed, loop to drain the next one.
            # If it's still running, stop — future events will be passed
            # through by the main loop.
            if self._active not in self._complete:
                break

    @staticmethod
    def _is_terminal_event(event: Event) -> bool:
        """Return True if *event* signals the end of an agent turn."""
        if getattr(event, "turn_complete", False):
            return True
        actions = getattr(event, "actions", None)
        if actions and getattr(actions, "end_of_agent", False):
            return True
        return False
