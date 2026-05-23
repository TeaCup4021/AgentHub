import uuid
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentUpdate

class AgentService:
    @staticmethod
    async def get_agents(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[Agent]:
        result = await db.execute(select(Agent).order_by(Agent.created_at.desc()).offset(skip).limit(limit))
        return list(result.scalars().all())

    @staticmethod
    async def get_agent(db: AsyncSession, agent_id: uuid.UUID) -> Optional[Agent]:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        return result.scalars().first()

    @staticmethod
    async def create_agent(db: AsyncSession, agent_in: AgentCreate, user_id: uuid.UUID) -> Agent:
        db_agent = Agent(
            name=agent_in.name,
            avatar_url=agent_in.avatar_url,
            provider=agent_in.provider,
            model=agent_in.model,
            system_prompt=agent_in.system_prompt,
            capabilities=agent_in.capabilities,
            tool_config=agent_in.tool_config,
            created_by=user_id,
            is_builtin=False,
            is_active=True
        )
        db.add(db_agent)
        await db.commit()
        await db.refresh(db_agent)
        return db_agent

    @staticmethod
    async def delete_agent(db: AsyncSession, db_agent: Agent) -> None:
        await db.delete(db_agent)
        await db.commit()

    @staticmethod
    async def update_agent(db: AsyncSession, db_agent: Agent, agent_in: AgentUpdate) -> Agent:
        update_data = agent_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_agent, field, value)
        await db.commit()
        await db.refresh(db_agent)
        return db_agent

    @staticmethod
    async def verify_model(provider: str, model: str, system_prompt: Optional[str]) -> bool:
        try:
            from google.adk.agents import LlmAgent
            from google.adk.models.anthropic_llm import AnthropicLlm
            from google.adk.runners import Runner
            from google.adk.sessions import InMemorySessionService
            from google.genai import types

            # 根据 provider 选择模型后端
            if provider.lower() in ("anthropicllm", "anthropic", "claude"):
                llm = AnthropicLlm(model=model)
            else:
                llm = model

            agent = LlmAgent(
                name="adt_verify",
                model=llm,
                instruction=system_prompt or "Reply with 'ADK OK'"
            )

            session_service = InMemorySessionService()
            runner = Runner(
                agent=agent,
                app_name="agenthub_verify",
                session_service=session_service,
            )

            # 先创建 session
            await session_service.create_session(
                app_name="agenthub_verify",
                user_id="verify_user",
                session_id="verify_session",
            )

            # 发一条简单消息验证连通性
            async for event in runner.run_async(
                user_id="verify_user",
                session_id="verify_session",
                new_message=types.Content(
                    role="user",
                    parts=[types.Part.from_text(text="Hi")]
                ),
            ):
                if event.author != "user":
                    return True

            return True
        except Exception as e:
            raise HTTPException(status_code=400,
                detail=f"Model verification failed: {str(e)}")
