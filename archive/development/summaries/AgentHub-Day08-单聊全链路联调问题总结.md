# AgentHub Day 08 — 单聊全链路联调问题总结

日期：2026-05-27

---

## 一、概述

Day 8 是阶段 2（单聊 ADK 集成）的最后一天，目标是完成前后端完整链路联调：创建会话 → 发送消息 → ADK/LlmAgent → SSE 流式输出 → 前端气泡实时渲染 → 消息历史持久化 → 重生成。联调过程中暴露了 **11 个问题**，涵盖环境配置、后端时序、前端闭包、第三方 SDK 行为假设等多个层面。

---

## 二、环境与配置问题（3 个）

### 问题 1：Pydantic Settings 拒绝新增的 `.env` 变量

**现象**：在 `backend/.env` 中添加 `AGENTHUB_USE_ADK_STREAM`、`ANTHROPIC_API_KEY` 等变量后，`uvicorn` 启动报错：

```
pydantic_core._pydantic_core.ValidationError: 5 validation errors for Settings
agenthub_use_adk_stream
  Extra inputs are not permitted [type=extra_forbidden, ...]
```

**根因**：Pydantic Settings 的 `model_config` 未显式设置 `extra="allow"`，默认行为（pydantic v2）是 `extra="forbid"`。`.env` 中任何未在 Settings 类中声明的字段都会被拒绝。

**修复**（`backend/app/core/config.py`）：在 Settings 类中声明所有新增字段：

```python
AGENTHUB_USE_ADK_STREAM: str = "0"
AGENTHUB_MODEL_PROVIDER: str = "anthropic"
AGENTHUB_MODEL_NAME: Optional[str] = None
ANTHROPIC_API_KEY: Optional[str] = None
ANTHROPIC_BASE_URL: Optional[str] = None
OPENAI_API_KEY: Optional[str] = None
AGENTHUB_MAX_PINNED_CONTEXT: int = 10
AGENTHUB_PIN_INJECTOR_LOG: str = "0"
```

**教训**：新增环境变量时，必须同步更新 Settings 类。

---

### 问题 2：`os.getenv()` 读不到 `.env` 中的配置

**现象**：`.env` 中设置了 `AGENTHUB_USE_ADK_STREAM=true`，但后端始终走 Mock SSE 流，`_use_adk_stream()` 返回 `False`。

**根因**：Pydantic Settings 通过 `python-dotenv` 内部加载 `.env`，但只加载到自身对象（`settings.AGENTHUB_USE_ADK_STREAM`），不会注入 `os.environ`。而项目中有 5 处代码直接用 `os.getenv()` 读取环境变量：

| 文件 | 变量 |
|---|---|
| `app/api/v1/conversations.py` | `AGENTHUB_USE_ADK_STREAM` |
| `app/services/adk/runner.py` | `AGENTHUB_MODEL_PROVIDER`, `AGENTHUB_MODEL_NAME` |
| `app/services/pin_spec_injector.py` | `AGENTHUB_PIN_INJECTOR_LOG`, `AGENTHUB_MAX_PINNED_CONTEXT` |

这些 `os.getenv()` 读到的全部是默认值，与 `.env` 中的实际配置完全不一致。

**修复**（`backend/app/core/config.py`）：在 Settings 类实例化之前，显式调用 `load_dotenv()` 将 `.env` 注入 `os.environ`：

```python
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
```

但需注意 `load_dotenv()` 默认不覆盖已存在的环境变量（`override=False`）。如果系统环境中已设置同名变量，`.env` 中的值不会生效。

**教训**：
- 项目内应统一配置读取方式：要么全部使用 Settings 对象，要么在入口处一次性 `load_dotenv`。
- 混用 `os.getenv` 和 pydantic Settings 是常见陷阱，建议 coding convention 明确禁止直接调用 `os.getenv`。

---

### 问题 3：前端依赖未安装

**现象**：`npm run dev` 后 Vite 报大量 `Failed to resolve dependency`，包括 `@douyinfe/semi-ui`、`framer-motion`、`shiki` 等 27 个包。

