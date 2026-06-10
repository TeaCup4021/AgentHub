from uuid import UUID
from pydantic import EmailStr, Field
from app.schemas.base import BaseSchema


class SendCodeRequest(BaseSchema):
    email: EmailStr


class RegisterRequest(BaseSchema):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    name: str = Field(..., max_length=100)
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseSchema):
    email: EmailStr
    password: str


class TokenResponse(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseSchema):
    id: UUID
    email: str
    name: str
    avatar_url: str | None
    is_verified: bool


class ChangePasswordRequest(BaseSchema):
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=128)
