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
- **mode 取值**（2026-05-28 更新）：
  - `"direct"` — 单 Agent 直连对话（默认）
  - `"auto_orchestrate"` — Coordinator 模式：LLM 动态理解意图、拆解任务、调度子 Agent（ADK Collaborative Workflow）
  - `"auto_orchestrate_dag"` — Static DAG 模式：Planner 预生成依赖图 → Workflow Graph 确定执行
- **行为**：`auto_orchestrate` 和 `auto_orchestrate_dag` 仅在群聊（含 @mentions）时生效，`direct` 走现有单聊通道。

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

## 19) SSE message_end 时序保证（新增于 2026-05-27 Day8 联调）

- **约定**：当后端发出 `message_end` SSE 事件时，该条助手消息**必须已完成数据库落库**，前端会在收到 `message_end` 后立即调用 `GET /messages` 重新查询消息列表。
- **原因**：前端在 `message_end` 回调中执行 `finalizeStreaming`（清除流式缓存）+ `invalidateQueries`（触发 React Query 重查）。如果消息在 `message_end` 发出后落库，前端重查时消息尚未写入数据库，导致 AI 回复"闪现后消失"。
- **实现位置**：`backend/app/api/v1/conversations.py` 的 `_adk_sse_stream`，`message_end` 事件先落库后 `yield`。
- **Mock 流同责**：`_mock_sse_stream` 也必须在 `message_end` 前落库，保证 Mock/Real 两种模式行为一致。

## 20) SSE token.delta 增量语义（新增于 2026-05-27 Day8 联调）

- **约定**：`token` 事件的 `delta` 字段**必须是增量文本**（本次新增的字词），前端通过字符串拼接累积显示完整内容。
- **禁止行为**：`delta` 不得包含从开头到当前的完整文本。若 ADK 产生 `partial=False` 的完整文本事件，Translator 层必须过滤，避免前端出现重复内容（`HelloHello, this is...`）。
- **实现位置**：`backend/app/services/adapters/adk_to_sse.py` 的 `_to_token`，`partial=False` 时检查 `token_index_by_invocation` 是否已有增量 token，有则跳过。

## 21) SSE message_start / message_end 强制配对（新增于 2026-05-27 Day8 联调）

- **约定**：每个 `message_start` 事件**必须有一个对应的 `message_end` 事件**。前端以 `message_start` 初始化流式气泡，以 `message_end` 结束流式并触发消息重查。缺少 `message_end` 会导致前端永远处于"加载中"状态（`isStreaming` 不清零，发送按钮持续禁用）。
- **兜底机制**：Translator 在事件流耗尽时，自动为所有未收到 `message_end` 的 invocation 补发 `message_end`（`finish_reason="completed"`, `usage={0,0}`）。这覆盖了部分中转 API 不设 `turn_complete` 的场景。
- **实现位置**：`backend/app/services/adapters/adk_to_sse.py` 的 `translate` 方法末尾 fallback 逻辑。

## 22) SSE message_id 格式说明（新增于 2026-05-27 Day8 联调）

- **来源**：SE 事件中的 `message_id` 来自 ADK 的 `event.invocation_id`，格式为 `e-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`（首段仅 1 字符），**不是标准 UUID 格式**。
- **影响**：后端 `persist_stream_message` 中 `UUID(message_id)` 会抛出 `ValueError`。当前已修复为自动生成新 UUID 写入 `messages.id`。
- **前端注意**：`message_id` 仅用于 SSE 流式过程中的事件关联（streaming content key），**不应将其用作数据库主键查询**。消息历史查询应通过 REST `GET /messages` 获取。
- **未来方向**：建议在 Translator 层将 ADK `invocation_id` 存入独立字段（如 `meta_data.adk_invocation_id`），`message_id` 始终使用标准 UUID。

## 23) SSE stream 端点 prompt 参数（新增于 2026-05-27 Day8 联调）

