# AgentHub 响应格式与前后端对齐约定

基于后端实现与前端类型/对齐文档整理，聚焦已声明的响应格式、字段规范与对齐规则。

## 1) 统一 API 响应包裹

- **响应外层**：所有 REST JSON 响应统一为 `{ code: number, data: T, message: string }`。
- **中间件行为**：仅包裹 JSON 响应；SSE (`text/event-stream`) 与非 JSON 响应跳过；已是统一格式则不二次包裹。

## 2) 字段命名与序列化

- **Python 端 snake_case，JSON 端 camelCase**：后端 schema 用 `snake_case`，通过 Pydantic `alias_generator=to_camel` 序列化为 `camelCase`。
- **输入兼容**：`populate_by_name=True` 同时接受 `snake_case` 与 `camelCase`。

## 3) 标准列表分页（page/pageSize）

- **通用列表格式**：`{ list: T[], total: number, page: number, pageSize: number }`。
- **后端模型**：`backend/app/schemas/base.py` 的 `Page` 模型定义 `list`、`total`、`page`、`page_size`（序列化为 `pageSize`）。

## 4) 消息列表分页（cursor）

- **游标分页**用于 `GET /conversations/{id}/messages`：
  - 数据格式：`{ items: Message[], nextCursor: string | null, hasMore: boolean }`。
  - 后端模型：`MessageListResponse`（字段 `items`、`next_cursor`、`has_more`，序列化为 `nextCursor`、`hasMore`）。

## 5) 日期时间格式

- **ISO 8601** 统一输出（如 `2026-05-20T10:00:00Z`）。

## 6) 消息与发送者对齐

- **发送者类型**：`senderType` 取值 `"user" | "agent" | "system" | "orchestrator"`。
- **消息状态**：`status` 取值 `"pending" | "streaming" | "done" | "failed"`。
- **发送者名称**：前端 `senderName?: string` 可选，后端 `sender_name` 为 `Optional[str]`。

## 7) 消息内联产物

- **内联 artifacts**：`GET /messages` 每条 message 直接包含 `artifacts[]`，前端无需二次查询。
- **产物字段**（REST 对齐）：`id`, `artifactType`, `title?`, `content`, `storageKey?`, `mimeType?`, `version`, `createdAt`。

## 8) 产物字段命名（REST + SSE）

- **字段名统一**：`artifactType`（camelCase）为标准字段名，对应后端 `artifact_type` 的序列化结果。
- **SSE 对齐**：SSE `artifact` 事件也必须使用 `artifactType`，保持与 REST 一致。

## 9) 会话 agentIds

- **会话返回**：`agentIds: string[]` 由 participants 聚合得出，前端无需感知 participants 表。

## 10) 查询参数命名

- **前端查询参数 camelCase**（如 `pageSize`）。
- **后端需加 alias**：`alias_generator` 仅对 body 生效，Query 参数需显式 `alias`。

## 11) avatarUrl 非空约定

- **前端非可选**：`avatarUrl: string`。
- **后端默认值**：`AgentBase.avatar_url` 默认 `""`，避免 null。

## 12) 发送消息请求对齐

- **创建消息字段**：`content`（必填）、`contentType`（可选，默认 `"text"`）、`mentions?`、`parentMessageId?`、`mode?`。
- **mode 预留**：`mode?: "auto_orchestrate" | "direct"` 为群聊预留；后端可接受但不一定启用行为。

## 13) SSE 协议对齐

- **6 类 SSE 事件**：`message_start`, `token`, `artifact`, `agent_status`, `message_end`, `error`。
- **前端事件结构**：包含 `version`, `event_id`, `conversation_id`, `message_id` 与 ISO 时间戳等字段。

## 来源

- `AgentHub-后端开发20天实施计划.md`
- `vibeCodingPlan/AgentHub-后端A-Day1-业务基础设施.md`
- `backend/app/core/middleware.py`
- `backend/app/schemas/base.py`
- `backend/app/schemas/message.py`
- `agenthub-web/docs/specs/2026-05-24-api-alignment-round2.md`
- `agenthub-web/src/types/chat.ts`
