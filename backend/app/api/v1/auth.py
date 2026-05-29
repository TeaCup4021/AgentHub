from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.auth import (
    SendCodeRequest,
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    ChangePasswordRequest,
)
from app.services import auth as auth_service
from app.api.deps import get_current_user

router = APIRouter()


@router.post("/send-code")
async def send_code(data: SendCodeRequest, db: AsyncSession = Depends(get_db)):
    await auth_service.send_code(db, data.email, "register")
    return {"status": "ok", "message": "验证码已发送"}


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.register(
        db, data.email, data.code, data.name, data.password
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.login(db, data.email, data.password)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(refresh_token: str, db: AsyncSession = Depends(get_db)):
    return await auth_service.refresh_access_token(db, refresh_token)


@router.get("/me", response_model=UserResponse)
async def me(user=Depends(get_current_user)):
    return user


@router.patch("/password")
async def change_password(
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    await auth_service.change_password(db, user, data.old_password, data.new_password)
    return {"status": "ok", "message": "密码已修改"}
