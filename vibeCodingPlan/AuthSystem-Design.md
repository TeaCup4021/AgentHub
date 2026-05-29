# AgentHub 登录认证系统设计方案

**日期**: 2026-05-29

---

## 现状分析

### 后端
- **框架**: FastAPI + SQLAlchemy async + PostgreSQL
- **User 表**: `id, email, name, avatar_url, created_at, updated_at` — **无密码字段**
- **认证方式**: 所有端点通过 `get_current_user_id()` 硬编码返回 `00000000-0000-0000-0000-000000000001`
- **已定义**: `UnauthorizedException(401)` 存在于 `core/exceptions.py`
- **响应格式**: 中间件 `ResponseWrapperMiddleware` 自动包装为 `{code, data, message}`
- **无任何 auth 中间件、无 JWT 依赖**

### 前端
- **框架**: React 19 + Vite + Zustand + React Router v7 + Axios + Semi UI
- **Token 读取**: Axios 拦截器从 `localStorage.getItem("token")` 读取，以 `Bearer xxx` 发送
- **401 处理**: 响应拦截器检测到 401 时仅 `localStorage.removeItem("token")`，无跳转
- **路由**: `/` 为 AppLayout（主界面），`/settings` 为设置页 — **无登录页**
- **无用户状态管理**（没有 UserContext/AuthStore）

---

## 一、方案选型

**邮箱 + 验证码注册 + 密码登录 + JWT (access + refresh token)**

| 环节 | 方式 |
|------|------|
| 注册 | 邮箱 → 发验证码 → 验证通过 + 设置密码 → 创建账号 |
| 登录 | 邮箱 + 密码 |
| 鉴权 | JWT access token（30min）+ refresh token（7d） |

理由：
- 与现有 `users.email` 字段直接匹配
- 验证码注册防止恶意注册，比开放注册安全
- JWT 无状态，不需要 session 存储，与当前 async 架构一致

---

## 二、后端改动

### 2.1 安装依赖

```
pip install python-jose[cryptography] passlib[bcrypt]
```

### 2.2 新增配置 — `core/config.py`

```python
# Auth
AUTH_SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
AUTH_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
AUTH_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
AUTH_ALGORITHM: str = "HS256"

# 邮件发送（用于验证码）
# 开发阶段用 third-party API，如 Resend，生产切换 SMTP
EMAIL_API_KEY: str = ""
EMAIL_FROM: str = "AgentHub <noreply@agenthub.example.com>"
VERIFY_CODE_EXPIRE_SECONDS: int = 600   # 验证码 10 分钟有效
VERIFY_CODE_RATE_LIMIT_SECONDS: int = 60  # 同邮箱 60 秒内不可重发
```

### 2.3 User 模型 — `models/user.py`

```python
class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
```

### 2.4 验证码表 — `models/verification_code.py`

```python
class VerificationCode(Base, UUIDMixin):
    __tablename__ = "verification_codes"
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(6), nullable=False)   # 6位数字
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)  # register | reset_password
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
```

### 2.5 Alembic 迁移

```sql
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false;

CREATE TABLE verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_vc_email_purpose ON verification_codes(email, purpose);
```

### 2.6 新增 Schemas — `schemas/auth.py`

```python
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
```

### 2.7 新增 AuthService — `services/auth.py`

