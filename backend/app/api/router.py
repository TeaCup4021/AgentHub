from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.conversations import router as conversations_router
from app.api.v1.agents import router as agents_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/v1", tags=["health"])
api_router.include_router(conversations_router, prefix="/v1/conversations", tags=["conversations"])
api_router.include_router(agents_router, prefix="/v1/agents", tags=["agents"])