**根因**：仓库克隆后未执行 `npm install`，`node_modules` 为空。

**修复**：执行 `npm install`。

---

## 三、后端代码 BUG（6 个）

### 问题 4（P0 阻塞）：竞态条件 — 助手消息"显示后消失"

**现象**：用户发送消息后，前端流式展示了 AI 的回复文字，但在 `message_end` 后 AI 回复的对话框直接消失，只剩下用户发送的消息。

**根因**：`_adk_sse_stream` 中的事件处理顺序为 **先 `yield` SSE 事件给前端，后落库**。当 `message_end` 事件被 yield 后，前端立即执行：

1. `finalizeStreaming()` — 从 chatStore 清除流式内容
2. `qc.invalidateQueries()` — 标记消息列表为过期，触发重新查询

而重新查询发生时，`persist_stream_message()` 可能还未执行完（甚至还未开始），因为落库代码在 `yield` 之后。数据库里查不到助手回复，前端自然不显示。

**修复**（`backend/app/api/v1/conversations.py`）：对于 `message_end` 和 `error` 事件，**先落库，再 `yield`**。对于 `token` 和 `artifact` 等中间事件，保持先 yield（低延迟优先）。

```python
# 修复前（所有事件统一处理）
async for payload in translator.translate(...):
    yield payload
    # 然后才处理和落库

# 修复后（message_end 特殊处理）
if event_type == "message_end" and event_data:
    # 先落库
    async with async_session_maker() as db:
        await MessageService.persist_stream_message(...)
        await db.commit()
    # 再发送给前端
    yield payload
else:
    yield payload
    # 处理其他事件...
```

**教训**：SSE 流式场景下的"产生事件 → 前端消费 → 数据持久化"是一个隐式时序链。任何在 `yield` 之后的数据库写入都存在竞态风险。设计原则应该是：**闭包性事件（如 message_end）在 yield 前完成持久化；增量事件（如 token）可先 yield**。

---

### 问题 5（P0 阻塞）：ADK `invocation_id` 非标准 UUID 导致消息静默丢弃

**现象**：问题 4 修复后，消息仍然"显示后消失"。后端日志无任何异常。

**根因**：ADK 生成的 `invocation_id` 格式为 `e-5a76d1fb-035e-414f-a99a-b9270dd79232`（首段只有 1 个字符 `e`，而非 8 个 hex 字符）。`persist_stream_message()` 中调用 `UUID(message_id)` 抛出 `ValueError`，然后直接 `return None`，没有任何日志。

```python
# 修复前
try:
    msg_id = UUID(message_id)  # "e-5a76d1fb-..." → ValueError
except ValueError:
    return None  # 静默丢弃
```

**修复**（`backend/app/services/message.py`）：无法解析为 UUID 时，自动生成新 UUID：

```python
try:
    msg_id = UUID(message_id)
except ValueError:
    import uuid as _uuid
    msg_id = _uuid.uuid4()
```

**教训**：
- 外部系统（ADK）产生的 ID 不能假设其格式，应做防御性处理。
- 静默失败（`return None` + 无日志）是调试黑洞，关键路径的异常处理至少要打 warn 级别日志。
- 数据库主键不应直接使用第三方 ID，应在应用层生成自己的 ID，将第三方 ID 存入单独字段。

---

### 问题 6（P1）：Mock 流没有落库逻辑

**现象**：用 `AGENTHUB_USE_ADK_STREAM=false` 测试时，症状和问题 4 完全一样。

**根因**：`_mock_sse_stream` 是独立实现的，只发送 SSE 事件，完全不持久化助手消息。Day 6-7 时 Mock 流没有持久化需求（前端自己 Mock 了全流程），Day 8 加了持久化但漏掉了 Mock 分支。

**修复**（`backend/app/api/v1/conversations.py`）：在 Mock 流的 `message_end` 之前调用 `MessageService.persist_stream_message()`：