```
  hash_password(plain: str) -> str                       # bcrypt
  verify_password(plain: str, hash: str) -> bool

  generate_code() -> str                                 # 随机 6 位数字
  send_verification_email(email: str, code: str) -> None # 调用邮件 API 发验证码

  send_code(db, email, purpose) -> None
    # 1. 同邮箱同 purpose 60 秒内不可重发
    # 2. 标记旧未使用验证码为 used
    # 3. 生成新 code，写入 verification_codes（10 分钟过期）
    # 4. 发送邮件

  verify_code(db, email, code, purpose) -> bool
    # 查找匹配且未过期且未使用的验证码 → 标记 used=true → 返回 True

  register(db, data) -> TokenResponse
    # 1. 校验 email 未被注册
    # 2. verify_code() 验证验证码
    # 3. hash_password + 创建 User (is_verified=true)
    # 4. 返回 JWT tokens

  create_access_token(user_id: UUID) -> str              # JWT, 30min
  create_refresh_token(user_id: UUID) -> str             # JWT, 7d
  decode_token(token: str) -> dict                       # 验证 + 解码

  login(db, email, password) -> TokenResponse            # 验证密码 → 返回 tokens
  get_current_user(db, token) -> User                    # JWT → 查库 → User ORM
```

### 2.8 邮件发送 — `services/email.py`

封装邮件发送接口，方便后续切换实现：

```python
class EmailService:
    @staticmethod
    async def send_verification_code(email: str, code: str) -> None:
        """发送验证码邮件。内部调用 Resend API / SMTP / 其他"""
        # 开发阶段可用 Resend 或本地 Mailpit
        subject = "AgentHub 邮箱验证"
        body = f"""<p>您好，</p>
        <p>您的验证码是：<strong style="font-size:24px">{code}</strong></p>
        <p>有效期 10 分钟，请勿转发他人。</p>"""
        await _send_email(to=email, subject=subject, html=body)
```

### 2.9 新增 Auth API 端点 — `api/v1/auth.py`

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/auth/send-code` | 发送邮箱验证码（注册前） |
| `POST` | `/api/v1/auth/register` | 验证码 + 密码完成注册 |
| `POST` | `/api/v1/auth/login` | 邮箱 + 密码登录 |
| `POST` | `/api/v1/auth/refresh` | 刷新 token |
| `GET` | `/api/v1/auth/me` | 获取当前用户信息 |
| `PATCH` | `/api/v1/auth/password` | 修改密码（需登录） |

**POST /auth/send-code**
```json
// req
{ "email": "user@example.com" }
// res
{ "code": 200, "data": null, "message": "验证码已发送" }
// error
{ "code": 429, "data": null, "message": "请 60 秒后再试" }
```

**POST /auth/register**
```json
// req
{ "email": "user@example.com", "code": "123456", "name": "张三", "password": "mypassword" }
// res
{ "code": 201, "data": { "access_token": "xxx", "refresh_token": "yyy", "token_type": "bearer", "expires_in": 1800 } }
// error
{ "code": 400, "data": null, "message": "验证码错误或已过期" }
```

**POST /auth/login**
```json
// req
{ "email": "user@example.com", "password": "mypassword" }
// res
{ "code": 200, "data": { "access_token": "xxx", "refresh_token": "yyy", "token_type": "bearer", "expires_in": 1800 } }
```

### 2.10 替换硬编码依赖

新建 `app/api/deps.py`：

```python
from fastapi import Depends, Header
from app.services.auth import AuthService
from app.core.exceptions import UnauthorizedException