- **端点**：`GET /api/v1/conversations/{id}/stream?prompt=用户消息内容`
- **约定**：`prompt` 为**必填**查询参数，传递用户本次发送的消息文本。后端将其作为 ADK LlmAgent 的输入。
- **编码**：前端必须对 `prompt` 进行 `encodeURIComponent` 转义，避免中文或特殊字符导致 URL 解析异常。
- **默认值**：若 `prompt` 为空，后端使用默认值 `"Hello from AgentHub"`（仅用于兼容旧调用，正式联调必须传参）。
- **实现位置**：前端 `agenthub-web/src/lib/sse.ts` 的 `createSSEStream` 新增 `prompt` 参数，拼接到 URL query string。

## 24) Conversation 软删除（新增于 2026-05-27 Day8 联调）

- **DELETE /api/v1/conversations/{id} 行为变更**：从物理级联删除改为软删除（设置 `is_deleted=true` + `deleted_at=now()`）。
- **影响**：
  - `GET /conversations` 列表**默认过滤**已删除会话（`WHERE is_deleted = false`）
  - `GET /conversations/{id}` 单条查询**同样过滤**已删除会话，前端访问已删除会话会收到 404
  - `PATCH /conversations/{id}` **同样过滤**，已删除会话不可修改
- **数据保留**：已删除会话的消息、artifact、pin 等关联数据均保留，不做级联清理。未来可增加定时任务物理清理超过 N 天的已删除记录。
- **数据库迁移**：`alembic/versions/0002_add_soft_delete_to_conversations.py`，新增 `conversations.is_deleted` (`boolean, default false`) 和 `conversations.deleted_at` (`timestamptz, nullable`)。
- **前端影响**：无需修改。前端 DELETE 调用返回 204，列表自动刷新后已删除会话不再出现（后端过滤）。

## 25) Agent 消息 sender_name 回退机制（新增于 2026-05-27 Day8 联调）

- **背景**：ADK 流式产生的助手消息，其 `sender_type="agent"` 但 `sender_id=null`（因为 ADK Agent 不一定在 `agents` 表中注册）。
- **sender_name 解析链路**：
  1. 通过 `sender_id` 查询 `agents` 表
  2. 若 `sender_id` 为 null 或查不到，回退到 `messages.meta->>'agent_name'`
  3. 若仍无值，返回 `"Unknown"`
- **数据写入**：`MessageService.persist_stream_message` 创建消息时，将 SSE `message_start.sender.name` 写入 `meta_data.agent_name`。`sender_id` 设为 `null`。
- **实现位置**：`backend/app/services/message.py` 的 `_batch_get_sender_names`（新增 `meta_fallbacks` 参数）和 `persist_stream_message`。

## 26) 后端环境变量约定（新增于 2026-05-27 Day8 联调）