```python
full_content = "".join(
    data["delta"] for evt, data in events if evt == "token"
)
async with async_session_maker() as db:
    await MessageService.persist_stream_message(
        db=db, conv_id=conv_id, message_id=message_id,
        sender_name="Demo Agent", content=full_content, status="done",
    )
    await db.commit()
```

**教训**：`_adk_sse_stream` 和 `_mock_sse_stream` 应共享持久化逻辑，而不是各自实现。两条路径的差异应该在"如何产生 SSE 事件"，而不是"如何处理 SSE 事件"。

---

### 问题 7（P1）：Translator 流耗尽时不发 `message_end`

**现象**：切换到真实 API 后，AI 回复显示正常，但前端加载指示器一直转，消息发送按钮一直禁用（`isStreaming` 始终为 `true`）。

**根因**：中转 API（luckyapi.chat）返回的 ADK 事件中，最后的完整文本事件的 `turn_complete` 为 `False`，`actions.end_of_agent` 也为 `False`。`ADKToSSETranslator._to_message_end()` 的判断逻辑：

```python
turn_complete = getattr(event, "turn_complete", False)
end_of_agent = getattr(actions, "end_of_agent", False) if actions else False
if not turn_complete and not end_of_agent:
    return None  # 不发 message_end
```

事件流结束后，translator 的 `async for` 循环退出，没有补发 `message_end`。前端永远收不到结束信号。

**修复**（`backend/app/services/adapters/adk_to_sse.py`）：在 `translate()` 方法的 `async for` 循环结束后，遍历所有已开始的 invocation，为未收到 `message_end` 的 invocation 补发：

```python
# async for event in event_stream: ... (主循环)

# Fallback: 为所有未结束的 invocation 补发 message_end
for mid in state.seen_invocations:
    if mid not in state.ended_invocations:
        yield self._format_sse("message_end", {
            "version": self.version,
            "event_id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "message_id": mid,
            "finish_reason": "completed",
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
```

**教训**：不应假设第三方 API/ADK 的行为完全符合规范。SSE 协议的关键约束（每个 `message_start` 必须有对应的 `message_end`）应在 translator 层保证，而不是依赖上游。

---

### 问题 8（P2）：Token 重复 — AI 回复内容出现两遍

**现象**：AI 回复显示为 `Hello! How can I help you today?Hello! How can I help you today?`

**根因**：ADK 的流式事件序列中，前 N-1 个是 `partial=True` 的增量事件（单个词），最后一个是 `partial=False` 的完整文本事件（整句话）。Translator 将完整文本事件也作为 `token` delta 发送，导致前端累积了两次：增量词 + 完整句。

```python
# 修复前：partial=False 时，将完整文本作为 delta 发送
if not getattr(event, "partial", False):
    for part in parts:
        text = getattr(part, "text", None)
        if not text:
            continue
        yield {..., "delta": text, ...}  # ← 完整文本作为 delta！
```

**修复**（`backend/app/services/adapters/adk_to_sse.py`）：`partial=False` 时，如果该 invocation 已经发送过增量 token，则跳过完整文本：

```python
if not getattr(event, "partial", False):
    if message_id in state.token_index_by_invocation:
        return  # 已经有增量 token，跳过完整文本
    # 否则发送完整文本（该模型不支持流式）
    ...
```

**教训**：`partial=False` 事件的语义是"最终完整内容"而非"最后一帧"。前端期望纯增量（delta），后端必须过滤掉非增量事件。

---

### 问题 9（P1）：SSE 流未传递用户问题

**现象**：不管用户问什么问题，AI 都只回复 `Hello! How can I help you today?`

**根因**：前端 `createSSEStream()` 打开流时，URL 中没有 `?prompt=用户问题` 查询参数。后端 `_adk_sse_stream` 取 `prompt` 参数为空，使用了代码中的默认值：

```python
prompt_text = (prompt or "Hello from AgentHub").strip()
```

ADK Runner 收到的是 `"Hello from AgentHub"`（而非用户的实际问题），所以 AI 始终回复 "Hello! How can I help you?"

