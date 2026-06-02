import contextlib
import logging
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

# Configure application-level logging so that agenthub.* loggers
# emit INFO messages (visible with uvicorn --log-level info)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

from app.core.config import settings
from app.core.database import async_session_maker
from app.core.middleware import ResponseWrapperMiddleware
from app.core.seed import seed_default_agents
from app.core.exceptions import (
    AppException, app_exception_handler,
    http_exception_handler, validation_exception_handler, global_exception_handler
)
from app.api.router import api_router

# Import adapter layer to trigger AdapterRegistry registration at startup
import app.services.adapters  # noqa: F401


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
