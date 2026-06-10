from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.conversations import router as conversations_router
from app.api.v1.agents import router as agents_router
from app.api.v1.auth import router as auth_router
from app.api.v1.messages import router as messages_router, messages_router as messages_aux_router
from app.api.v1.orchestrator import router as orchestrator_router
from app.api.v1.projects import router as projects_router
from app.api.v1.files import router as files_router
from app.api.v1.deployments import router as deployments_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="/v1", tags=["health"])
api_router.include_router(conversations_router, prefix="/v1/conversations", tags=["conversations"])
api_router.include_router(agents_router, prefix="/v1/agents", tags=["agents"])
api_router.include_router(auth_router, prefix="/v1/auth", tags=["auth"])
api_router.include_router(messages_router, prefix="/v1/conversations", tags=["messages"])
api_router.include_router(messages_aux_router, prefix="/v1/messages", tags=["messages"])
api_router.include_router(orchestrator_router, prefix="/v1/orchestrator", tags=["orchestrator"])
api_router.include_router(projects_router, prefix="/v1/projects", tags=["projects"])
api_router.include_router(files_router, prefix="/v1/files", tags=["files"])
api_router.include_router(deployments_router, prefix="/v1", tags=["deployments"])