- **统一声明**：所有从 `.env` 读取的变量必须在 `backend/app/core/config.py` 的 `Settings` 类中声明，否则 Pydantic 会因 `extra_forbidden` 拒绝启动。
- **os.environ 注入**：项目代码中多处使用 `os.getenv()` 直接读取环境变量（`conversations.py`、`runner.py`、`pin_spec_injector.py`）。`config.py` 启动时通过 `load_dotenv()` 将 `.env` 注入 `os.environ`，确保 `os.getenv()` 与 `Settings` 读取同一份配置。
- **新增变量清单**（Day8）：
  | 变量名 | 默认值 | 说明 |
  |---|---|---|
  | `AGENTHUB_USE_ADK_STREAM` | `"0"` | `"true"` 启用 ADK 流，否则 Mock |
  | `AGENTHUB_MODEL_PROVIDER` | `"anthropic"` | `"anthropic"` 或 `"litellm"` |
  | `AGENTHUB_MODEL_NAME` | `null` | 模型名，如 `claude-sonnet-4-6` |
  | `ANTHROPIC_API_KEY` | `null` | Anthropic API Key |
  | `ANTHROPIC_BASE_URL` | `null` | 自定义 API 地址（中转站），不设则用官方地址 |
  | `OPENAI_API_KEY` | `null` | OpenAI API Key（LiteLlm 模式） |
  | `AGENTHUB_MAX_PINNED_CONTEXT` | `10` | 最大注入固定消息数 |
  | `AGENTHUB_PIN_INJECTOR_LOG` | `"0"` | `"true"` 启用 Pin 注入日志 |
  | `AGENTHUB_WORKFLOW_MAX_CONCURRENCY` | `"3"` | Static DAG 模式最大并行 Agent 数，`1` 触发 Plan B2 串行降级 |

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
- `vibeCodingSummary/AgentHub-Day08-单聊全链路联调问题总结.md`（本次）
- `backend/app/api/v1/conversations.py`（`_adk_sse_stream`、`_mock_sse_stream`）
- `backend/app/services/adapters/adk_to_sse.py`（`_to_token`、`translate` fallback）
- `backend/app/services/message.py`（`persist_stream_message`、`_batch_get_sender_names`）
- `backend/app/services/conversation.py`（软删除）
- `backend/app/models/conversation.py`（`is_deleted`、`deleted_at`）
- `backend/app/core/config.py`（`load_dotenv`、新增字段）
- `backend/alembic/versions/0002_add_soft_delete_to_conversations.py`
- `agenthub-web/src/lib/sse.ts`（`createSSEStream` prompt 参数）
- `agenthub-web/src/components/layout/ChatArea.tsx`（`lastPromptRef`、`handleRegenerate`）
- `backend/alembic/versions/0003_add_dag_fields_to_subtasks.py`（本次）
- `docs/ADK工作流改进方案.md`（本次）
- `backend/app/schemas/orchestrator.py`（本次 — SubTaskPlan 新增 depends_on/mode/output_key）
- `backend/app/api/v1/messages.py`（本次 — confirm_plan 适配新字段）
- `backend/app/api/v1/conversations.py`（本次 — orchestrateMode 参数 + _coordinator_stream + _dag_workflow_stream）
- `backend/app/services/adk/workflow_builder.py`（本次 — 星型拓扑重写为 DAG + JoinNode）
- `backend/app/services/adk/coordinator_builder.py`（本次新增 — Coordinator 模式构建器）
- `backend/app/services/adk/execution_tracer.py`（本次新增 — ExecutionTracer 回调 + ExecutionRecord）
- `backend/app/services/adk/tool_loader.py`（本次新增 — tool_config JSONB → ADK Tool 实例）
- `vibeCodingPlan/AgentHub-后端B-Day11-12-双模式执行引擎补全.md`（本次）
- `vibeCodingSummary/AgentHub-后端B-Day11-12-双模式执行引擎补全.md`（本次）

## 27) Agent 能力标签列表 API（新增于 2026-05-27 Day9-10 后端A）

- **端点**：`GET /api/v1/agents/capabilities`
- **响应**：`{ code: 200, data: ["coding", "debugging", "docs", ...], message: "ok" }` — 所有活跃 Agent 的能力标签去重列表（`List[str]`，字母排序）
- **用途**：前端 Agent 创建/编辑时可下拉选择已有标签，Orchestrator Planner 匹配 Agent 时获取可用标签
- **实现位置**：`backend/app/services/capability_registry.py` 的 `CapabilityRegistry.get_all_capabilities`
- **路由顺序**：`GET /capabilities` **必须**在 `GET /{agent_id}` 之前注册，防止 "capabilities" 被当作 UUID 解析

## 28) Agent 能力匹配查询（内部 Service）（新增于 2026-05-27 Day9-10 后端A）

- **模块**：`backend/app/services/capability_registry.py` — `CapabilityRegistry` 类
- **方法**：
  - `CapabilityRegistry.match_agents(db, required_capability, limit) → List[Agent]`：使用 PostgreSQL JSONB `contains` 操作符查询 `agents.capabilities` 中包含指定标签的活跃 Agent
  - `CapabilityRegistry.get_all_capabilities(db) → List[str]`：从所有活跃 Agent 聚合去重能力标签
- **调用方**：后端 B 的 Orchestrator Planner（任务拆解后按能力匹配 Agent）、Context Assembler（注入能力路由提示）
- **约束**：`match_agents` 初版仅支持单标签匹配，多标签 AND/OR 语义留待 Day 14
- **数据来源**：复用 Day 1 已建的 `agents.capabilities` JSONB 列，无需新增 migration

## 29) Orchestrator Plan JSON 格式（新增于 2026-05-28 工作流改进）

