# AgentHub 前后端接口契约

版本：v2.0 | 日期：2026-05-26 | 状态：前端已对齐，后端请按此实现

> 本文档整合了 `AgentHub-架构设计前端.md` 第 5-6 节、`AgentHub 响应格式与前后端对齐约定.md`、`orchestrator-api-contract.md` 的全部内容，并基于 P0/P1/P2 讨论新增了分支、task_hints、confirm_plan 等接口。

---

## 1. 通用约定

### 1.1 协议基础

| 项目 | 约定 |
|------|------|
| Base URL | `/api/v1` |
| 认证方式 | `Authorization: Bearer <token>` |
| Content-Type | `application/json`（REST）；`text/event-stream`（SSE） |
| 日期格式 | ISO 8601（`2026-05-26T10:00:00Z`） |

### 1.2 统一响应格式

```json
{
  "code": 200,
  "data": { ... },
  "message": "ok"
}
```

- 所有 REST JSON 响应均使用此格式
- `code >= 400` 时前端视为错误
- SSE 响应不包裹，直接发送事件流

### 1.3 分页格式

**标准分页（page/pageSize）：**
```json
{
  "code": 200,
  "data": {
    "list": [ ... ],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "message": "ok"
}
```

**游标分页（cursor，消息列表专用）：**
```json
{
  "code": 200,
  "data": {
    "items": [ ... ],
    "nextCursor": "msg-050",
    "hasMore": true
  },
  "message": "ok"
}
```

- 游标分页按 `created_at DESC` 排序（最新在前），前端负责 `.reverse()` 为 ASC 展示
- `nextCursor` 为下一页的游标值，最后一页为 `null`

### 1.4 字段命名

- Python 端 snake_case 存储
- JSON 端 camelCase 序列化（Pydantic `alias_generator=to_camel`）
- 输入同时接受 snake_case 和 camelCase（`populate_by_name=True`）

---

## 2. 会话 API

### 2.1 创建会话

```
POST /api/v1/conversations
```

**Request:**
```json
{
  "title": "实现登录页面",
  "type": "single",
  "agentIds": ["agent-claude-code"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 会话标题 |
| type | string | 是 | `"single"` 单聊 / `"group"` 群聊 |
| agentIds | string[] | 是 | 关联的 Agent ID 列表。单聊 1 个，群聊 >= 2 个 |

**Response:**
```json
{
  "code": 200,
  "data": {
    "id": "conv-1",
    "title": "实现登录页面",
    "type": "single",
    "ownerId": "user-1",
    "agentIds": ["agent-claude-code"],
    "isPinned": false,
    "isArchived": false,
    "lastActiveAt": "2026-05-26T15:00:00Z",
    "createdAt": "2026-05-26T15:00:00Z",
    "updatedAt": "2026-05-26T15:00:00Z"
  },
  "message": "ok"
}
```

### 2.2 获取会话列表

```
GET /api/v1/conversations?keyword=&archived=false&page=1&pageSize=20
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 否 | 标题模糊搜索 |
| archived | boolean | 否 | 是否只返回已归档（默认 false） |
| page | number | 否 | 页码（默认 1） |
| pageSize | number | 否 | 每页条数（默认 20） |

**Response:** 标准分页格式，`data.list` 为 Conversation[]

### 2.3 获取会话详情

```
GET /api/v1/conversations/{conversation_id}
```

**Response:** 标准格式，`data` 为 Conversation 对象

### 2.4 更新会话

```
PATCH /api/v1/conversations/{conversation_id}
```

**Request:** 支持部分更新，所有字段可选
```json
{
  "title": "新标题",
  "type": "group",
  "isPinned": true,
  "isArchived": false,
  "agentIds": ["agent-claude-code", "agent-codex"]
}
```

### 2.5 删除会话

```
DELETE /api/v1/conversations/{conversation_id}
```

**Response:** `{ "code": 200, "data": null, "message": "ok" }`

### 2.6 Pin/Unpin 消息

