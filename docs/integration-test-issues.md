# AgentHub 前后端联调问题分析与修复方案

> 分析日期: 2026-05-24 | 分支: main

---

## 问题总览

| # | 严重度 | 问题 | 影响 | 根因文件 |
|---|--------|------|------|----------|
| 1 | **Critical** | DELETE 会话返回 500 | 用户无法删除会话 | `services/conversation.py` |
| 2 | **Critical** | 创建会话使用无效 Agent ID | 前端完全无法创建会话 | `components/layout/Sidebar.tsx` |
| 3 | **High** | Mock SSE 流发送虚假 error 事件 | 控制台错误日志污染 | `api/v1/conversations.py` |
| 4 | **High** | 错误响应 message 字段显示 "success" | 前端错误处理混乱 | `core/middleware.py` |
| 5 | **Medium** | Agent.avatarUrl 类型应为 `string | null` | TypeScript 类型不安全 | `types/agent.ts` |
| 6 | **Medium** | 缺少 RequestValidationError 处理器 | 422 错误详情被嵌套在 data.detail | `core/exceptions.py`, `main.py` |
| 7 | **Low** | agent_status 使用 task_id 而非 message_id | 字段命名不一致 | `api/v1/conversations.py`, `adapters/adk_to_sse.py` |

---

## 问题详细分析

### 问题 1: DELETE 会话返回 500 — 级联删除缺失

**根因分析:**

`ConversationService.delete_conversation` 只删除了 `conversation_participants` 和 `conversation`，但没有删除其他引用该 conversation 的记录。

PostgreSQL 错误日志:
```
ERROR: update or delete on table "conversations" violates foreign key constraint
  "messages_conversation_id_fkey" on table "messages"
DETAIL: Key (id) is still referenced from table "messages".
```

**完整的 FK 依赖链 (删除顺序必须是反序):**

```
conversations (被以下表引用)
  ├── conversation_participants (FK → conversations.id)
  ├── messages (FK → conversations.id)
  │     ├── message_mentions (FK → messages.id)
  │     ├── message_pins (FK → messages.id, conversations.id)
  │     └── artifacts (FK → messages.id, conversations.id)
  └── orchestrator_tasks (FK → conversations.id)
        └── orchestrator_subtasks (FK → orchestrator_tasks.id, messages.id)
```

**修复方案:**

在 `ConversationService.delete_conversation` 中按以下顺序删除:
1. `orchestrator_subtasks` (FK → orchestrator_tasks, messages)
2. `orchestrator_tasks` (FK → conversations, messages)
3. `message_mentions` (FK → messages)
4. `artifacts` (FK → messages, conversations)
5. `message_pins` (FK → conversations, messages)
6. `messages` (FK → conversations)
7. `conversation_participants` (FK → conversations)
8. `conversations`

---

### 问题 2: 创建会话使用无效 Agent ID — 硬编码字符串代替 UUID

**根因分析:**

`Sidebar.tsx:57`:
```typescript
onCreateConversation(newTitle.trim(), "single", ["agent-claude-code"]);
```

`"agent-claude-code"` 是语义化的假 ID，不是合法 UUID。后端 Pydantic 验证 `List[UUID]` 时触发 422:
```
Input should be a valid UUID, invalid character: found `g` at 2
```

**修复方案:**

前端需要从实际 Agent 列表获取真实 UUID。修改 `Sidebar` 接收 agents 数据，从列表中查找默认 agent。

或简化为: 不传 `agentIds`（首次创建时），由后端设置默认 agent。

---

### 问题 3: Mock SSE 流始终发送 error 事件

**根因分析:**

`conversations.py:90-94` 在 `_mock_sse_stream` 中，error 事件被硬编码为正常流的一部分:

```python
events.append(("error", build_payload({
    "code": "MOCK_ERROR",
    "message": "This is a mock error event.",
    "retryable": False,
})))
```

前端 `ChatArea.tsx:109-112` 的 `onError` 回调会将每条流都以错误记录:
```typescript
onError: (data: SSEError) => {
    console.error("SSE 错误:", data.message);
    setIsStreaming(false);
},
```

**修复方案:**

从 mock SSE 流中移除 error 事件。如需要测试 error 事件处理，应通过单独的测试端点或条件参数触发。

---

### 问题 4: 错误响应包装 "success" 消息

**根因分析:**

