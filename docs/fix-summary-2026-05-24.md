# AgentHub 前后端联调问题修复记录

> 日期: 2026-05-24 | 分支: main

---

## 修复概览

| # | 严重度 | 问题 | 修复文件 |
|---|--------|------|----------|
| 1 | Critical | DELETE 会话返回 500 — 缺少级联删除 | `backend/app/services/conversation.py` |
| 2 | Critical | 创建会话使用无效 Agent ID | `agenthub-web/src/components/layout/Sidebar.tsx` |
| 3 | High | Mock SSE 流发送虚假 error 事件 | `backend/app/api/v1/conversations.py` |
| 4 | High | 错误响应 message 显示 "success" | `backend/app/core/middleware.py` |
| 5 | Medium | avatarUrl 类型错误 | `agenthub-web/src/types/agent.ts` |
| 6 | Medium | 缺少 RequestValidationError 处理器 | `backend/app/core/exceptions.py`, `main.py` |
| 7 | Low | agent_status 使用 task_id 而非 message_id | `conversations.py`, `adk_to_sse.py`, `chat.ts` |

---

## 详细变更

### 1. DELETE 会话级联删除 (`backend/app/services/conversation.py`)

**问题:** `ConversationService.delete_conversation` 仅删除 `conversation_participants` 和 `conversation`，外键约束导致 PostgreSQL 报错 `violates foreign key constraint "messages_conversation_id_fkey"`，返回 500。

**修复:** 按 FK 依赖反序删除 6 张关联表。

```diff
+ from app.models.message import Message
+ from app.models.message_mention import MessageMention
+ from app.models.message_pin import MessagePin
+ from app.models.artifact import Artifact
+ from app.models.orchestrator_task import OrchestratorTask
+ from app.models.orchestrator_subtask import OrchestratorSubtask

  @staticmethod
  async def delete_conversation(db, user_id, conv_id):
      ...
-     # Delete participants
-     await db.execute(delete(ConversationParticipant).where(...))
-     # Delete conversation
-     await db.execute(delete(Conversation).where(...))
+     # 1. orchestrator_subtasks (FK → orchestrator_tasks)
+     # 2. orchestrator_tasks (FK → conversations)
+     # 3. message_mentions (FK → messages)
+     # 4. artifacts (FK → conversations, messages)
+     # 5. message_pins (FK → conversations, messages)
+     # 6. messages (FK → conversations)
+     # 7. conversation_participants (FK → conversations)
+     # 8. conversation
      await db.commit()
```

删除顺序：`OrchestratorSubtask` → `OrchestratorTask` → `MessageMention` → `Artifact` → `MessagePin` → `Message` → `ConversationParticipant` → `Conversation`

---

### 2. 创建会话 Agent ID (`agenthub-web/src/components/layout/Sidebar.tsx:57`)

**问题:** 硬编码 `"agent-claude-code"` 不是合法 UUID，后端返回 422 验证错误。

```diff
- onCreateConversation(newTitle.trim(), "single", ["agent-claude-code"]);
+ onCreateConversation(newTitle.trim(), "single", []);
```

首次创建时不预设 Agent，后续可通过更新接口添加。

---

### 3. Mock SSE 虚假 error 事件 (`backend/app/api/v1/conversations.py:90-94`)

**问题:** `_mock_sse_stream` 将 error 事件写死在正常流末尾，前端 `onError` 回调每次都会执行 `console.error`。

```diff
- events.append(("error", build_payload({
-     "code": "MOCK_ERROR",
-     "message": "This is a mock error event.",
-     "retryable": False,
- })))
-
  for event_name, data in events:
```

---

### 4. 错误响应 message 修正 (`backend/app/core/middleware.py:26`)

**问题:** 中间件无条件设 `"message": "success"`，422/500 等错误响应也带 "success"。

```diff
- wrapped = {"code": response.status_code, "data": data, "message": "success"}
+ wrapped = {"code": response.status_code, "data": data, "message": "success"}
+ if response.status_code >= 400:
+     wrapped["message"] = "error"
```

---

### 5. avatarUrl 类型 (`agenthub-web/src/types/agent.ts:6`)

**问题:** 后端 `avatar_url` 可为 NULL，但前端类型声明为 `string`。

```diff
- avatarUrl: string;
+ avatarUrl: string | null;
```

---

### 6. RequestValidationError 处理器 (`backend/app/core/exceptions.py` + `main.py`)

**问题:** FastAPI 内置 422 响应 `{"detail": [...]}` 经中间件包装后变成 `{"code":422, "data":{"detail":[...]}, "message":"success"}`，与其他异常的 `{"code":..., "data":null, "message":"..."}` 格式不一致。

```python
# exceptions.py — 新增
async def validation_exception_handler(request, exc: RequestValidationError):
    messages = []
    for error in exc.errors():
        loc = " -> ".join(str(p) for p in error["loc"])
        messages.append(f"{loc}: {error['msg']}")
    return JSONResponse(
        status_code=422,
        content={"code": 422, "data": None, "message": "; ".join(messages)},
    )
```

```diff
# main.py
+ from fastapi.exceptions import RequestValidationError
+ from app.core.exceptions import (
+     ..., validation_exception_handler, global_exception_handler
+ )

+ app.add_exception_handler(RequestValidationError, validation_exception_handler)
```

修复后 422 响应：`{"code": 422, "data": null, "message": "body -> agentIds -> 0: Input should be a valid UUID..."}`

---

### 7. agent_status 字段命名统一

**问题:** `agent_status` 事件使用 `task_id`，其他事件（`message_start`/`token`/`artifact`/`message_end`/`error`）均使用 `message_id`。

修改 3 个文件：

```diff
# backend/app/api/v1/conversations.py — mock SSE
- "task_id": message_id,
+ "message_id": message_id,
```

```diff
# backend/app/services/adapters/adk_to_sse.py — ADK translator (2处)
- "task_id": message_id,
+ "message_id": message_id,
- "status": "running",
+ "status": "queued",
- "status": "done",
+ "status": "success",
```

```diff
# agenthub-web/src/types/chat.ts
- task_id: string;
+ message_id: string;
```

---

## 验证结果

| 测试用例 | 修复前 | 修复后 |
|----------|--------|--------|
| 创建会话（有效数据） | 422（无效 agent ID） | 201 |
| 发送消息 | 201 | 201 |
| 删除含消息的会话 | 500 | 204 |
| 确认删除 | - | 404 |
| SSE 流 error 事件 | 有（每次触发 console.error） | 无 |
| 422 验证错误格式 | `data.detail[...], message:"success"` | `data:null, message:"详情"` |
| 404 错误格式 | 正确 | 正确 |
| agent_status 字段名 | `task_id` | `message_id` |
| TypeScript 编译 | 零错误 | 零错误 |
