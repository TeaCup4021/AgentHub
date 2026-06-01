import uuid
from typing import List, Optional
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentUpdate


def _validate_provider_model(provider: str, model: str) -> None:
    """Validate that provider and model name are present.

    Raises HTTPException(422) if either is missing.
    """
    if not provider or not provider.strip():
        raise HTTPException(status_code=422, detail="Provider is required.")
    if not model or not model.strip():
        raise HTTPException(status_code=422, detail="Model name is required.")


def _validate_required_fields(provider: str, model: str, base_url: str, api_key: str) -> None:
    """Validate that required fields are present and non-empty."""
    if not base_url or not base_url.strip():
        raise HTTPException(status_code=422, detail="模型基址（base_url）为必填项。")
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=422, detail="API Key 为必填项。")


class AgentService:
    @staticmethod
    async def get_agents(
        db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 100
    ) -> List[Agent]:
        """List agents visible to the current user: built-in agents + own agents."""
        result = await db.execute(
            select(Agent)
            .where(
                or_(
                    Agent.created_by.is_(None),   # built-in agents, visible to all
                    Agent.created_by == user_id,   # user's own agents
                )
            )
            .order_by(Agent.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_agent(
        db: AsyncSession, agent_id: uuid.UUID, user_id: uuid.UUID | None = None
    ) -> Optional[Agent]:
        """Get a single agent. If user_id is provided, enforce visibility."""
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        agent = result.scalars().first()
        if agent and user_id is not None:
            _check_agent_access(agent, user_id)
        return agent

    @staticmethod
    async def create_agent(
        db: AsyncSession, agent_in: AgentCreate, user_id: uuid.UUID
    ) -> Agent:
        _validate_provider_model(agent_in.provider, agent_in.model)
        _validate_required_fields(agent_in.provider, agent_in.model, agent_in.base_url, agent_in.api_key)
        db_agent = Agent(
            name=agent_in.name,
            avatar_url=agent_in.avatar_url,
            provider=agent_in.provider,
            model=agent_in.model,
            system_prompt=agent_in.system_prompt,
            capabilities=agent_in.capabilities,
            tool_config=agent_in.tool_config,
            api_key=agent_in.api_key.strip(),
            base_url=agent_in.base_url.strip(),
            created_by=user_id,
            is_builtin=False,
            is_active=True,
        )
        db.add(db_agent)
        await db.commit()
        await db.refresh(db_agent)
        return db_agent

    @staticmethod
    async def delete_agent(
        db: AsyncSession, db_agent: Agent, user_id: uuid.UUID
    ) -> None:
        _check_agent_owner(db_agent, user_id)
        await db.delete(db_agent)
        await db.commit()

    @staticmethod
    async def update_agent(
        db: AsyncSession, db_agent: Agent, agent_in: AgentUpdate, user_id: uuid.UUID
    ) -> Agent:
        _check_agent_owner(db_agent, user_id)
        update_data = agent_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_agent, field, value)
        # Validate the final provider+model combination after applying updates
        _validate_provider_model(db_agent.provider, db_agent.model)
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


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _check_agent_access(agent: Agent, user_id: uuid.UUID) -> None:
    """Raise 403 if the agent belongs to another user."""
    if agent.created_by is not None and agent.created_by != user_id:
        raise HTTPException(status_code=403, detail="无权访问此 Agent。")


def _check_agent_owner(agent: Agent, user_id: uuid.UUID) -> None:
    """Raise 403 if the agent is built-in or belongs to another user."""
    if agent.created_by is None:
        raise HTTPException(status_code=403, detail="内置 Agent 不可修改或删除。")
    if agent.created_by != user_id:
        raise HTTPException(status_code=403, detail="无权修改此 Agent。")
