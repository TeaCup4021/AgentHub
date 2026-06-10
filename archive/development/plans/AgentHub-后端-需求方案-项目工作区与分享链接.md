# 后端需求方案说明书

**日期**: 2026-05-27 | **写给**: 后端同学

---

## 一、新增数据库表

### 1. projects 表

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id),
  default_agent_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. conversations 表加字段

```sql
ALTER TABLE conversations ADD COLUMN project_id UUID REFERENCES projects(id);
-- 允许 NULL（不归属项目的对话兼容现有数据）
```

### 3. shared_conversations 表（对话分享）

```sql
CREATE TABLE shared_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id VARCHAR(12) UNIQUE NOT NULL,     -- 短链接 ID，如 "abc123"
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  password_hash VARCHAR(255),               -- 可选密码保护
  expires_at TIMESTAMPTZ,                   -- 可选过期时间
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4. memory_entries 表（记忆管理，后续）

```sql
CREATE TABLE memory_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  key VARCHAR(200) NOT NULL,                -- 如 "tech_stack", "code_style"
  value TEXT NOT NULL,                      -- 记忆内容
  source VARCHAR(50) DEFAULT 'manual',      -- manual / auto_extracted
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 二、新增 API 端点

### 项目 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/projects` | 创建项目 |
| `GET` | `/api/v1/projects` | 列出用户的所有项目 |
| `PATCH` | `/api/v1/projects/:id` | 更新项目 |
| `DELETE` | `/api/v1/projects/:id` | 删除项目（对话不删，project_id 变 NULL） |

**POST /projects 请求体：**
```json
{
  "name": "React Dashboard",
  "description": "前端管理后台项目",
  "default_agent_ids": ["agent-claude-code"]
}
```

**GET /projects 响应：**
```json
{
  "code": 200,
  "data": [
    {
      "id": "proj-001",
      "name": "React Dashboard",
      "description": "前端管理后台项目",
      "default_agent_ids": ["agent-claude-code"],
      "created_at": "2026-05-27T10:00:00Z",
      "updated_at": "2026-05-27T10:00:00Z"
    }
  ]
}
```

### 对话分享

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/conversations/:id/share` | 生成分享链接 |
| `GET` | `/api/v1/share/:share_id` | 查看分享的对话（只读） |
| `DELETE` | `/api/v1/conversations/:id/share` | 取消分享 |

**POST /share 请求体：**
```json
{
  "password": "1234",       // 可选
  "expires_in_hours": 168   // 可选，默认 7 天
}
```

**POST /share 响应：**
```json
{
  "code": 200,
  "data": {
    "share_id": "abc123",
    "url": "https://agenthub.example.com/share/abc123",
    "expires_at": "2026-06-03T10:00:00Z"
  }
}
```

**GET /share/:share_id 响应（无需登录）：**
```json
{
  "code": 200,
  "data": {
    "conversation": {
      "title": "用 React 写一个登录页面",
      "type": "single"
    },
    "messages": [
      {
        "sender_type": "user",
        "sender_name": "用户",
        "content": "用 React 写一个带表单验证的登录页面",
        "created_at": "2026-05-21T14:00:00Z"
      }
    ]
  }
}
```

### 已有端点的小改动

- `GET /conversations` 加可选 query param `?project_id=xxx`，过滤某项目下的对话
- `POST /conversations` 创建对话时支持传 `project_id`（可选）

---

## 三、已有 API 状态

以下 16 个端点前端已对齐，无需改动：

```
GET    /api/v1/health
GET    /api/v1/conversations
POST   /api/v1/conversations
GET    /api/v1/conversations/:id
PATCH  /api/v1/conversations/:id
DELETE /api/v1/conversations/:id
POST   /api/v1/conversations/:id/pins
DELETE /api/v1/conversations/:id/pins/:message_id
GET    /api/v1/conversations/:id/stream       (SSE)
GET    /api/v1/agents
GET    /api/v1/agents/:id
POST   /api/v1/agents
PATCH  /api/v1/agents/:id
DELETE /api/v1/agents/:id
POST   /api/v1/agents/verify
GET    /api/v1/conversations/:id/messages
POST   /api/v1/conversations/:id/messages
POST   /api/v1/messages/:id/regenerate
GET    /api/v1/messages/:id/artifacts
```

### SSE 事件契约（已约定）

7 种标准事件：`message_start` / `token` / `artifact` / `agent_status` / `thinking` / `message_end` / `error`

详细契约见 `docs/specs/2026-05-26-orchestrator-api-contract.md`

### 认证

前端从 `localStorage.getItem("token")` 读取，作为 `Authorization: Bearer xxx` 发送。当前后端 mock 了一个硬编码 user_id（`00000000-0000-0000-0000-000000000001`）。

---

## 四、优先级建议

| 优先级 | 内容 | 原因 |
|--------|------|------|
| P0 | 认证系统 | 目前是硬编码 mock，联调前必须有 |
| P1 | projects 表 + 4 个端点 | 前端项目工作区功能依赖 |
| P1 | conversations 加 project_id | 同上 |
| P2 | shared_conversations 表 | 对话分享功能 |
| P3 | memory_entries 表 | 记忆管理，可后续迭代 |
