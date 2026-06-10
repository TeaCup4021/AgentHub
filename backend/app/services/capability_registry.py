from typing import List
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent

CAPABILITY_KEYS = ["coding", "review", "refactoring", "debugging", "docs", "ui", "testing", "reasoning", "planning"]


class CapabilityRegistry:

    @staticmethod
    async def match_agents(
        db: AsyncSession,
        required_capability: str,
        limit: int = 10,
    ) -> List[Agent]:
        result = await db.execute(
            select(Agent)
            .where(
                Agent.is_active == True,
                Agent.capabilities.contains([required_capability]),
            )
            .order_by(Agent.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_all_capabilities(db: AsyncSession) -> List[str]:
        result = await db.execute(
            select(Agent.capabilities).where(Agent.is_active == True)
        )
        seen: set[str] = set()
        for (caps,) in result.all():
            if isinstance(caps, list):
                for c in caps:
                    if isinstance(c, str) and c.strip():
                        seen.add(c.strip())
        return sorted(seen)
