import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.agent import Agent
from app.models.user import User

SYSTEM_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

DEFAULT_AGENTS = [
    {
        "name": "Claude Opus",
        "provider": "anthropic",
        "model": "claude-sonnet-4-6",
        "system_prompt": "You are Claude Opus, a helpful AI assistant.",
        "capabilities": ["code", "chat", "analyze"],
    },
    {
        "name": "GPT-4o",
        "provider": "openai",
        "model": "gpt-5.2",
        "system_prompt": "You are a helpful AI assistant.",
        "capabilities": ["code", "chat", "analyze"],
    },
    {
        "name": "Claude Code CLI",
        "provider": "claude-code-cli",
        "model": "claude-code-default",
        "system_prompt": (
            "You are Claude Code - a local AI coding agent with full filesystem access. "
            "You can read, write, and edit files; run terminal commands; search code; "
            "manage git; and perform complex multi-step software engineering tasks. "
            "When given a task, work autonomously: read relevant files, plan your approach, "
            "implement changes, and verify correctness by running tests or linting."
        ),
        "capabilities": ["code", "edit", "filesystem", "shell", "git"],
    },
    {
        "name": "Codex CLI",
        "provider": "codex-cli",
        "model": "deepseek-v4-pro",
        "system_prompt": (
            "You are Codex CLI - OpenAI's terminal-based AI coding agent. "
            "You excel at code generation, refactoring, review, and repository-level "
            "understanding. When given a task, produce clean, working code with "
            "proper error handling and documentation."
        ),
        "capabilities": ["code", "edit", "filesystem", "review"],
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

    existing = await db.execute(select(Agent.name))
    existing_names = set(existing.scalars().all())

    for data in DEFAULT_AGENTS:
        if data["name"] in existing_names:
            continue
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