- **用途**：Orchestrator Planner 输出的计划 JSON，以及 `confirm_plan` API 接收的确认/调整后的计划。前端 OrchestratorPlan 卡片据此渲染子任务列表和依赖关系。
- **字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `subtaskId` | `string` | 是 | 子任务唯一标识，格式 `"sub-xxxxxxxx"` |
| `agentId` | `string` (UUID) | 是 | 分配的 Agent ID |
| `agentName` | `string` | 是 | Agent 名称（展示用） |
| `instruction` | `string` | 是 | 子任务指令，自包含且可执行 |
| `dependsOn` | `string[]` | 否（默认 `[]`） | 依赖的 subtaskId 列表，空数组表示无依赖（可并行） |
| `mode` | `"single_turn"` \| `"task"` \| `"chat"` | 否（默认 `"single_turn"`） | 子 Agent 协作模式 |
| `outputKey` | `string` \| `null` | 否 | 子任务输出写入 session state 的 key |

- **示例**：
  ```json
  {
    "subtasks": [
      {
        "subtaskId": "s1",
        "agentId": "550e8400-e29b-41d4-a716-446655440001",
        "agentName": "WeatherAgent",
        "instruction": "查询东京未来三天天气",
        "dependsOn": [],
        "mode": "single_turn",
        "outputKey": "weather_data"
      },
      {
        "subtaskId": "s2",
        "agentId": "550e8400-e29b-41d4-a716-446655440002",
        "agentName": "FlightAgent",
        "instruction": "查询北京到东京的直飞航班",
        "dependsOn": [],
        "mode": "single_turn",
        "outputKey": "flight_data"
      },
      {
        "subtaskId": "s3",
        "agentId": "550e8400-e29b-41d4-a716-446655440003",
        "agentName": "TravelPlanner",
        "instruction": "根据天气({weather_data})和航班({flight_data})制定三天行程",
        "dependsOn": ["s1", "s2"],
        "mode": "task",
        "outputKey": "travel_plan"
      }
    ]
  }
  ```

- **依赖规则**：
  - `dependsOn` 为空 → 从 START 节点并行启动
  - 单一依赖 → 直接 Edge 串联
  - 多个依赖 → JoinNode 等待所有依赖完成后触发
  - 后端 `WorkflowBuilder` 根据 `dependsOn` 自动构建正确的 ADK Workflow Graph

- **向后兼容**：旧格式（无 `dependsOn`/`mode`/`outputKey`）仍可解析，视同所有子任务 `dependsOn=[]`、`mode="single_turn"`

## 30) SSE Plan 消息格式变更（新增于 2026-05-28 工作流改进）

- **背景**：`GET /stream` 返回 Orchestrator 计划时，`message_start` 事件的 `meta.plan[]` 数组格式修改。
- **变更前**（旧格式）：
  ```json
  { "subtask_id": "s1", "agent": {...}, "instruction": "...", "priority": 1 }
  ```
  `priority` 字段已移除。
- **变更后**（新格式）：
  ```json
  {
    "subtask_id": "s1",
    "agent": { "id": "...", "name": "WeatherAgent" },
    "instruction": "查询东京天气",
    "depends_on": [],
    "mode": "single_turn",
    "output_key": "weather_data"
  }
  ```
- **字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `depends_on` | `string[]` | 依赖的 subtask_id 列表，空数组=可并行 |
| `mode` | `string` | 子 Agent 协作模式：`"single_turn"` / `"task"` / `"chat"` |
| `output_key` | `string` \| `null` | 输出写入 session state 的 key |

- **前端影响**：OrchestratorPlan 卡片渲染时，从 `depends_on` 读取依赖关系绘制 DAG 连线；根据 `mode` 决定是否显示"需用户确认"标记。

## 31) Stream 端点 orchestrateMode 参数（新增于 2026-05-28 工作流改进）

- **端点**：`GET /api/v1/conversations/{id}/stream`
- **新增查询参数**：`orchestrateMode`（camelCase，可选）
- **取值**：
  | 值 | 说明 |
  |---|---|
  | 不传 | 默认行为：有 planning 任务则生成计划，有 confirmed 任务不处理（兼容旧版） |
  | `"auto_orchestrate"` | Coordinator 模式：确认后的计划走 LLM 动态调度执行 |
  | `"auto_orchestrate_dag"` | Static DAG 模式：确认后的计划走 Workflow Graph 确定执行 |