async def get_current_user(
    authorization: str | None = Header(None),
    db = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedException("未登录")
    return await AuthService.get_current_user(db, authorization[7:])
```

替换文件中所有的 `get_current_user_id`：
- `api/v1/conversations.py` → 从 `user.id` 取值
- `api/v1/agents.py` → 从 `user.id` 取值
- `api/v1/messages.py` → 从 `user.id` 取值

### 2.11 路由注册

`api/router.py` 增加：
```python
from app.api.v1.auth import router as auth_router
api_router.include_router(auth_router, prefix="/v1/auth", tags=["auth"])
```

---

## 三、前端改动

### 3.1 新增 AuthStore — `stores/authStore.ts`

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  sendCode: (email: string) => Promise<void>;        // 发验证码
  register: (email: string, code: string, name: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  fetchMe: () => Promise<void>;
}
```

### 3.2 新增 LoginPage — `components/auth/LoginPage.tsx`

**登录模式**：邮箱 + 密码 → 登录。

**注册模式**（两步）：
- **步骤1**：输入邮箱 → 点击「发送验证码」→ 开启 60 秒倒计时 → 输入收到的 6 位数字
- **步骤2**：验证码通过后，输入姓名 + 密码 → 点击注册 → 自动登录并跳转 `/`

底部分割线切换登录/注册模式。

### 3.3 路由改造 — `App.tsx`

```tsx
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <Spin />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

// Routes
<Route path="/login" element={<LoginPage />} />
<Route path="/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
```

### 3.4 API 拦截器增强 — `lib/api.ts`

- 401 自动 `refreshToken()` 重试
- refresh 失败 → `logout()` → 跳转 `/login`

---

## 四、数据流

```
注册:
  输邮箱 → POST /auth/send-code → 收到验证码邮件
  输验证码 + 姓名 + 密码 → POST /auth/register → JWT → localStorage → 跳转 /

登录:
  输邮箱 + 密码 → POST /auth/login → JWT → localStorage → 跳转 /

鉴权:
  Axios 拦截器 → Bearer token → 后端 JWT 验证 → get_current_user → user_id

刷新:
  401 → POST /auth/refresh → 新 access_token → 重试原请求

登出:
  clear localStorage + clearAuthStore → Navigate /login
```

---

## 五、文件清单

### 后端新增
| 文件 | 说明 |
|------|------|
| `app/schemas/auth.py` | 认证 Pydantic schemas |
| `app/services/auth.py` | 密码哈希 + JWT + 验证码 |
| `app/services/email.py` | 邮件发送（验证码） |
| `app/models/verification_code.py` | verification_codes ORM 模型 |
| `app/api/v1/auth.py` | 认证 API 端点（6 个） |
| `app/api/deps.py` | `get_current_user` 公共依赖 |
| `alembic/versions/xxxx_add_auth.py` | users 加字段 + verification_codes 建表 |

### 后端修改
| 文件 | 改动 |
|------|------|
| `app/models/user.py` | 加 `password_hash`、`is_verified` |
| `app/core/config.py` | 加 `AUTH_*`、`EMAIL_*` 配置 |
| `app/api/v1/conversations.py` | 替换 `get_current_user_id` → `get_current_user` |
| `app/api/v1/agents.py` | 替换 `get_current_user_id` → `get_current_user` |
| `app/api/v1/messages.py` | 替换 `get_current_user_id` → `get_current_user` |
| `app/api/router.py` | 注册 auth 路由 |
| `requirements.txt` | 加 `python-jose`, `passlib`, `bcrypt` |

### 前端新增
| 文件 | 说明 |
|------|------|
| `src/stores/authStore.ts` | 认证状态管理 |
| `src/components/auth/LoginPage.tsx` | 登录/注册页面（含验证码） |
| `src/components/auth/index.ts` | 导出 |

### 前端修改
| 文件 | 改动 |
|------|------|
| `src/App.tsx` | 加 `/login` 路由 + ProtectedRoute |
| `src/lib/api.ts` | 增强 401 处理（refresh + 跳转） |

---

## 六、注意事项

1. **邮件服务**：开发阶段建议对接 [Resend](https://resend.com)（HTTP API，100 封/天免费），或本地跑 Mailpit。生产切换真实 SMTP。
2. **老数据兼容**：`password_hash` 允许 NULL，已有 mock 用户保留但无法登录。seed 时创建默认管理员（如 `admin@agenthub.local`）。
3. **SECRET_KEY**：部署时通过环境变量注入。
4. **API 签名不变**：现有端点响应格式不变，中间件自动包装 `{code, data, message}`。
5. **SSE 鉴权**：`/conversations/:id/stream` 连接时查 JWT。如果流期间 token 过期不会中断连接（已建立的连接不校验），但新请求会 401 触发 refresh。
