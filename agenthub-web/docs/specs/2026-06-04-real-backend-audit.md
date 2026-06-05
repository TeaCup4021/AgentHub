# AgentHub 真实后端联调 Bug 审计报告

审计日期：2026-06-04 | 方法：Node.js 脚本直连 `localhost:8080` 真实后端，实际发送消息、捕获 SSE 流、查询数据库

---

## 一、测试环境

| 组件 | 状态 | 备注 |
|------|------|------|
| PostgreSQL | ✅ 运行中 (5433) | Docker |
| Redis | ✅ 运行中 (6379) | Docker |
| MinIO | ✅ 运行中 (9000) | Docker |
| FastAPI 后端 | ✅ 运行中 (8080) | uvicorn |
| Vite 前端 | ✅ 运行中 (5173) | VITE_USE_MOCK=true → Mock 未激活 → 连真实后端 |
| DeepSeek API | ✅ 可用 | Agent 正常调用 LLM |

---

## 二、P0-Critical：ADK invocation_id 导致 artifact 持久化静默失败

### 根因

ADK 库的 `event.invocation_id` 格式为 `e-{uuid}`，如 `e-69d2c11d-7168-413d-ae0d-c9a34be51714`。这不是合法 UUID。

位于 [adk_to_sse.py:46](backend/app/services/adapters/adk_to_sse.py):
```python
message_id = getattr(event, "invocation_id", None) or str(uuid.uuid4())
```

在 [conversations.py:257-284](backend/app/api/v1/conversations.py) 的 `_adk_sse_stream` 中：
1. `UUID(mid)` 抛出 `ValueError`
2. `persist_stream_message()` 的 try/except 捕获后生成新 UUID → 消息存入 DB 但 ID 与 SSE 流不同
3. `ArtifactService.append_version()` 的 `UUID(mid)` 被外层 `except Exception` 捕获 → **artifact 静默丢弃，连日志都没有**

### 验证证据

```
消息 d434e84f-1040-481e-b068-020220e62ec5:
  content 包含: <artifact type="code" language="javascript" file="before.js">...
  content 包含: <artifact type="diff" title="新旧代码差异对比">...
  artifacts: []  ← 完全为空！

GET /messages/d434e84f-1040-481e-b068-020220e62ec5/artifacts → 0 条记录
```

**LLM 正确生成了 `<artifact type="code">`、`<artifact type="diff">`、`<artifact type="preview">` XML 标签，格式完全符合 artifact_format.py 规范。但后端无法将其持久化。**

### 影响范围

- 所有单聊 Agent 消息的 code/diff/preview/file/link_preview artifact 全部丢失
- 前端永远收不到 artifact SSE 事件（因为后端在 yield artifact 事件之前就异常了）
- 前端 fallback `renderFallbackCards()` 是唯一能看到卡片的方式，但它只覆盖 diff 和 link_preview

### 修复方案

在 `_adk_sse_stream` 中，message_id 处理改为：
```python
# 处理 ADK invocation_id 的 e- 前缀
raw_mid = event_data.get("message_id")
try:
    mid_uuid = UUID(raw_mid)
except (ValueError, AttributeError):
    mid_uuid = uuid4()
```
然后**整个函数统一使用 `mid_uuid`** 而不是 `UUID(mid)`。

或更好的：在 `adk_to_sse.py` 中直接 `message_id = str(uuid.uuid4())`，不使用 ADK 的 `invocation_id`。

---

## 三、P0：GET /api/v1/conversations/:id/pins 返回 405

```
POST /api/v1/conversations/{id}/pins → 201 ✅ (钉选成功)
GET  /api/v1/conversations/{id}/pins → 405 ❌ Method Not Allowed
```

### 影响

- 前端 `conversationApi.getPins()` 调这个端点 → 405 报错
- PinManager / PinnedMessages 两个面板组件即使被集成也无法加载已固定消息列表
- 用户只能 Pin，但看不到已 Pin 了哪些消息

### 修复

后端添加 `GET /conversations/{id}/pins` 端点，返回 `List[PinnedMessage]`。

---

## 四、P1：SSE 流 message_id 与 DB 持久化 message_id 不一致

### 根因

ADK SSE 流发出 `message_id: "e-69d2c11d-..."` （ADK invocation_id）
DB 存储 `message_id: "f4fef096-c3c0-..."` （persist_stream_message 生成的新 UUID）

### 影响

前端用 SSE 的 message_id 追踪流式状态（`streamMsgIdRef`），但 REST API 返回的是 DB 的 message_id。以下功能受影响：
- 流式消息完成后 React Query 缓存失效找不到正确的消息
- Pin 操作使用 SSE message_id 但 DB 里没有对应记录
- 消息重新生成引用的 parentMessageId 对不上

### 修复

与 B1 同一修复方案——在 ADK translator 层面统一 message_id 为合法 UUID。

---

## 五、P1：群聊模式需要手动确认计划才能执行

### 流程

1. 用户发送群聊消息 → `mode: "auto_orchestrate"`
2. Orchestrator LLM 生成计划 → SSE `message_end` with `finish_reason: "plan_draft"`
3. `_adk_sse_stream` 检测到 plan → `setPendingPlan()` → 前端显示 OrchestratorPlan 卡片
4. 用户必须点击"确认执行"→ 发送 `mode: "confirm_plan"` → 才真正执行各 Agent

### 问题