- **使用时机**：前端在用户确认 Plan 后，携带 `orchestrateMode=auto_orchestrate`（或 `auto_orchestrate_dag`）重新连接 SSE 流触发执行。
- **示例**：`GET /api/v1/conversations/{id}/stream?prompt=...&orchestrateMode=auto_orchestrate`
- **兜底**：若未传 `orchestrateMode` 但有 status=confirmed 的 OrchestratorTask，stream 不会触发执行（兼容旧版行为，需显式传参）。

## 32) confirm_plan API 接收新字段（新增于 2026-05-28 工作流改进）

- **端点**：`POST /api/v1/conversations/{id}/messages`（`mode: "confirm_plan"`）
- **plan 数组每项新增可选字段**：

| 字段 | 来源 | 说明 |
|------|------|------|
| `dependsOn` | 前端发送 camelCase | 依赖的 subtaskId 列表，后端同时兼容 `depends_on`（snake_case） |
| `mode` | 前端发送 | 子 Agent 模式：`"single_turn"` / `"task"` / `"chat"`，默认 `"single_turn"` |
| `outputKey` | 前端发送 camelCase | 输出 key，后端同时兼容 `output_key`（snake_case） |

- **向后兼容**：不传这些字段的后端按默认值处理（`depends_on=[]`、`mode="single_turn"`、`output_key=None`），旧前端可正常工作。
- **存储**：确认后的 plan 完整存储到 `orchestrator_tasks.plan` JSONB 列（含新字段），供后续执行阶段读取。

## 33) OrchestratorSubtask 数据生命周期（新增于 2026-05-28 Day11-12 双引擎补全）

- **创建时机**：用户调用 `confirm_plan` API 确认计划后，后端为每个子任务创建一条 `orchestrator_subtasks` 行，初始 `status="queued"`。
- **更新时机**：Coordinator / Static DAG 执行完成后，后端根据 `ExecutionTracer` 收集的指标回写：

| 字段 | 写入时机 | 说明 |
|------|---------|------|
| `status` | 执行后 | `"success"` / `"failed"` |
| `latency_ms` | 执行后 | 子 Agent 实际耗时（毫秒） |
| `error_detail` | 失败时 | 错误详情文本 |
| `output_message_id` | 执行后 | 指向该子任务产出的消息（`messages.id`），通过该 ID 可查询子 Agent 的完整输出 |

- **前端使用场景**：
  - 查询 `orchestrator_subtasks` 表可获取每个子任务的执行状态、耗时和对应的输出消息
  - `output_message_id` 可直接用于 `GET /messages` 过滤或跳转到具体消息
  - 结合 `depends_on` 字段可渲染 DAG 执行轨迹（Day 13 `GET /orchestrator/tasks/{id}/dag` 端点将提供整合接口）

- **注意事项**：
  - 子任务行的 `agent_id` 对应 `agents.id`，`task_id` 对应 `orchestrator_tasks.id`
  - `execution_order` 字段记录子任务在原 plan 数组中的索引（从 0 开始）
  - Coordinator 模式下的匹配逻辑：通过 `ExecutionTracer.records[].agent_name` → `agent_name_to_agent_id` 映射找到对应的 subtask 行

## 34) AGENTHUB_WORKFLOW_MAX_CONCURRENCY 环境变量（新增于 2026-05-28 Day11-12 双引擎补全）

- **变量名**：`AGENTHUB_WORKFLOW_MAX_CONCURRENCY`
- **默认值**：`3`（未设置时 WorkflowBuilder 最多并行 3 个 Agent）
- **用途**：控制 Static DAG 模式下 ADK Workflow Graph 的最大并行度。设为 `1` 触发 **Plan B2 串行降级**，所有子 Agent 按依赖顺序依次执行。
- **降级场景**：当多 Agent 并发 token 流在 SSE 通道中 Demultiplexing 混乱、或生产环境需要降低 LLM API 并发压力时使用。
- **实现位置**：`backend/app/services/adk/workflow_builder.py` 的 `build()` 方法，通过 `min(len(agent_map), concurrency)` 限制最终 `Workflow.max_concurrency`。
- **应添加到 Convention #26 的环境变量清单**。
