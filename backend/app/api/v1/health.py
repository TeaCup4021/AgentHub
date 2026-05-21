from fastapi import APIRouter
from sqlalchemy import text
from app.core.database import async_session_maker

router = APIRouter()

@router.get("/health")
async def health_check():
    db_status = "ok"
    try:
        async with async_session_maker() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
        
    return {
        "db": db_status,
        "redis": "ok",  # Mocked for now, will implement actual redis check later
        "minio": "ok"   # Mocked for now, will implement actual minio check later
    }
