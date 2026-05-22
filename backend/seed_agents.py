import sys
import os
import asyncio
from uuid import UUID

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.future import select
from app.core.database import async_session_maker
from app.models.user import User
from app.models.agent import Agent

async def seed():
    async with async_session_maker() as session:
        # 1. Create initial test user (user_id 固定，方便 Mock 依赖注入)
        TEST_USER_ID = UUID("00000000-0000-0000-0000-000000000001")
        result = await session.execute(select(User).where(User.email == "test@example.com"))
        test_user = result.scalars().first()
        if not test_user:
            test_user = User(
                id=TEST_USER_ID,
                email="test@example.com",
                name="Test User"
            )
            session.add(test_user)
            await session.commit()
            print(f"Created Test User (id={TEST_USER_ID}).")
        else:
            print(f"Test User already exists (id={test_user.id}).")

        # 2. Create built-in agents
        agents_data = [
            {
                "name": "Claude Code",
                "provider": "AnthropicLlm",
                "model": "claude-sonnet-4-6",
                "system_prompt": (
                    "你是一名世界级软件工程师，擅长 React、TypeScript、Python 开发。"
                    "编写高质量、可维护的代码，遵循最佳实践。"
                    "当用户要求生成代码时，同时输出 artifact 格式的结构化数据以便前端渲染代码卡片。"
                ),
                "capabilities": ["coding", "docs", "ui", "reasoning"],
                "tool_config": {},
                "is_builtin": True,
                "is_active": True,
            },
            {
                "name": "Codex",
                "provider": "LiteLLM",
                "model": "openai/gpt-5",
                "system_prompt": (
                    "你是代码优化与补全专家。擅长性能分析、代码重构和自动补全。"
                    "输出可直接使用的代码片段和优化建议。"
                ),
                "capabilities": ["coding", "autocomplete", "refactoring"],
                "tool_config": {},
                "is_builtin": True,
                "is_active": True,
            },
            {
                "name": "OpenCode",
                "provider": "LiteLLM",
                "model": "anthropic/claude-haiku-4-5",
                "system_prompt": (
                    "你是代码审查与文档专家。擅长代码审查、Bug 检测、API 文档生成。"
                    "审查时给出具体的修改建议和风险等级。"
                ),
                "capabilities": ["coding", "review", "docs"],
                "tool_config": {},
                "is_builtin": True,
                "is_active": True,
            },
        ]

        for agent_data in agents_data:
            agent_name = agent_data["name"]
            result = await session.execute(select(Agent).where(Agent.name == agent_name))
            agent = result.scalars().first()
            if not agent:
                agent = Agent(**agent_data)
                session.add(agent)
                print(f"Created Agent: {agent_name}")
            else:
                # Update existing agent with latest config
                for key, value in agent_data.items():
                    setattr(agent, key, value)
                session.add(agent)
                print(f"Updated Agent: {agent_name}")

        await session.commit()
        print("Done seeding data.")

if __name__ == "__main__":
    asyncio.run(seed())
