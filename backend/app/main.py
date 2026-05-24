import contextlib
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.database import async_session_maker
from app.core.middleware import ResponseWrapperMiddleware
from app.core.seed import seed_default_agents
from app.core.exceptions import (
    AppException, app_exception_handler,
    http_exception_handler, validation_exception_handler, global_exception_handler
)
from app.api.router import api_router

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    async with async_session_maker() as db:
        await seed_default_agents(db)
    yield
    # shutdown logic

app = FastAPI(lifespan=lifespan, title="AgentHub API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ResponseWrapperMiddleware)

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

app.include_router(api_router, prefix="/api")
