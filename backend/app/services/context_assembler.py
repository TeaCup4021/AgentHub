from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message
from app.models.message_pin import MessagePin
from app.services.spec_manager import get_spec_manager

logger = logging.getLogger("agenthub.context_assembler")

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class ContextMessage:
    role: str  # "user" | "agent" | "orchestrator" | "system"
    content: str
    pinned: bool = False
    message_id: str = ""


@dataclass
class ContextMeta:
    total_tokens: int = 0
    layer1_tokens: int = 0  # system_prompt
    layer2_tokens: int = 0  # specs
    layer3_tokens: int = 0  # pinned
    layer4_tokens: int = 0  # history
    truncated_count: int = 0


@dataclass
class AssembledContext:
    system_instruction: str = ""
    messages: list[ContextMessage] = field(default_factory=list)
    meta: ContextMeta = field(default_factory=ContextMeta)


# ---------------------------------------------------------------------------
# Token budget manager
# ---------------------------------------------------------------------------

_DEFAULT_TOKEN_BUDGET = int(os.getenv("AGENTHUB_TOKEN_BUDGET", "128000"))
_DEFAULT_HISTORY_LIMIT = int(os.getenv("AGENTHUB_HISTORY_LIMIT", "50"))


class TokenBudgetManager:
    """Count tokens and truncate messages to fit within a total budget.

    Budget split:
    - System (agent prompt + specs + pins):   up to 25%
    - History (recent messages):              up to 70%
    - Reserve (current message + output):      5%

    Truncation priority (lowest evicted first):
    1. Oldest non-pinned history messages
    2. Non-pinned messages are evicted before pinned ones
    """

    def __init__(self, total: int = _DEFAULT_TOKEN_BUDGET) -> None:
        self.total = total
        self.system_budget = int(total * 0.25)
        self.history_budget = int(total * 0.70)

    def truncate(
        self,
        system: str,
        history: list[ContextMessage],
    ) -> AssembledContext:
        system_tokens = self._count(system)
        system_text = system
        if system_tokens > self.system_budget:
            system_text = self._trim_text(system, self.system_budget)
            system_tokens = self.system_budget

        pinned = [m for m in history if m.pinned]
        normal = [m for m in history if not m.pinned]

        available = self.history_budget
        kept: list[ContextMessage] = []
        truncated = 0

        # Pinned messages always kept first
        for m in pinned:
            t = self._count(m.content)
            if available - t >= 0:
                kept.append(m)
                available -= t
            else:
                truncated += 1

        # Normal messages: newest first (iterate reversed)
        normal_newest_first: list[ContextMessage] = []
        for m in reversed(normal):
            t = self._count(m.content)
            if available - t >= 0:
                normal_newest_first.append(m)
                available -= t
            else:
                truncated += 1

        kept.extend(reversed(normal_newest_first))

        history_tokens = sum(self._count(m.content) for m in kept)

        return AssembledContext(
            system_instruction=system_text,
            messages=kept,
            meta=ContextMeta(
                total_tokens=system_tokens + history_tokens,
                layer1_tokens=0,
                layer2_tokens=0,
                layer3_tokens=sum(self._count(m.content) for m in pinned),
                layer4_tokens=history_tokens,
                truncated_count=truncated,
            ),
        )

    @staticmethod
    def _count(text: str) -> int:
        """Conservative token estimate: ~3 chars per token (works for CJK + ASCII)."""
        return max(1, len(text) // 3)

    @staticmethod
    def _trim_text(text: str, max_tokens: int) -> str:
        max_chars = max_tokens * 3
        if len(text) <= max_chars:
            return text
        return text[:max_chars - 30] + "\n\n... [truncated]"


# ---------------------------------------------------------------------------
# Context Assembler
# ---------------------------------------------------------------------------


class ContextAssembler:
    """Assemble layered context for every agent call.

    Layers (priority high -> low):
    1. Agent system_prompt
    2. Spec / Rules (from SpecManager)
    3. Pinned messages (from MessagePin table)
    4. Recent history (from Message table)

    Usage::

        assembler = ContextAssembler()
        ctx = await assembler.assemble(db, conv_id, agent_system_prompt)
        # ctx.system_instruction -> merged system prompt
        # ctx.messages           -> truncated history
    """

    def __init__(
        self,
        token_budget: int = _DEFAULT_TOKEN_BUDGET,
        history_limit: int = _DEFAULT_HISTORY_LIMIT,
        pinned_limit: int | None = None,
    ) -> None:
        self.budget = TokenBudgetManager(token_budget)
        self.history_limit = history_limit
        self.pinned_limit = pinned_limit or int(
            os.getenv("AGENTHUB_MAX_PINNED_CONTEXT", "10")
        )

    async def assemble(
        self,
        db: AsyncSession,
        conv_id: UUID,
        agent_system_prompt: str = "",
    ) -> AssembledContext:
        """Assemble full context for a conversation."""
        # Layer 1: agent system_prompt
        layer1 = agent_system_prompt.strip()
        layer1_tokens = self.budget._count(layer1)

        # Layer 2: spec rules
        spec_rules = get_spec_manager().get_rules_for_conversation(str(conv_id)) or ""
        layer2_tokens = self.budget._count(spec_rules)

        # Layer 3: pinned messages
        pinned = await self._load_pinned_messages(db, conv_id)
        layer3_text = self._format_pinned_section(pinned)
        layer3_tokens = self.budget._count(layer3_text)

        # Layer 4: recent history
        history = await self._load_recent_history(db, conv_id, limit=self.history_limit)

        # Merge system layers
        system_parts: list[str] = []
        if layer1:
            system_parts.append(layer1)
        if spec_rules:
            system_parts.append(f"=== Spec / Rules ===\n{spec_rules}")
        if pinned:
            system_parts.append(layer3_text)
        system_instruction = "\n\n".join(system_parts)

        # Truncate
        result = self.budget.truncate(system_instruction, history)
        result.meta.layer1_tokens = layer1_tokens
        result.meta.layer2_tokens = layer2_tokens
        result.meta.layer3_tokens = layer3_tokens

        logger.info(
            "ContextAssembler: conv=%s total=%s L1=%s L2=%s L3=%s L4=%s truncated=%s",
            conv_id,
            result.meta.total_tokens,
            result.meta.layer1_tokens,
            result.meta.layer2_tokens,
            result.meta.layer3_tokens,
            result.meta.layer4_tokens,
            result.meta.truncated_count,
        )
        return result

    async def build_injection_text(
        self,
        db: AsyncSession,
        conv_id: UUID,
        agent_system_prompt: str = "",
    ) -> str | None:
        """Build the system-level injection text for pin_spec_injector compat.

        Returns the merged system instruction (layers 1+2+3), without history.
        History is handled by ADK's own session management.
        """
        ctx = await self.assemble(db, conv_id, agent_system_prompt)
        if not ctx.system_instruction.strip():
            return None
        return ctx.system_instruction

    # ------------------------------------------------------------------
    # Internal loaders
    # ------------------------------------------------------------------

    async def _load_pinned_messages(
        self, db: AsyncSession, conv_id: UUID
    ) -> list[str]:
        result = await db.execute(
            select(Message.content)
            .join(MessagePin, Message.id == MessagePin.message_id)
            .where(MessagePin.conversation_id == conv_id)
            .order_by(MessagePin.created_at.desc())
            .limit(self.pinned_limit)
        )
        return [row[0] for row in result.all() if row[0]]

    async def _load_recent_history(
        self, db: AsyncSession, conv_id: UUID, limit: int = 50
    ) -> list[ContextMessage]:
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conv_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        rows = list(result.scalars().all())
        rows.reverse()  # chronological order

        # Batch check which are pinned
        msg_ids = [r.id for r in rows]
        pinned_ids: set[UUID] = set()
        if msg_ids:
            pin_result = await db.execute(
                select(MessagePin.message_id).where(
                    MessagePin.message_id.in_(msg_ids)
                )
            )
            pinned_ids = {row[0] for row in pin_result.all()}

        return [
            ContextMessage(
                role=self._map_role(r.sender_type),
                content=r.content,
                pinned=r.id in pinned_ids,
                message_id=str(r.id),
            )
            for r in rows
        ]

    @staticmethod
    def _map_role(sender_type: str) -> str:
        if sender_type == "user":
            return "user"
        if sender_type in ("agent", "orchestrator", "system"):
            return "model"
        return "user"

    @staticmethod
    def _format_pinned_section(pinned: list[str]) -> str:
        if not pinned:
            return ""
        joined = "\n".join(f"- {item}" for item in pinned)
        return (
            "Pinned context has highest priority and must be followed.\n"
            f"=== Pinned Messages ===\n{joined}"
        )
