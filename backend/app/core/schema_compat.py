import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("agenthub.schema")


async def ensure_runtime_schema(db: AsyncSession) -> None:
    """Apply tiny idempotent schema guards needed by local dev servers.

    Alembic remains the source of truth. This keeps an already-running local
    database from breaking core reads when a lightweight additive column was
    introduced but migrations have not been run yet.
    """
    await db.execute(text(
        "ALTER TABLE conversations "
        "ADD COLUMN IF NOT EXISTS purpose VARCHAR(30) NOT NULL DEFAULT 'normal'"
    ))
    await db.commit()
    logger.info("runtime schema compatibility checks completed")