**修复**：

1. `agenthub-web/src/lib/sse.ts`：`createSSEStream()` 增加可选参数 `prompt?: string`，拼接到 URL：
   ```typescript
   const streamUrl = `/api/v1/conversations/${conversationId}/stream${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ""}`;
   ```

2. `agenthub-web/src/components/layout/ChatArea.tsx`：新增 `lastPromptRef`，在 `executeSend` 和重连逻辑中传递用户消息内容。

**教训**：消息发送和流式获取是两步操作（REST POST + SSE GET），容易遗漏第二步的参数传递。更合理的设计是后端从数据库中读取最新的用户消息，而非依赖前端传递 `prompt`。

---

## 四、前端代码 BUG（1 个）

### 问题 10（P1）：`onRegenerate is not defined`

**现象**：前端控制台报错 `ReferenceError: onRegenerate is not defined at MessageBubble`，整个聊天区域被 ErrorBoundary 捕获后重新挂载。

**根因**：`MessageBubble` 是模块级 `memo` 组件（定义在 `MessageList` 函数体外），不在 `MessageList` 的闭包内。将 regenerate 从 `CustomEvent` 重构为 props 传递时，给 `MessageList` 和 `MessageActions` 都加了 `onRegenerate` prop，但漏掉了 `MessageBubble`（它内部渲染了 `MessageActions`）。`onRegenerate` 在 `MessageBubble` 作用域内未定义，触发 ReferenceError。

```tsx
// MessageBubble 是模块级组件，不在 MessageList 闭包内
const MessageBubble = memo(function MessageBubble({ message, agents, searchText }) {
  // ...
  <MessageActions onRegenerate={onRegenerate} />  // ← onRegenerate 未定义！
});

// MessageList 内部使用
<MessageBubble message={msg} agents={agents} searchText={searchText} />
//                                                  ↑ 漏了 onRegenerate
```

**修复**：

1. `MessageBubble` 的 props 接口添加 `onRegenerate?: (convId: string, msgId: string) => void`
2. `MessageList` 中调用 `<MessageBubble>` 时传入 `onRegenerate={onRegenerate}`

**教训**：重构 props 传递链时，要追踪完整链路（定义 → 接收 → 转发 → 使用），尤其在组件嵌套层级较多或存在模块级组件时容易漏。TypeScript 可以捕获大部分遗漏，但如果某层是 `memo()` + 对象展开，类型推断可能不够严格。

---

## 五、基础设施问题（1 个）

### 问题 11：PostgreSQL 连接被拒绝

**现象**：`uvicorn` 启动时报 `ConnectionRefusedError: [WinError 1225] 远程计算机拒绝网络连接`

**根因**：PostgreSQL 服务未启动。

**修复**：启动 PostgreSQL 服务后重试。

---

## 六、问题分类汇总

| 类别 | 数量 | 问题编号 |
|---|---|---|
| 环境/配置 | 3 | #1 `.env` 字段未声明, #2 `os.getenv` 读不到, #3 前端依赖未安装 |
| 后端时序/竞态 | 2 | #4 先 yield 后落库, #5 invocation_id 非 UUID |
| 后端边界条件 | 3 | #6 Mock 流不落库, #7 message_end 缺失, #8 Token 重复 |
| 前后端参数传递 | 1 | #9 SSE 未传 prompt |
| 前端 prop 链路 | 1 | #10 onRegenerate 未定义 |
| 基础设施 | 1 | #11 PostgreSQL 未启动 |

---

## 七、后续开发建议

### 1. 环境变量统一管理

- **禁止直接使用 `os.getenv()`**：项目中所有配置读取改为通过 `Settings` 对象。如果必须在模块加载时读取（如 `_use_adk_stream()`），则在 `app/__init__.py` 或 `main.py` 的入口处提前调用 `load_dotenv()`。
- **`.env.example` 文件**：维护一份 `.env.example`，列出所有必需和可选的环境变量，避免新成员遗漏配置。

