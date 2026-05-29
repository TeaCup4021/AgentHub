from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import UnauthorizedException
from app.models.user import User as UserModel
from app.services.auth import get_current_user as _get_current_user


async def get_current_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> UserModel:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedException("未登录")
    return await _get_current_user(db, authorization[7:])


async def get_current_user_id(
    user: UserModel = Depends(get_current_user),
) -> UUID:
    """Convenience shortcut when only the ID is needed."""
    return user.id
