import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.agent import Agent
from app.models.user import User

SYSTEM_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

DEFAULT_AGENTS = [
    {
        "id": uuid.UUID("e77f4176-297a-4b8f-a76e-3fe50b97422a"),
        "name": "DeepSeek V4",
        "provider": "litellm",
        "model": "deepseek/deepseek-chat",
        "system_prompt": (
            "You are a world-class software engineer. Write clean, maintainable code. "
            "When writing code, ALWAYS use standard Markdown code blocks with language: "
            "```python, ```javascript, ```html, ```diff etc. "
            "When you create a file, use the create_file tool. "
            "When you build an HTML page, use the preview_publish tool to publish it."
        ),
        "capabilities": ["coding", "reasoning", "review", "chat"],
        "tool_config": {"tools": [{"type": "builtin", "name": "create_file"}, {"type": "builtin", "name": "preview_publish"}]},
    },
    {
        "id": uuid.UUID("e5776315-70ff-4538-ac04-b2ac7e4ff6bd"),
        "name": "Claude Opus",
        "provider": "anthropic",
        "model": "claude-opus-4-7",
        "system_prompt": "You are Claude, a powerful AI assistant.",
        "capabilities": ["coding", "reasoning", "review", "chat"],
    },
    {
        "id": uuid.UUID("d23018af-3725-4d8d-a83c-5225d00e7ad3"),
        "name": "GPT-4o",
        "provider": "openai",
        "model": "gpt-4o",
        "system_prompt": "You are GPT-4o, a powerful AI assistant.",
        "capabilities": ["coding", "reasoning", "review", "chat"],
    },
    {
        "id": uuid.UUID("e60f1466-69e4-4272-84b2-7e85ea2866db"),
        "name": "Claude Code CLI",
        "provider": "claude-code-cli",
        "model": "claude-code-default",
        "system_prompt": (
            "You are Claude Code - a local AI coding agent with full filesystem access. "
            "Read, write, and edit files; run commands; search code; manage git."
        ),
        "capabilities": ["code", "edit", "filesystem", "shell", "git"],
    },
    {
        "id": uuid.UUID("bae72fa5-8e88-4223-b2c3-1f28263ff6f8"),
        "name": "Codex CLI",
        "provider": "codex-cli",
        "model": "deepseek-v4-pro",
        "system_prompt": "You are Codex CLI - a terminal-based AI coding agent.",
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
            id=data.get("id", uuid.uuid4()),
            name=data["name"],
            provider=data["provider"],
            model=data["model"],
            system_prompt=data["system_prompt"],
            capabilities=data["capabilities"],
            tool_config=data.get("tool_config"),
            is_builtin=True,
            is_active=True,
            created_by=None,
        )
        db.add(agent)
    await db.flush()

    for data in DEFAULT_AGENTS:
        result = await db.execute(select(Agent).where(Agent.name == data["name"]))
        agent = result.scalar_one_or_none()
        if agent and data.get("tool_config"):
            agent.tool_config = data["tool_config"]

    await db.commit()
