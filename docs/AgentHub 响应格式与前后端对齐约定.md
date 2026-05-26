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

## 14) 消息发送失败状态（新增于 2026-05-26 P0 前端）

- **`status: "failed"`**：前端在消息发送 API 报错时，将乐观插入的消息标记为 `failed`，渲染红色气泡 + "发送失败" 标签。
- 后端已定义的 `MessageStatus` 包含 `"failed"`，无需新增。

## 15) SSE 流式中断处理（新增于 2026-05-26 P0 前端）

- **中断标记**：SSE 连接断开时，前端会 `finalizeStreaming` 将已收到的部分内容写入消息缓存，并期望后端在持久化该消息时保留已传输的部分内容。
- **finish_reason 扩展**：建议后端在 `message_end.finish_reason` 中支持 `"interrupted"` 值，前端用于判断是否需要显示"（响应中断）"标记。当前 `finish_reason` 已有 `"completed"` 和 `"plan_draft"`。
- **连接错误触发**：前端 SSE `fetch` 的 `.catch` 路径会触发 `onConnectionError`，启动指数退避重试（1s/2s/4s，共 3 次）。后端 SSE 端点异常时应返回非 200 状态码以触发此路径。

## 16) Mock 测试辅助（新增于 2026-05-26 P0 前端）

- 前端 Mock 通过 `localStorage.setItem("mock_fail_mode", "<type>")` 模拟失败场景：
  - `"message"` — POST /messages 返回 500
  - `"delete"` — DELETE /conversations/:id 返回 500
  - `"agent"` — POST /agents 返回 500
  - `"sse_disconnect"` — SSE 流在中途触发 onConnectionError
- 均为前端本地模拟，不影响后端实现。后端开发时可参考这些场景做异常测试。

## 17) Agent 删除接口（新增于 2026-05-27 P1 前端）

- **前端调用**：`DELETE /api/v1/agents/{agent_id}`
- **前端代码**：`lib/api.ts` 的 `agentApi.delete(id)`，返回 `ApiResponse<void>`
- **后端现状**：`backend/app/api/v1/agents.py` 当前仅有 GET/POST/PATCH/verify 路由，**缺少 DELETE 端点**
- **期望实现**：标准 REST 删除，返回 `{ code: 200, data: null, message: "ok" }`
- **前端使用场景**：AgentManageModal 中删除 Agent，使用 `useDeleteAgent`（乐观更新 + 失败回滚）

## 18) Token 用量 agentName 字段（新增于 2026-05-27 P1 前端）

- **前端 Store**：`tokenUsageStore.ts` 的 `TokenUsage` 和 `TokenEvent` 均新增 `agentName: string` 字段
- **数据来源**：前端本地传入（调用 `addUsage` 时从当前消息 sender.name 获取），不从后端 API 获取
- **后端影响**：无。当前 `message_end.usage` 仅含 `input_tokens / output_tokens`，前端自行补充 agentName
- **未来对齐**：若后端在 `message_end.usage` 中增加 `agent_name` 字段，前端可直接消费

---

## 来源

- `AgentHub-后端开发20天实施计划.md`
- `vibeCodingPlan/AgentHub-后端A-Day1-业务基础设施.md`
- `backend/app/core/middleware.py`
- `backend/app/schemas/base.py`
- `backend/app/schemas/message.py`
- `agenthub-web/docs/specs/2026-05-24-api-alignment-round2.md`
- `agenthub-web/src/types/chat.ts`
- `vibeCodingPlan/AgentHub-前端-Day01-P0核心体验链路.md`
- `vibeCodingSummary/2026-05-26-p0-core-experience.md`
- `vibeCodingPlan/AgentHub-前端-Day02-完整版-Semi-Design+P0+P1.md`（本次）
- `vibeCodingSummary/2026-05-27-semi-design-p0-p1-complete.md`（本次）
- `agenthub-web/src/stores/tokenUsageStore.ts`
- `agenthub-web/src/lib/api.ts`
- `backend/app/api/v1/agents.py`