### 2. SSE 流式管道的健壮性

- **时序保证**：`message_end`、`error` 等闭包事件必须在 `yield` 前完成持久化。增量事件（`token`、`artifact`）可保持先 yield。
- **兜底机制**：Translator 层保证每个 `message_start` 必有对应的 `message_end`（已修复）。进一步可加超时兜底：如果流在 N 秒内无新事件，自动补发 `message_end`。
- **防御性 ID 处理**：不在数据库主键中使用第三方 ID。在 translator 层将 ADK `invocation_id` 存入 `meta_data` 而非直接作为 `message_id`。

### 3. 避免 Mock/Real 分支不一致

- `_mock_sse_stream` 和 `_adk_sse_stream` 应共享 SSE 事件的"后处理"逻辑（累积、落库、artifact 持久化）。
- 两条路径的差异应仅限于"如何产生原始 ADK 事件"。
- 可抽取 `_process_sse_events(event_generator, conv_id)` 函数，Mock 和 ADK 分支都调用它。

### 4. UI 联调前先验证 API

- **浏览器直测**：在联调前端之前，先在浏览器中访问 `/api/v1/conversations/{id}/stream?prompt=test`，确认 SSE 输出满足：
  - 6 种事件类型齐全（尤其 `message_end` 存在）
  - `token` 的 `delta` 是增量值
  - `artifact` 的 `artifactType` 字段正确
- **curl/Postman 测 REST**：`POST /messages` → `GET /messages` 确认刷新后历史包含助手回复。

### 5. 关键路径加日志

以下位置应至少打印 `logger.warning`：
- `persist_stream_message` 中 `ValueError`（ID 格式异常）
- `_adk_sse_stream` 中持久化失败的 `except` 块
- Translator 补发 `message_end` 时（提示正常流程未发出）

### 6. 前端状态管理

- SSE 流的状态（`isStreaming`、`streamMsgIdRef`、重连逻辑）分散在 refs 和 store 中，建议收敛到一个 `useSSEStream` hook 或 `streamStore`。
- `message_end` 回调中的 `invalidateQueries` 和 `setIsStreaming(false)` 有执行顺序依赖，考虑用 `Promise` 或状态机显式管理。

---

## 八、修改文件清单

| 文件 | 变更类型 | 问题编号 |
|---|---|---|
| `backend/.env` | 新增 ADK 配置 | #1 |
| `backend/app/core/config.py` | 新增字段声明 + `load_dotenv` | #1, #2 |
| `backend/app/api/v1/conversations.py` | 重写事件循环（先落库后 yield）+ Mock 流落库 | #4, #6, #9 |
| `backend/app/services/message.py` | 新增 `persist_stream_message` + UUID 回退 + meta_data 回退 | #5 |
| `backend/app/services/adapters/adk_to_sse.py` | 补发 `message_end` + 跳过重复 token + 字段规范化 | #7, #8, #4 |
| `backend/app/services/conversation.py` | 硬删除 → 软删除 | - |
| `backend/app/models/conversation.py` | 新增 `is_deleted`、`deleted_at` | - |
| `backend/alembic/versions/0002_add_soft_delete_to_conversations.py` | 新增迁移 | - |
| `agenthub-web/.env` | `VITE_USE_MOCK=false` | #3 |
| `agenthub-web/src/lib/sse.ts` | `createSSEStream` 增加 `prompt` 参数 | #9 |
| `agenthub-web/src/components/layout/ChatArea.tsx` | `lastPromptRef` + prompt 传递 + 乐观 ID 替换 + regenerate 重构 + loading 骨架屏 | #9, #10 |
| `agenthub-web/src/components/chat/MessageList.tsx` | `onRegenerate` prop 链路 | #10 |
| `agenthub-web/src/components/chat/MessageActions.tsx` | 接收 `onRegenerate` 替代 CustomEvent | #10 |
| `agenthub-web/src/types/chat.ts` | artifact 字段注释更新 | - |
