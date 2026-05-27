import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.schemas.agent import AgentResponse, AgentCreate, AgentUpdate, AgentVerifyRequest
from app.services.agent import AgentService

# Placeholder for current user
async def get_current_user_id() -> uuid.UUID:
    return uuid.UUID("00000000-0000-0000-0000-000000000001")

router = APIRouter()

@router.get("", response_model=List[AgentResponse])
async def list_agents(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    agents = await AgentService.get_agents(db, skip=skip, limit=limit)
    return agents

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    agent = await AgentService.get_agent(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    agent_in: AgentCreate,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id)
):
    agent = await AgentService.create_agent(db, agent_in, user_id=user_id)
    return agent

@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: uuid.UUID,
    agent_in: AgentUpdate,
    db: AsyncSession = Depends(get_db)
):
    db_agent = await AgentService.get_agent(db, agent_id)
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent = await AgentService.update_agent(db, db_agent, agent_in)
    return agent

@router.post("/verify")
async def verify_agent_model(request: AgentVerifyRequest):
    success = await AgentService.verify_model(
        provider=request.provider,
        model=request.model,
        system_prompt=request.system_prompt
    )
    return {"status": "ok", "message": "Verification successful"}
