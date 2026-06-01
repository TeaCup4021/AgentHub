import logging
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("agenthub.exceptions")

class AppException(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message

class NotFoundException(AppException):
    def __init__(self, message: str = "Not Found"):
        super().__init__(404, message)

class ValidationException(AppException):
    def __init__(self, message: str = "Validation Error"):
        super().__init__(422, message)

class UnauthorizedException(AppException):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(401, message)

class InternalException(AppException):
    def __init__(self, message: str = "Internal Server Error"):
        super().__init__(500, message)

async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.code,
        content={"code": exc.code, "data": None, "message": exc.message}
    )

async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    body = "<unavailable>"
    try:
        body = await request.json()
    except Exception:
        try:
            body = (await request.body()).decode("utf-8", errors="replace")
        except Exception:
            pass
    logger.warning("HTTPException %s: %s | body=%s", exc.status_code, exc.detail, body)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "data": None, "message": str(exc.detail)}
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError):
    messages = []
    for error in exc.errors():
        loc = " -> ".join(str(p) for p in error["loc"])
        messages.append(f"{loc}: {error['msg']}")
    body = "<unavailable>"
    try:
        body = await request.json()
    except Exception:
        try:
            body = (await request.body()).decode("utf-8", errors="replace")
        except Exception:
            pass
    logger.warning("ValidationError 422: %s | body=%s", "; ".join(messages), body)
    return JSONResponse(
        status_code=422,
        content={"code": 422, "data": None, "message": "; ".join(messages)},
    )


async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"code": 500, "data": None, "message": "Internal Server Error"}
    )