`ResponseWrapperMiddleware` 无条件设置 `"message": "success"`:

```python
wrapped = {"code": response.status_code, "data": data, "message": "success"}
```

对于 422 验证错误:
- FastAPI 返回 `{"detail": [...]}` (状态码 422)
- 中间件包装为 `{"code": 422, "data": {"detail": [...]}, "message": "success"}`

问题:
1. `message` 显示 "success" 但 `code` 是 422
2. 错误详情被嵌套在 `data.detail` 而非 `message`
3. 这与自定义异常处理器格式不一致 (`http_exception_handler` 把错误信息放在 `message` 字段)

**修复方案:**

根据 HTTP 状态码设置合适的消息。同时添加 `RequestValidationError` 的异常处理器，使格式与其他异常一致。

---

### 问题 5: Agent 类型 avatarUrl 缺少 null

**根因分析:**

后端 Agent 模型 `avatar_url: Mapped[str] = mapped_column(String(500), nullable=True)` 可为 NULL，API 返回 `"avatarUrl": null`。

前端类型:
```typescript
// types/agent.ts
export interface Agent {
  avatarUrl: string;  // 应为 string | null
}
```

**修复方案:**

将 `avatarUrl` 类型改为 `string | null`。

---

### 问题 6: 缺少 RequestValidationError 处理器

**根因分析:**

FastAPI 内置的 `RequestValidationError` 处理器返回:
```json
{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}
```

这个格式经过 `ResponseWrapperMiddleware` 后被包装为:
```json
{"code": 422, "data": {"detail": [...]}, "message": "success"}
```

而自定义的 `http_exception_handler` 返回:
```json
{"code": 404, "data": null, "message": "Not Found"}
```

两者格式不一致。前端处理错误时需要兼容两种不同的数据位置。

**修复方案:**

添加 `RequestValidationError` 异常处理器，将其转换为统一格式:
```json
{"code": 422, "data": null, "message": "Validation error: <详情>"}
```

---

### 问题 7: agent_status 事件使用 task_id 而非 message_id

**根因分析:**

Mock SSE 和 ADK SSE 的 `agent_status` 事件使用 `task_id` 作为消息标识符:
```python
("agent_status", {
    "task_id": message_id,  # 其他事件用 message_id
    ...
})
```

而 `message_start`、`token`、`artifact`、`message_end`、`error` 事件都使用 `message_id`。虽然前端 `SSEAgentStatus` 类型也定义了 `task_id`，暂未使用该事件，但命名不一致增加维护成本。

**修复方案:**

统一使用 `message_id`，或在前端文档中明确 `task_id === message_id` 的语义关系。

---

## 修复计划

### Phase 1: Critical (阻塞性问题)

1. **修复 DELETE 会话** — 在 `ConversationService.delete_conversation` 中添加级联删除逻辑
2. **修复创建会话** — 修正 Sidebar 中的硬编码 agent ID

### Phase 2: High (用户体验)

3. **移除 Mock SSE 虚假错误** — 从 `_mock_sse_stream` 中删除 error 事件
4. **修复中间件错误消息** — 根据状态码设置正确的 message

### Phase 3: Medium (类型与一致性)

5. **修复 avatarUrl 类型** — 改为 `string | null`
6. **添加 RequestValidationError 处理器** — 统一验证错误格式

### Phase 4: Low (语义一致性)

7. **统一 agent_status 字段命名** — 改用 `message_id`

---

## 附加发现: 架构层面

以下不是 bug，但值得后续关注:

### A. Mock SSE 响应不持久化
Mock SSE 生成的 Agent 响应仅存在于流式传输期间（Zustand store），`onMessageEnd` 触发 `invalidateQueries` 重新获取后，mock 响应从 UI 中消失。真实 ADK 模式同样需要实现 Agent 响应的数据库持久化。

### B. 乐观更新可能产生短暂重复
`ChatArea.handleSend` 先做乐观更新（prepend 假消息到 cache），SSE 结束后 invalidateQueries 重新获取。两个消息 ID 不同（`msg-opt-*` vs UUID），短暂时间内两者共存。React key 机制会自动处理，但切换时可能有视觉闪烁。

### C. ADK agent_status 状态值与前端类型不完全匹配
ADK translator 使用 "done"，前端类型定义为 `"queued" | "running" | "success" | "failed" | "timeout"`。两者不完全一致。
