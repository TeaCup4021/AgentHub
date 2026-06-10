# API 设计规范

## 统一响应

```json
{
  "code": 200,
  "data": <T> | null,
  "message": "success"
}
```

- 所有 JSON 响应由 `ResponseWrapperMiddleware` 自动包装
- SSE 端点（text/event-stream）**不**经过此包装
- 错误响应：`data` 为 `null`，`message` 为错误描述

## 分页

```json
{
  "list": <T[]>,
  "total": 0,
  "page": 1,
  "pageSize": 10
}
```

查询参数：`?page=1&pageSize=10`

## 游标分页（消息列表）

```json
{
  "items": <Message[]>,
  "nextCursor": "2026-06-04T10:00:00.000000+00:00",
  "hasMore": false
}
```

查询参数：`?cursor=<iso_timestamp>&limit=50`

## 路由结构

| 前缀 | 用途 |
|------|------|
| `GET /api/v1/health` | 健康检查 |
| `POST/PATCH/DELETE /api/v1/auth/*` | 认证 |
| `GET/POST /api/v1/agents` | Agent 管理 |
| `GET/POST/PATCH/DELETE /api/v1/conversations` | 对话 CRUD |
| `GET/POST /api/v1/conversations/{id}/messages` | 消息 |
| `GET /api/v1/conversations/{id}/stream` | SSE 流 |
| `POST/DELETE /api/v1/conversations/{id}/pins` | 钉选 |
| `POST /api/v1/messages/{id}/regenerate` | 重新生成 |
| `GET /api/v1/orchestrator/tasks/{id}/dag` | DAG 可视化 |
| `GET/POST/PATCH/DELETE /api/v1/projects` | 项目管理 |
| `POST /api/v1/files/upload` | 文件上传 |

## 消息发送（核心端点）

`POST /api/v1/conversations/{conv_id}/messages`

### 请求体

```json
{
  "content": "string",
  "contentType": "text",
  "mentions": ["agent-uuid"],
  "parentMessageId": "uuid",
  "mode": "auto_orchestrate",
  "plannerAgentId": "uuid"
}
```

`mode` 取值：`auto_orchestrate`（触发编排）、`direct`（直接回复）、`refine_plan`（修改计划）、`confirm_plan`（确认计划）

## SSE 流端点

`GET /api/v1/conversations/{conv_id}/stream`

查询参数：`?prompt=...&orchestrateMode=auto_orchestrate&plannerAgentId=...`

## 认证

- JWT Bearer Token，通过 `Authorization: Bearer <token>` 头传递
- 自动 refresh 流程：前端 `axios` interceptor 拦截 401，用 `refresh_token` 获取新 token
- 两个 mock: `get_current_user_id()` 当前返回固定 UUID `00000000-0000-0000-0000-000000000001`

## 命名对齐

| 层 | 风格 | 示例 |
|----|------|------|
| Python 代码 | snake_case | `agent_ids` |
| JSON 请求/响应 | camelCase | `agentIds` |
| URL 路径 | kebab-case | `conversations/{id}/stream` |
| URL 查询参数 | camelCase | `?pageSize=10&plannerAgentId=xxx` |
