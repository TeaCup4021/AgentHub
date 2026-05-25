import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.agent import Agent
from app.models.user import User

SYSTEM_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

DEFAULT_AGENTS = [
    {
        "name": "Claude Opus",
        "provider": "anthropic",
        "model": "claude-opus-4-7",
        "system_prompt": "You are Claude Opus, a helpful AI assistant.",
        "capabilities": ["code", "chat", "analyze"],
    },
    {
        "name": "GPT-4o",
        "provider": "openai",
        "model": "gpt-4o",
        "system_prompt": "You are GPT-4o, a helpful AI assistant.",
        "capabilities": ["code", "chat", "analyze"],
    },
]


async def seed_default_user(db: AsyncSession):
    user = await db.get(User, SYSTEM_USER_ID)
    if user is None:
        db.add(User(
            id=SYSTEM_USER_ID,
            email="system@agenthub.local",
            name="System",
        ))
        await db.flush()


async def seed_default_agents(db: AsyncSession):
    await seed_default_user(db)

    result = await db.execute(select(func.count()).select_from(Agent))
    count = result.scalar()
    if count > 0:
        return

    for data in DEFAULT_AGENTS:
        agent = Agent(
            name=data["name"],
            provider=data["provider"],
            model=data["model"],
            system_prompt=data["system_prompt"],
            capabilities=data["capabilities"],
            is_builtin=True,
            is_active=True,
            created_by=SYSTEM_USER_ID,
        )
        db.add(agent)

    await db.commit()