```
POST   /api/v1/conversations/{conversation_id}/pins
DELETE /api/v1/conversations/{conversation_id}/pins/{message_id}
```

**POST Request:**
```json
{ "message_id": "msg-001" }
```

### 2.7 会话分支 ⭐ 新增

```
POST /api/v1/conversations/{conversation_id}/branch
```

**Request:**
```json
{
  "source_message_id": "msg-branch-point",
  "title": "重构登录页面",
  "include_context": true,
  "include_artifacts": ["artifact-1"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| source_message_id | string | 是 | 分支起点的消息 ID |
| title | string | 是 | 新会话标题 |
| include_context | boolean | 否 | 是否携带上文所有消息（默认 true） |
| include_artifacts | string[] | 否 | 携带的产物 ID 列表 |

**Response:**
```json
{
  "code": 200,
  "data": {
    "conversation_id": "conv-new-001",
    "title": "重构登录页面",
    "context_length": 12,
    "created_at": "2026-05-26T16:00:00Z"
  },
  "message": "ok"
}
```

**后端行为：** 创建新会话，将 `source_message_id` 之前的所有消息复制/引用到新会话上下文窗口。

---

## 3. 消息 API

### 3.1 发送消息

```
POST /api/v1/conversations/{conversation_id}/messages
```

**Request:**
```json
{
  "content": "帮我写一个登录页面",
  "contentType": "text",
  "mentions": ["agent-claude-code", "agent-codex"],
  "parentMessageId": "msg-001",
  "mode": "auto_orchestrate",
  "task_hints": [
    { "agent_id": "agent-claude-code", "hint": "写登录页面组件" },
    { "agent_id": "agent-codex", "hint": "写对应 API 接口" }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | 是 | 消息文本（含 @mention 文本） |
| contentType | string | 否 | 默认 `"text"` |
| mentions | string[] | 否 | 被 @ 的 Agent ID 列表 |
| parentMessageId | string | 否 | 引用回复的目标消息 ID |
| mode | string | 否 | `"direct"` / `"auto_orchestrate"` / `"confirm_plan"` |
| task_hints | object[] | 否 | ⭐ 新增：@Agent + 指令关联提示 |
| plan_id | string | 条件 | ⭐ 新增：mode=`"confirm_plan"` 时必填，要确认的计划消息 ID |
| plan | object[] | 条件 | ⭐ 新增：mode=`"confirm_plan"` 时必填，调整后的子任务列表 |

**mode 取值说明：**

| mode | 场景 | 后端行为 |
|------|------|---------|
| `direct` | 单聊，直接发给 Agent | 不经过 Orchestrator，直接调用 Agent |
| `auto_orchestrate` | 群聊，触发自动编排 | Orchestrator 拆解任务 → 返回计划 → 分派执行 |
| `confirm_plan` | ⭐ 用户确认/调整计划 | 按确认后的 plan 执行子任务 |

**task_hints 子结构：**
```json
{
  "agent_id": "agent-claude-code",
  "hint": "写登录页面组件"
}
```

**confirm_plan 时的 plan 子结构：**
```json
{
  "subtask_id": "sub-1",
  "agent_id": "agent-claude-code",
  "instruction": "编写登录页面 React 组件"
}
```

**前端行为：** 发送后立即建立 SSE 连接接收回复，不等 REST 响应。

### 3.2 获取消息历史

```
GET /api/v1/conversations/{conversation_id}/messages?cursor=&limit=50
```

**Response:** 游标分页格式，`data.items` 为 Message[]

**Message 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 消息唯一标识 |
| conversationId | string | 所属会话 |
| senderType | string | `"user"` / `"agent"` / `"orchestrator"` / `"system"` |
| senderId | string? | 发送者 ID |
| senderName | string? | 发送者显示名 |
| contentType | string | `"text"` |
| content | string | 文本内容（markdown 格式） |
| artifacts | Artifact[] | ⚠️ 必须内联返回，前端不做二次查询 |
| status | string | `"pending"` / `"streaming"` / `"done"` / `"failed"` |
| parentMessageId | string? | 引用回复目标 |
| meta | object? | ⭐ 扩展字段：plan / summary / agent_config |
| createdAt | string | ISO 8601 |
| updatedAt | string | ISO 8601 |

### 3.3 重新生成消息

```
POST /api/v1/messages/{message_id}/regenerate
```

**Response:** 同发送消息

### 3.4 获取消息产物

```
GET /api/v1/messages/{message_id}/artifacts
```

**Response:** `data: Artifact[]`

---

## 4. Agent API

### 4.1 获取 Agent 列表

```
GET /api/v1/agents
```

**Response:** `data: Agent[]`

**Agent 字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| name | string | 显示名称 |
| avatarUrl | string | 头像 URL（空字符串兜底，不可 null） |
| provider | string | `"anthropic"` / `"litellm"` / `"custom"` |
| model | string | 模型标识（如 `"claude-sonnet-4-6"`） |
| capabilities | string[] | 能力标签：coding / docs / ui / reasoning / testing / review |
| systemPrompt | string? | System Prompt |
| toolConfig | object | `{ tools: string[] }` |
| isBuiltin | boolean | 是否为内置 Agent |
| isActive | boolean | 是否启用 |
| createdAt | string | ISO 8601 |
| updatedAt | string | ISO 8601 |

### 4.2 获取 Agent 详情

```
GET /api/v1/agents/{agent_id}
```

### 4.3 创建 Agent

```
POST /api/v1/agents
```

**Request:**
```json
{
  "name": "前端代码助手",
  "avatarUrl": "",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "systemPrompt": "你是一个前端工程助手...",
  "capabilities": ["coding", "ui"],
  "toolConfig": { "tools": ["read_file", "write_file"] }
}
```

### 4.4 更新 Agent

```
PATCH /api/v1/agents/{agent_id}
```

支持部分更新，所有字段可选。

### 4.5 删除 Agent ⭐ 新增

```
DELETE /api/v1/agents/{agent_id}
```

**Response:** `{ "code": 200, "data": null, "message": "ok" }`

### 4.6 验证 Agent 配置 ⭐ 新增

```
POST /api/v1/agents/verify
```

**Request:**
```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "systemPrompt": "你是..."
}
```

**Response:**
```json
{
  "code": 200,
  "data": { "status": "ok", "message": "模型连接正常" },
  "message": "ok"
}
```

---

## 5. Artifact（产物）数据模型

```json
{
  "id": "art-001",
  "artifactType": "code",
  "title": "LoginPage.tsx",
  "content": {
    "fileName": "LoginPage.tsx",
    "language": "tsx",
    "code": "import { useState } from 'react';..."
  },
  "storageKey": null,
  "mimeType": null,
  "version": 1,
  "createdAt": "2026-05-26T15:00:00Z"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| artifactType | string | `"code"` / `"diff"` / `"preview"` / `"file"` / `"deploy_status"` |
| title | string? | 产物标题/文件名 |
| content | object | 按 artifactType 不同结构（见下） |
| storageKey | string? | 对象存储 key |
| mimeType | string? | MIME 类型 |
| version | number | 版本号 |
| createdAt | string | ISO 8601 |

### content 按类型结构

**code:**
```json
{ "fileName": "LoginPage.tsx", "language": "tsx", "code": "..." }
```

**diff:**
```json
{ "fileName": "middleware.ts", "language": "typescript", "oldCode": "...", "newCode": "..." }
```

**preview:**
```json
{ "url": "https://...", "title": "电商首页", "previewType": "web" }
```
`previewType` 取值：`"web"` / `"doc"` / `"ppt"`

**file:**
```json
{ "fileName": "report.pdf", "fileUrl": "https://...", "fileType": "pdf", "fileSize": 102400 }
```

**deploy_status:**
```json
{ "status": "deployed", "url": "https://..." }
```
`status` 取值：`"building"` / `"deployed"` / `"failed"`

---

## 6. SSE 流式接口

### 6.1 建立连接

```
GET /api/v1/conversations/{conversation_id}/stream
```

**请求头：**
```
Accept: text/event-stream
Authorization: Bearer <token>
```

### 6.2 六种 SSE 事件

#### message_start

```
event: message_start
data: {
  "version": "v1",
  "event_id": "evt-001",
  "conversation_id": "conv-1",
  "message_id": "msg-001",
  "sender": {
    "type": "agent",
    "id": "agent-claude-code",
    "name": "Claude Code"
  },
  "meta": { ... },
  "timestamp": "2026-05-26T15:00:00Z"
}
```

`sender.type` 取值：`"user"` / `"agent"` / `"orchestrator"` / `"system"`

`meta` 为扩展字段：

**普通 Agent 消息/Orchestrator 执行消息：**
```json
{
  "subtask_id": "sub-1",
  "plan_id": "msg-plan-001"
}
```

**Orchestrator 计划消息（⭐ 新增）：**
```json
{
  "plan": [
    {
      "subtask_id": "sub-1",
      "agent": { "id": "agent-claude-code", "name": "Claude Code" },
      "instruction": "编写登录页面 React 组件",
      "priority": 1
    }
  ]
}
```

**Agent 创建配置预览：**
```json
{
  "plan": [
    {
      "subtask_id": "create-agent-001",
      "type": "create_agent",
      "agent_config": {
        "name": "前端测试助手",
        "model": "claude-haiku-4-5",
        "provider": "anthropic",
        "capabilities": ["testing", "coding"],
        "tools": ["read_file", "execute_command"],
        "system_prompt": "..."
      }
    }
  ]
}
```

**Orchestrator 汇总消息（⭐ 新增）：**
```json
{
  "plan_id": "msg-plan-001",
  "summary": {
    "total": 2,
    "success": 1,
    "failed": 1,
    "results": [
      {
        "subtask_id": "sub-1",
        "status": "success",
        "message_id": "msg-exec-001"
      },
      {
        "subtask_id": "sub-2",
        "status": "failed",
        "message_id": "msg-exec-002",
        "error": "Codex 超时"
      }
    ]
  }
}
```

#### token

```
event: token
data: {
  "version": "v1",
  "event_id": "evt-002",
  "conversation_id": "conv-1",
  "message_id": "msg-001",
  "delta": "你好，我来帮你",
  "index": 0,
  "timestamp": "2026-05-26T15:00:01Z"
}
```

#### artifact

```
event: artifact
data: {
  "version": "v1",
  "event_id": "evt-003",
  "conversation_id": "conv-1",
  "message_id": "msg-001",
  "artifact": {
    "id": "art-001",
    "artifactType": "code",
    "title": "LoginPage.tsx",
    "content": { "language": "tsx", "code": "..." },
    "storageKey": null,
    "mimeType": null,
    "version": 1,
    "createdAt": "2026-05-26T15:00:05Z"
  },
  "timestamp": "2026-05-26T15:00:05Z"
}
```

⚠️ SSE artifact 事件中必须使用 `artifactType`（camelCase），与 REST 保持一致。

#### agent_status

```
event: agent_status
data: {
  "version": "v1",
  "event_id": "evt-004",
  "conversation_id": "conv-1",
  "message_id": "msg-exec-001",
  "task_id": "msg-plan-001",
  "subtask_id": "sub-1",
  "agent": { "id": "agent-claude-code", "name": "Claude Code" },
  "status": "running",
  "progress": 60,
  "timestamp": "2026-05-26T15:00:03Z"
}
```

`status` 取值：`"queued"` / `"running"` / `"success"` / `"failed"` / `"timeout"`

#### thinking ⭐ 新增

```
event: thinking
data: {
  "version": "v1",
  "event_id": "evt-005",
  "conversation_id": "conv-1",
  "message_id": "msg-001",
  "phase": "thought",
  "text": "需要先分析项目结构...",
  "tool_name": "read_file",
  "status": "running",
  "step_index": 1,
  "timestamp": "2026-05-26T15:00:02Z"
}
```

`phase` 取值：`"thought"` / `"action"` / `"observation"`
`status` 取值：`"pending"` / `"running"` / `"done"` / `"error"`

#### message_end

```
event: message_end
data: {
  "version": "v1",
  "event_id": "evt-006",
  "conversation_id": "conv-1",
  "message_id": "msg-001",
  "finish_reason": "completed",
  "usage": {
    "input_tokens": 1200,
    "output_tokens": 480
  },
  "timestamp": "2026-05-26T15:00:10Z"
}
```

`finish_reason` 取值：`"completed"` / `"stopped"` / `"plan_draft"` / `"error"`

⚠️ `usage` 字段必须包含，用于前端 Token 用量统计。

#### error

```
event: error
data: {
  "version": "v1",
  "event_id": "evt-007",
  "conversation_id": "conv-1",
  "message_id": "msg-001",
  "code": "AGENT_TIMEOUT",
  "message": "Agent 执行超时，请重试",
  "retryable": true,
  "timestamp": "2026-05-26T15:00:10Z"
}
```

### 6.3 群聊 Orchestrator 完整事件时序

```
message_start (orchestrator, plan)
  → token × N
  → message_end (finish_reason: "plan_draft")

[用户确认 → POST /messages mode: confirm_plan]

message_start (agent, subtask_1)
  → token ... → artifact ... → message_end

message_start (agent, subtask_2)          ← 可与 subtask_1 交织
  agent_status (subtask_1, running, 60%)
  → token ... → message_end

agent_status (subtask_1, success)
agent_status (subtask_2, failed)

message_start (orchestrator, summary)
  → token × N
  → message_end (finish_reason: "completed")
```

### 6.4 单聊（direct）事件时序

```
POST /messages (mode: "direct")
  → message_start (agent)
    → token × N
    → (artifact ...)
    → message_end (finish_reason: "completed" | "stopped")
```

---

## 7. 部署 API（P2）

### 7.1 触发部署

```
POST /api/v1/deployments
```

**Request:**
```json
{
  "conversation_id": "conv-1",
  "artifact_id": "art-001",
  "provider": "vercel"
}
```

### 7.2 查询部署状态

```
GET /api/v1/deployments/{deployment_id}
```

---

## 8. 前端类型定义（供后端参考）

### 8.1 Conversation
```typescript
interface Conversation {
  id: string;
  title: string;
  type: "single" | "group";
  ownerId: string;
  agentIds: string[];
  isPinned: boolean;
  isArchived: boolean;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}
```

### 8.2 Message
```typescript
interface Message {
  id: string;
  conversationId: string;
  senderType: "user" | "agent" | "system" | "orchestrator";
  senderId?: string;
  senderName?: string;
  parentMessageId?: string;
  contentType: string;
  content: string;
  artifacts: Artifact[];
  status: "pending" | "streaming" | "done" | "failed";
  meta?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
```

### 8.3 Agent
```typescript
interface Agent {
  id: string;
  name: string;
  avatarUrl: string;
  provider: string;
  model: string;
  systemPrompt?: string;
  capabilities: string[];
  toolConfig: Record<string, unknown>;
  isBuiltin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 8.4 Artifact
```typescript
interface Artifact {
  id: string;
  artifactType: "code" | "diff" | "preview" | "file" | "deploy_status";
  title?: string;
  content: Record<string, unknown>;
  storageKey?: string | null;
  mimeType?: string | null;
  version: number;
  createdAt: string;
}
```

---

## 9. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v2.0 | 2026-05-26 | 整合所有接口：新增分支 API、confirm_plan mode、task_hints、verify Agent、DELETE Agent、Orchestrator 完整契约、thinking SSE 事件、message_start.meta 扩展、message_end.usage |
| v1.0 | 2026-05-24 | 初版：基础 REST + SSE 协议 |
