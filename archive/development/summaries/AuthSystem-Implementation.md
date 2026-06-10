# AgentHub 登录认证系统实现总结

**日期**: 2026-05-29 | **实现**: 全栈（后端 + 前端）

---

## 功能概述

实现邮箱 + 验证码注册 + 密码登录 + JWT 双 token 认证系统，替换之前的硬编码 mock user_id。

---

## 注册流程

1. 用户输入邮箱 → `POST /api/v1/auth/send-code` → 后端生成 6 位数字验证码 → 发邮件（Resend API）
2. 用户输入验证码 + 姓名 + 密码 → `POST /api/v1/auth/register` → 校验验证码 → 创建用户 → 返回 JWT
3. 60 秒内同邮箱不可重复发送，验证码 10 分钟过期，使用后立即标记失效

## 登录流程

邮箱 + 密码 → `POST /api/v1/auth/login` → 返回 access_token（30min）+ refresh_token（7d）

---

## 后端变更

### 新增文件

| 文件 | 说明 |
|------|------|
| `app/schemas/auth.py` | SendCodeRequest, RegisterRequest, LoginRequest, TokenResponse, UserResponse, ChangePasswordRequest |
| `app/services/auth.py` | bcrypt 密码哈希、JWT 签发/验证、验证码生成/校验、register/login/refresh/change_password |
| `app/services/email.py` | send_verification_email() → Resend API |
| `app/models/verification_code.py` | verification_codes 表 ORM 模型 |
| `app/api/v1/auth.py` | 6 个认证端点 |
| `app/api/deps.py` | get_current_user() / get_current_user_id() 公共依赖 |
| `alembic/versions/0004_add_auth_fields.py` | 数据库迁移 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `app/models/user.py` | 加 `password_hash`（nullable）、`is_verified`（default false） |
| `app/models/__init__.py` | 导出 VerificationCode |
| `app/core/config.py` | 加 AUTH_SECRET_KEY、AUTH_ACCESS_TOKEN_EXPIRE_MINUTES、AUTH_REFRESH_TOKEN_EXPIRE_DAYS、AUTH_ALGORITHM、EMAIL_API_KEY、EMAIL_FROM、VERIFY_CODE_EXPIRE_SECONDS、VERIFY_CODE_RATE_LIMIT_SECONDS |
| `app/api/v1/conversations.py` | 删除本地 `get_current_user_id` mock，改用 `from app.api.deps import` |
| `app/api/v1/agents.py` | 同上 |
| `app/api/v1/messages.py` | 同上 |
| `app/api/router.py` | 注册 auth 路由 `/api/v1/auth` |
| `requirements.txt` | 加 python-jose、passlib、bcrypt、pydantic[email] |

### 新增 API 端点

```
POST   /api/v1/auth/send-code     # 发送验证码
POST   /api/v1/auth/register      # 验证码 + 密码注册
POST   /api/v1/auth/login         # 邮箱 + 密码登录
POST   /api/v1/auth/refresh       # 刷新 access token
GET    /api/v1/auth/me            # 获取当前用户（需鉴权）
PATCH  /api/v1/auth/password      # 修改密码（需鉴权）
```

所有端点响应均通过 ResponseWrapperMiddleware 自动包裹为 `{code, data, message}` 格式。

### 数据库变更

```sql
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);      -- NULL 兼容存量 mock 用户
ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false;

CREATE TABLE verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(20) NOT NULL,       -- 'register' | 'reset_password'
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_vc_email_purpose ON verification_codes(email, purpose);
```

---

## 前端变更

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/stores/authStore.ts` | Zustand store：user/isAuthenticated/isLoading + sendCode/register/login/logout/fetchMe |
| `src/components/auth/LoginPage.tsx` | 登录/注册页，Semi UI Form，支持登录/注册模式切换，验证码 60s 倒计时 |
| `src/components/auth/index.ts` | 导出 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/App.tsx` | 加 `/login` 路由、ProtectedRoute 组件、AuthInit 组件（启动时 fetchMe 恢复登录态） |
| `src/lib/api.ts` | 401 响应自动 refresh token 重试，并发请求共享一次 refresh，refresh 失败自动清除 token |

### Token 管理

- `access_token` → `localStorage.token`，Axios 拦截器自动附加 `Authorization: Bearer xxx`
- `refresh_token` → `localStorage.refresh_token`，仅 401 时使用
- SSE 请求同样从 localStorage 读取 token 附加到 header

---

## 邮件发送

- 接口：`services/email.py` 的 `send_verification_email()`
- 当前实现：调用 Resend API（`https://api.resend.com/emails`）
- 配置：`EMAIL_API_KEY` 环境变量（未配置时验证码仅 log 到控制台，不真实发送）
- 扩展：如需切换 SMTP 或其他邮件服务，替换 `send_verification_email()` 实现即可

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AUTH_SECRET_KEY` | 占位值 | JWT 签名密钥，生产必改 |
| `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | access token 有效期（分钟） |
| `AUTH_REFRESH_TOKEN_EXPIRE_DAYS` | `7` | refresh token 有效期（天） |
| `AUTH_ALGORITHM` | `HS256` | JWT 签名算法 |
| `EMAIL_API_KEY` | `""` | Resend API Key，不配则验证码 log 到控制台 |
| `EMAIL_FROM` | `AgentHub <noreply@agenthub.example.com>` | 发件人 |
| `VERIFY_CODE_EXPIRE_SECONDS` | `600` | 验证码有效期（秒） |
| `VERIFY_CODE_RATE_LIMIT_SECONDS` | `60` | 同邮箱重发间隔（秒） |

---

## 存量数据兼容

- `password_hash` 允许 NULL，已有 mock 用户（如硬编码的 `00000000-0000-0000-0000-000000000001`）不受影响但无法登录
- 建议在 seed 时创建默认管理员账号（如 `admin@agenthub.local`）供首次登录

---

## 后续待办

- [ ] 生产环境配置真实 EMAIL_API_KEY
- [ ] 生产环境覆盖 AUTH_SECRET_KEY
- [ ] seed 脚本增加默认管理员创建
- [ ] 可选：注册页增加密码确认输入框（confirm password）
- [ ] 可选：忘记密码 / 重置密码流程（verification_codes.purpose 已预留 'reset_password'）
