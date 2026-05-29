import random
from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import UnauthorizedException, AppException
from app.models.user import User
from app.models.verification_code import VerificationCode
from app.schemas.auth import TokenResponse

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def generate_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def create_access_token(user_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.AUTH_ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "access"},
        settings.AUTH_SECRET_KEY,
        algorithm=settings.AUTH_ALGORITHM,
    )


def create_refresh_token(user_id: UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.AUTH_REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "type": "refresh"},
        settings.AUTH_SECRET_KEY,
        algorithm=settings.AUTH_ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.AUTH_SECRET_KEY, algorithms=[settings.AUTH_ALGORITHM])
    except JWTError:
        raise UnauthorizedException("token 无效或已过期")


def make_token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        expires_in=settings.AUTH_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def send_code(db: AsyncSession, email: str, purpose: str) -> None:
    # Rate limit: same email + purpose within 60 seconds
    min_ago = datetime.now(timezone.utc) - timedelta(seconds=settings.VERIFY_CODE_RATE_LIMIT_SECONDS)
    result = await db.execute(
        select(VerificationCode).where(
            VerificationCode.email == email,
            VerificationCode.purpose == purpose,
            VerificationCode.created_at >= min_ago,
        )
    )
    if result.scalar_one_or_none():
        raise AppException(429, f"请 {settings.VERIFY_CODE_RATE_LIMIT_SECONDS} 秒后再试")

    # Invalidate old unused codes
    await db.execute(
        update(VerificationCode)
        .where(
            VerificationCode.email == email,
            VerificationCode.purpose == purpose,
            VerificationCode.used == False,
        )
        .values(used=True)
    )

    code = generate_code()
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.VERIFY_CODE_EXPIRE_SECONDS)
    db.add(VerificationCode(email=email, code=code, purpose=purpose, expires_at=expires_at))
    await db.commit()

    from app.services.email import send_verification_email
    await send_verification_email(email, code)


async def verify_code(db: AsyncSession, email: str, code: str, purpose: str) -> bool:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(VerificationCode).where(
            VerificationCode.email == email,
            VerificationCode.code == code,
            VerificationCode.purpose == purpose,
            VerificationCode.used == False,
            VerificationCode.expires_at > now,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        return False
    record.used = True
    await db.commit()
    return True


async def register(db: AsyncSession, email: str, code: str, name: str, password: str) -> TokenResponse:
    # Check email not taken
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise AppException(409, "该邮箱已被注册")

    # Verify code
    if not await verify_code(db, email, code, "register"):
        raise AppException(400, "验证码错误或已过期")

    # Create user
    user = User(
        email=email,
        name=name,
        password_hash=hash_password(password),
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return make_token_response(user)


async def login(db: AsyncSession, email: str, password: str) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        raise AppException(401, "邮箱或密码错误")
    if not verify_password(password, user.password_hash):
        raise AppException(401, "邮箱或密码错误")
    return make_token_response(user)


async def get_current_user(db: AsyncSession, token: str) -> User:
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise UnauthorizedException("token 类型错误")
    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedException("token 无效")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedException("用户不存在")
    return user


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> TokenResponse:
    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise UnauthorizedException("token 类型错误")
    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedException("token 无效")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedException("用户不存在")
    return make_token_response(user)


async def change_password(db: AsyncSession, user: User, old_password: str, new_password: str) -> None:
    if not user.password_hash or not verify_password(old_password, user.password_hash):
        raise AppException(400, "原密码错误")
    user.password_hash = hash_password(new_password)
    await db.commit()