- 如果用户不理解这个两步流程，会觉得群聊"不工作"
- 前端的 `setPendingPlan()` 逻辑在 ChatArea.tsx:303-311 仅在 `finish_reason === "plan_draft"` 时触发
- Mock 模式自动跳过 plan_draft 直接进入 executing 模式，行为不一致

### 建议

考虑添加一个"自动执行"选项，或者更明确的 UI 引导。

---

## 六、P1：前端的 renderFallbackCards 是唯一的卡片渲染路径

### 现状

因为 B1 导致所有 artifact 无法从后端获取，前端唯一能看到卡片的方式是 [MessageList.tsx:27-114](src/components/chat/MessageList.tsx) 的 `renderFallbackCards()` 函数。

### 该函数的限制

| 卡片类型 | Fallback 覆盖 | 触发条件 | 问题 |
|---------|-------------|---------|------|
| CodeCard | ❌ 不覆盖 | — | 代码块只在 MarkdownBubble 中渲染，不作为卡片 |
| DiffCard | ✅ 覆盖 | \`\`\`diff 块或修改前/后配对 | fragile 正则；language="diff" 固定；fileName="" |
| PreviewCard | ❌ 不覆盖 | — | 永不出现 |
| FileCard | ❌ 不覆盖 | — | 永不出现 |
| DocumentCard | ❌ 不覆盖 | — | 永不出现 |
| LinkPreviewCard | ✅ 覆盖 | URL 正则匹配 | 无 OG 元数据；仅纯 URL 文本 |

### 更严重的问题

`renderFallbackCards` 仅在 `message.status === "done"` 时调用（第 343 行）。流式过程中用户完全看不到任何卡片。

---

## 七、P2：前端 Mock/Real 切换逻辑自相矛盾

### 代码

```typescript
// main.tsx:10
const useMock = import.meta.env.VITE_USE_MOCK === "false";

// IconSidebar.tsx:22
const isMock = import.meta.env.VITE_USE_MOCK !== "false";
```

- 变量名 `useMock` 有误导性（实际含义是"启用 Mock 拦截器"）
- 两个文件的判断逻辑**完全相反**
- 当前 `.env.local` = `VITE_USE_MOCK=true` → Mock 未激活 → 前端连真实后端
- `.env.local.example` 写 `VITE_USE_MOCK=false` + 注释"后端联调时使用此配置"，但设为 `false` 反而激活 Mock

---

## 八、已验证可正常工作的功能

| 功能 | 状态 | 备注 |
|------|------|------|
| 用户登录/注册 | ✅ | JWT token 正常 |
| 对话列表 CRUD | ✅ | 创建/查询/更新/删除 |
| Agent 列表 | ✅ | 5 个 Agent 正确返回 |
| 消息发送 (POST) | ✅ | 201 Created |
| SSE 流 (GET) | ✅ | 200 + 事件流正常 |
| LLM 调用 (DeepSeek) | ✅ | 正确生成 artifact XML |
| 文件上传 (POST) | ✅ | 200 + file ID 返回 |
| Pin 消息 (POST) | ✅ | 201 Created |
| Pin 消息 (DELETE) | ✅ | 已测试 |
| isPinned 字段 | ✅ | 消息列表正确包含 |
| Orchestrator Plan 生成 | ✅ | plan_draft 正确返回 |
| artifact_format.py 规范 | ✅ | LLM 正确遵循格式 |

---

## 九、Bug 汇总

| # | 级别 | 模块 | 问题 | 影响 |
|---|------|------|------|------|
| B1 | **P0** | 后端 Artifact | ADK invocation_id 非 UUID → artifact 持久化静默失败 | **所有卡片不可见** |
| B2 | **P0** | 后端 Pin API | GET /pins 返回 405 | 已 Pin 列表无法加载 |
| B3 | **P1** | 前后端 | SSE message_id 与 DB ID 不一致 | 流式状态追踪错乱 |
| B4 | **P1** | 群聊 | plan_draft 需手动确认 | 用户困惑，Mock/Real 行为不一致 |
| B5 | **P1** | 前端 | renderFallbackCards 是唯一卡片路径 | Preview/File/Document 卡片不可见 |
| B6 | **P1** | 前端 | renderFallbackCards 仅 done 态执行 | 流式时无卡片显示 |
| B7 | **P2** | 前端 | Mock/Real 切换逻辑矛盾 | main.tsx vs IconSidebar 判断相反 |
| B8 | **P2** | 前端 | PinnedMessages/PinManager 未集成 | 已 Pin 面板不存在 |
| B9 | **P2** | 前端 | Pin 双数据源 (isPinned vs pinnedIds) | UI 状态不一致 |
| B10 | **P2** | 前端 | DocumentCard 空壳 | react-pdf 未安装，mammoth/xlsx 未集成 |

---

## 十、修复优先级

### 第一优先（阻塞级，1 天内）
1. **B1**: 修复 `adk_to_sse.py` 的 message_id 生成 → 所有 artifact 卡片恢复
2. **B2**: 后端添加 `GET /conversations/:id/pins` 端点

### 第二优先（功能级，1-2 天）
3. **B5/B6**: `renderFallbackCards` 添加 streaming 状态支持 + 补全 Preview/File/Document 的 fallback
4. **B8/B9**: 统一 Pin 数据源 + 集成 PinnedMessages 面板到 ChatHeader
5. **B7**: 统一 Mock/Real 切换逻辑

### 第三优先（体验级）
6. **B4**: 群聊自动执行选项
7. **B10**: DocumentCard 集成 mammoth/xlsx，安装 react-pdf
