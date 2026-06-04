# AgentHub — CLAUDE.md

## 项目上下文

### 一句话定位

Multi-agent collaboration platform — IM 聊天界面 + ADK 编排引擎，支持单 Agent 对话和群聊协作模式。

### 目录结构

| 目录 | 用途 |
|------|------|
| `backend/` | FastAPI 后端（Python） |
| `agenthub-web/` | React 19 + Semi Design 前端（TypeScript） |
| `docs/` | 架构设计、集成记录 |
| `docs/ai-collab/` | AI 协作约定文档（本目录） |
| `vibeCodingPlan/` | 每日开发计划 |
| `vibeCodingSummary/` | 每日完成总结 |

### 核心依赖

**后端：**
- FastAPI + SQLAlchemy async + PostgreSQL + Redis + MinIO
- Google ADK 2.0 (`google-adk[extensions]==2.0.0`) — Agent 引擎
- LLM SDK: `anthropic`, `openai`, `google-adk` 内置 LiteLlm
- 认证: `python-jose` (JWT) + `passlib[bcrypt]`

**前端：**
- React 19 + TypeScript 6 + Vite 8
- Semi Design 2.x (`@douyinfe/semi-ui`) — UI 组件库
- Zustand 5 — 状态管理
- TanStack React Query 5 — 服务端状态
- Axios — HTTP 客户端
- Monaco Editor, Shiki, Recharts

### 开发启动

```bash
# 一键启动（前后端并行）
npm run dev

# 仅后端
npm run dev:backend

# 仅前端
cd agenthub-web && npm run dev
```

Mock 模式：`VITE_USE_MOCK=false` 切换真实 API，默认 Mock。

### 数据库

- PostgreSQL，通过 SQLAlchemy 异步 ORM 访问
- Schema 迁移使用 Alembic（`backend/alembic/`）
- 内置种子数据：5 个默认 Agent（DeepSeek V4, Claude Opus, GPT-4o, Claude Code CLI, Codex CLI）
- 14 个 Model 表（`backend/app/models/`）

### 关键文件索引

| 文件 | 用途 |
|------|------|
| `backend/app/main.py` | 应用入口 |
| `backend/app/core/config.py` | 所有配置项 |
| `backend/app/core/database.py` | 数据库引擎 + session |
| `backend/app/core/exceptions.py` | 异常体系（AppException → 404/422/401/500） |
| `backend/app/core/middleware.py` | 统一响应包装 |
| `backend/app/core/seed.py` | 默认 Agent 种子数据 |
| `backend/app/api/router.py` | 路由注册中心 |
| `backend/app/services/adapters/base.py` | AgentAdapter 基类 + AdapterRegistry |
| `backend/app/services/adapters/adk_to_sse.py` | ADK Event → SSE 翻译 |
| `backend/app/services/context_assembler.py` | 4 层上下文组装 |
| `backend/app/services/artifact_detector.py` | XML/code block/URL 产物检测 |
| `backend/app/services/adk/runner.py` | ADK Runner 封装 |
| `backend/app/services/adk/coordinator_builder.py` | 动态编排 Coordinator |
| `backend/app/services/adk/workflow_builder.py` | 静态 DAG 编排 |
| `backend/app/services/adk/planner.py` | LLM 任务拆解规划 |
| `backend/app/services/adk/execution_tracer.py` | 执行追踪 + DAG 可视化 |
| `backend/app/services/adk/merge_aggregator.py` | 多 Agent 结果汇总 |
| `backend/app/services/adk/stream_sequentializer.py` | 群聊按序输出 |
| `agenthub-web/src/App.tsx` | 前端入口 + 路由 |
| `agenthub-web/src/lib/api.ts` | 前端 API 客户端 |
| `agenthub-web/src/lib/sse.ts` | SSE 连接管理 |
| `agenthub-web/src/stores/chatStore.ts` | 聊天状态（含流式内容） |

---

## 当前开发状态

> 动态章节。每完成一个模块或修复一个 BUG，更新此节。

**最近更新（2026-06-04）** — 网页预览功能修复

- **产物检测异步化** (`artifact_detector.py`) — `detect_artifacts`、`_detect_xml_artifacts`、`_build_xml_artifact` 改为 async，避免同步 MinIO 上传阻塞事件循环导致连接超时
- **预览服务路由规范** (`preview_server.py`) — 路由改为 `/{preview_id}`，挂载到主应用 `/preview` 前缀下，确保 URL 正确映射
- **前端 iframe 权限补全** (`PreviewCard.tsx`) — 新增 `allow-same-origin allow-forms allow-popups` sandbox 权限，支持网页正常加载
- **产物检测范围扩大** (`artifact_detector.py`) — `_is_embeddable` 改为支持所有 http/https 链接作为网页预览，不仅限特定域名
- **前端代理配置补全** (`vite.config.ts`) — 新增 `/preview` 路由代理到后端，保证预览资源可访问

### 已完成的后端模块

| 模块 | 关键文件 | 状态 |
|------|----------|------|
| Agent CRUD | `api/v1/agents.py`, `services/agent.py` | 完整 CRUD + 用户隔离 + 模型验证 + 连通性验证 |
| 对话 CRUD | `api/v1/conversations.py`, `services/conversation.py` | 分页/软删/钉选/参与者管理 |
| 消息 CRUD | `api/v1/messages.py`, `services/message.py` | 游标分页 + 创建 + 过滤 + 重新生成 |
| SSE 流式传输 | `adapters/adk_to_sse.py`, `conversations.py` | 7 事件翻译 + 消息持久化 + artifact 后处理 |
| Adapter 模式 | `adapters/base.py`, `anthropic_adapter.py`, `litellm_adapter.py`, `cli_adapter.py` | Anthropic + LiteLLM + CLI 三适配器 + AdapterRegistry |
| ADK Runner | `adk/runner.py` | 单聊流式封装 + 会话管理 |
| Planner | `adk/planner.py` | LLM 任务拆解 + refine 修改 + ADK BuiltInPlanner |
| Coordinator 模式 | `adk/coordinator_builder.py` | 协调者动态分派（ADK Collaborative Workflow） |
| DAG Workflow | `adk/workflow_builder.py` | 静态 DAG 执行（ADK Workflow Graph + edges + JoinNode） |
| ExecutionTracer | `adk/execution_tracer.py` | before/after_agent_callback + DAG 数据导出 |
| StreamSequentializer | `adk/stream_sequentializer.py` | 群聊按计划顺序依次输出 |
| MergeAggregator | `adk/merge_aggregator.py` | 多 Agent 结果汇总 + 摘要生成 |
| ContextAssembler | `services/context_assembler.py` | 4 层 TokenBudget 上下文组装 |
| Pin + Spec 注入 | `services/pin_spec_injector.py` | before_model_callback 注入钉选消息和规则 |
| Artifact 检测 | `services/artifact_detector.py` | XML 标签 / code block / URL 自动识别 |
| Artifact 服务 | `services/artifact.py` | 版本管理 + MinIO 存储 + 去重合并 |
| Artifact Format | `services/artifact_format.py` | Agent 输出格式指令注入 |
| CapabilityRegistry | `services/capability_registry.py` | JSONB contains 能力标签匹配 + 聚合 |
| CLI 工具链 | `adk/cli_runner.py`, `adk/cli_tools.py` | Claude Code + Codex 子进程运行 + 5 个内置工具 |
| ToolLoader | `adk/tool_loader.py` | JSONB 配置→ADK FunctionTool/AgentTool 转换 |
| Auth | `api/v1/auth.py`, `services/auth.py` | JWT + refresh + 密码修改 + 邮箱验证码 |
| Project CRUD | `api/v1/projects.py`, `services/project.py` | 基础项目管理 |
| File Upload | `api/v1/files.py`, `services/storage.py` | MinIO 文件上传 + 下载 |
| 响应包装 | `core/middleware.py` | ResponseWrapperMiddleware 自动包装 JSON |
| 异常体系 | `core/exceptions.py` | AppException + 4 个全局 handler |
| DB Seed | `core/seed.py` | 2 个内置 Agent（Claude Code CLI, Codex CLI）|
| OG Fetcher | `services/og_fetcher.py` | 链接预览元数据抓取（SSRF 防护） |
| 预览服务器 | `services/preview_server.py` | 静态 HTML 预览挂载 |
| 数据库迁移 | `alembic/versions/` | 10 个迁移文件（+0006 清理内置 Agent） |
| base_url 路径标准化 | `models.py`, `litellm_adapter.py` | 自动剥离末尾 `/v1/messages`/`/chat/completions` |
| Agent 删除级联 | `services/agent.py` | `sa_delete` 先清理 FK 引用再删 Agent |

### 已完成的前端模块

| 模块 | 关键文件 | 状态 |
|------|----------|------|
| 布局系统 | `AppLayout`, `IconSidebar`, `ChatArea`, `ConversationList` | 三栏布局 + 可调整宽度 |
| 单聊 UI | `MessageList`, `ChatInput`, `MarkdownBubble`, `MessageActions` | 流式渲染 + 操作菜单 |
| SSE 客户端 | `lib/sse.ts` | 7 事件分发 + AbortController 中断 + prompt 传递 |
| 产物卡片 (7 种) | `CardRenderer`, `CodeCard`, `DiffCard`, `FileCard`, `PreviewCard`, `LinkPreviewCard`, `DocumentCard`, `DeployStatusCard` | 代码/对比/预览/文件/链接/部署 |
| Card 冲突解决 | `ConflictResolver` | 多 Agent 冲突文件对比 + 接受/拒绝 |
| Agent 管理 | `AgentManageModal`, `CreateAgentModal`, `AgentDetailPopover` | CRUD + 自定义能力标签 + 自由输入模型名 |
| 群聊 UI | `OrchestratorPlan`, `OrchestratorSummary`, `AgentProgressBar`, `DagGraph`, `ReActPanel` | 计划审批 + DAG 可视化 + 进度 |
| 思维链 | `ThinkingBlock` | 分步 thought/action/observation 展示 |
| Pin 管理 | `PinManager`, `PinnedMessages` | 钉选/取消钉选 |
| 设置页面 | `SettingsPage`, `TokenUsagePanel`, `TokenCharts`, `ThemeRadioCards`, `BgColorCards` | Token 用量 + 主题 + 背景色 |
| 认证 | `LoginPage`, `authStore`, `api.ts` interceptors | JWT + refresh 自动续期 |
| Mock | `mocks/sse.ts`, `mocks/data.ts`, `mocks/handlers.ts` | MSW Mock + SSE Mock |
| 项目 | `ProjectSwitcher`, `ProjectCreateModal` | 项目选择/创建 |
| 状态管理 (6 stores) | `chatStore`, `uiStore`, `authStore`, `agentStore`, `dashboardStore`, `tokenUsageStore` | Zustand 分层 |
| 类型定义 | `types/chat.ts`, `types/agent.ts`, `types/api.ts`, `types/project.ts` | 完整类型覆盖 |
| 单元测试 (14 个) | `stores/__tests__/`, `lib/__tests__/`, `components/__tests__/` | 基础覆盖率 |

### 未完成的模块 / 骨架代码

| 模块 | 现状 | 备注 |
|------|------|------|
| Celery 异步任务 | `celery_app.py` 已配置，`tasks/sample_task.py` 仅为占位符 | 未接入任何业务 |
| Spec Manager DB 版 | 当前为文件系统读取 `.md` 文件 | 需要 DB 版按 conversation/resolution |
| 邮箱验证注册 | `services/email.py` 发送逻辑已实现，需 Resend API key | 注册流程未完整对接 |
| Rate Limiting | config 有 `VERIFY_CODE_RATE_LIMIT_SECONDS` | 未实现中间件 |
| OpenTelemetry / APM | 依赖已存在 | 未集成 |
| 后端测试 (`pytest`) | 仅 15 个测试文件 | 覆盖率低 |
| 消息编辑/删除 | 仅有对话级软删除 | 单条消息无编辑/删除 API |
| WebSocket | 全部基于 SSE（单向） | 无可中断 / 双向通道 |
| Agent 排序 UI | 群聊中 Agent 执行顺序不可拖拽调整 | 后端支持 `execution_order` |
| i18n | 未实现 | 中英文混合硬编码 |
| 移动端适配 | 未专门优化 | `useMediaQuery` 存在但未广泛使用 |
| 前端 E2E 测试 | 无 | 仅有单元测试 |
| 虚拟滚动 | 消息列表不使用虚拟化 | 长会话可能性能下降 |
| Accessibility | 未审计 | |

### 已知问题 & 技术债

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1 | `os.getenv()` 与 pydantic Settings 混用 | 中 | 多处直接 `os.getenv()`，入口虽调用了 `load_dotenv()` 但应统一为 Settings 对象 |
| 2 | SSE 流 auth 为 stub | 低 | `get_current_user_id()` 返回固定 UUID，未对接真实 JWT 用户 |
| 3 | Mock/Real 流分支不一致 | 中 | `_mock_sse_stream` 和 `_adk_sse_stream` 有重复的事件后处理逻辑 |
| 4 | Agent API Key 明文存储 | 高 | `agents.api_key` 字段无加密，数据库泄露风险 |
| 5 | OrchestratorTask 状态机缺超时恢复 | 中 | `planning`/`running` 状态可能卡死，无定期巡检恢复 |
| 6 | Pool 连接数未调优 | 低 | pool_size=20 / max_overflow=10，未针对实际负载测试 |
| 7 | Coordinator 模式与 DAG 模式路由重叠 | 低 | `stream_conversation` 中 `confirmed` 任务仅走 Coordinator，DAG 模式未使用 |
| 8 | CLI Agent 在编排中串行执行 | 高 | 每个 subtask 都启动独立的 `claude -p` 子进程，无法复用会话，N 个 subtask ≈ 96×N 秒 |
| 9 | 代理 API 响应错误被 Translator 吞掉 | 中 | `_to_error()` 只检查 ADK event 属性，LLM 调用异常在 Translator 层被静默忽略 |

### 下一个开发优先级

1. **API Key 加密存储** — Agent 敏感凭据加密/脱敏
2. **测试覆盖率补充** — 后端 pytest 和前端 vitest 关键路径覆盖
3. **Coordinator 分配优化** — 鼓励多 Agent 并行，减少同一 Agent 的串行 subtask 堆积
4. **消息编辑/删除 API** — 前端 MessageContextMenu 已预留入口
5. **Spec Manager DB 版** — 按 conversation 存储和解析规则
6. **CLI 会话复用** — 编排模式下多个 subtask 共享同一 CLI 会话

## 架构约定

### API 响应格式

```json
{
  "code": 200,
  "data": <T> | null,
  "message": "success"
}
```

所有 JSON 响应都会被 `ResponseWrapperMiddleware` 自动包装。错误时 `data` 为 `null`，`message` 包含错误描述。

### 分页格式

```json
{
  "list": <T[]>,
  "total": 0,
  "page": 1,
  "pageSize": 10
}
```

### 命名风格

| 领域 | 风格 | 示例 |
|------|------|------|
| Python 变量/函数 | `snake_case` | `create_message`, `get_db` |
| Python 类 | `PascalCase` | `MessageService`, `AdapterRegistry` |
| API 路由 | `kebab-case` | `/api/v1/conversations/{conv_id}/stream` |
| JSON 请求/响应 | `camelCase` | `senderType`, `agentIds` |
| DB 列 / ORM 字段 | `snake_case` | `sender_type`, `content_type` |
| Pydantic Schema | 声明时 `snake_case`，输出自动 `to_camel` | 定义 `agent_ids` → 输出 `agentIds` |
| URL 查询参数 | `camelCase` | `?plannerAgentId=xxx` |
| 文件名 | `snake_case` | `context_assembler.py` |

### Python 代码结构

```
backend/app/
├── api/v1/          # 路由层 — 薄，只做参数提取 + 分发
├── core/            # 基础设施 — config, db, exceptions, middleware, seed
├── models/          # SQLAlchemy ORM 模型
├── schemas/         # Pydantic Schema（请求/响应）
└── services/        # 业务逻辑
    ├── adapters/    # Agent 适配器层（Provider 抽象）
    ├── adk/         # ADK 引擎集成层
    └── *.py         # 领域服务
```

### Agent 适配器模式

所有 LLM/CLI 通过 `AgentAdapter` 接口统一：

```python
class AgentAdapter(ABC):
    def resolve_model(self, agent) -> Any       # 解析 LLM 模型
    def is_cli(self) -> bool                     # 是否为 CLI Agent
    def build_agent(self, agent, tool_loader)    # 构建 ADK LlmAgent
    async def stream(self, agent, ...)           # SSE 流式执行
    async def verify(self, agent) -> bool        # 连通性验证
```

注册机制：各 adapter 模块 import 时自行调用 `AdapterRegistry.register("provider", AdapterInstance())`。
已注册 provider：`anthropic`, `anthropicllm`, `claude` → `AnthropicAdapter`；`openai`, `litellm`, `deepseek` → `LiteLlmAdapter`；`claude-code-cli`, `codex-cli` → `CliAdapter`。

### SSE 流式协议（7 种事件）

| 事件名 | 触发时机 | 关键字段 |
|--------|----------|----------|
| `message_start` | Agent 开始响应 | `message_id`, `sender`, `meta.plan` |
| `token` | 逐 token 文本增量 | `message_id`, `delta`, `index` |
| `artifact` | 产物生成 | `message_id`, `artifact` |
| `agent_status` | Agent 状态变更 | `message_id`, `agent`, `status`, `progress` |
| `thinking` | 思维链步骤 | `message_id`, `phase`, `text` |
| `message_end` | 消息完成 | `message_id`, `finish_reason`, `usage` |
| `error` | 出错 | `code`, `message`, `retryable` |

### 群聊编排管线

```
用户消息 → [auto_orchestrate] → Planner (LLM拆解任务)
         → [plan_draft]  → 用户审视计划（前端展示 DAG）
         → [refine_plan]  → 用户反馈修改
         → [confirm_plan] → Coordinator 执行 / DAG Workflow 执行
         → MergeAggregator 汇总 → 前端展示
```

3 种执行模式：
- **Coordinator 模式**（`_coordinator_stream`）— 协调者 LLM 动态分派子任务
- **DAG 模式**（`_dag_workflow_stream`）— 按依赖图静态执行（Workflow Graph）
- **单聊** — 单个 Agent 直接响应（CLI 走子进程，LLM 走 ADK Runner）

### 上下文组装（ContextAssembler）

4 层优先级，共享 128K token 预算：
1. Agent system_prompt（25%）
2. Spec Rules（动态加载）
3. Pinned Messages（钉选消息）
4. 聊天历史（70%，最旧优先截断）

### 异常体系

```python
AppException(code, message)  # 基类
├── NotFoundException(404)
├── ValidationException(422)
├── UnauthorizedException(401)
└── InternalException(500)
```

所有异常 → 统一 JSON 输出 `{ code, data: null, message }`。4 个全局 handler 分别在 `core/exceptions.py` 中注册。

### 日期格式

所有时间字段使用 ISO 8601 格式：`datetime.now(timezone.utc).isoformat()` → `2026-06-04T10:30:00.123456+00:00`

### 前端状态管理分层

- **Zustand Stores** — 客户端状态（chatStore, uiStore, authStore, agentStore, dashboardStore, tokenUsageStore）
- **TanStack Query** — 服务端状态（API 缓存、自动重新获取）
- **SSE 管理器**（`lib/sse.ts`）— 流式连接、重连、事件分发

---

## 规则

### 纠正类规则（历史修复过的问题）

【场景】新增环境变量时
【规则】禁止仅使用 `os.getenv()` 读取 — 必须先在 `Settings` 类中声明字段
【原因】Day 8 联调发现 `.env` 中变量未在 Settings 声明会报 ValidationError，且 `os.getenv()` 读不到 pydantic 加载的变量

【场景】SSE 事件流中的 `message_end`/`error` 处理
【规则】禁止先 yield 后落库 — 必须在 yield 前完成消息持久化
【原因】前端收到 `message_end` 后立即 `invalidateQueries()`，此时后端还没写入 DB，消息"显示后消失"

【场景】使用第三方 SDK（如 ADK）返回的 ID
【规则】禁止直接作为数据库主键 — 必须在应用层生成自己的 UUID
【原因】ADK 的 `invocation_id` 格式非标准 UUID（如 `e-5a76d1fb-...`），`UUID()` 抛 ValueError 后静默丢弃消息

【场景】SSE Token 翻译
【规则】必须过滤 `partial=False` 的完整文本事件（若已有增量 token 则跳过）
【原因】ADK 最后一条事件含完整回复内容，前端累积两次（增量+全文），内容重复

【场景】SSE 流结束时缺少 `message_end`
【规则】Translator 循环退出后必须为所有已开始但未结束的 invocation 补发 `message_end`
【原因】中转 API 事件流中 `turn_complete` 可能为 False，前端加载指示器一直旋转

【场景】通过 LiteLLM/中转 API 调用模型（如 DeepSeek）
【规则】Token delta 输出时必须过滤 `part.thought=True` 的内容
【原因】部分模型的响应中包含内部推理 thought 块，若不过滤则泄露到用户对话中

【场景】重构 props 传递链时
【规则】必须追踪完整链路（定义→接收→转发→使用），禁止跳过模块级 memo 组件
【原因】`onRegenerate` 从 CustomEvent 改 props 时漏掉模块级 `MessageBubble` 组件，导致 ReferenceError

【场景】Agent 创建/更新表单
【规则】CLI Agent（claude-code-cli, codex-cli）必须豁免模型名和 API Key/base_url 必填校验
【原因】CLI Agent 在本地运行，不需要远程 API 凭证

【场景】删除数据库中有外键引用的记录（如 Agent）
【规则】禁止使用 ORM 的 `db.delete()`，必须用 `sa_delete(Table).where(...)` 先清理 FK 引用行
【原因】`db.delete()` 的 flush 顺序由 Unit of Work 决定，在复杂 FK 链下可能排序错误导致 IntegrityError

【场景】配置 LLM model 的 `base_url` 时
【规则】必须剥离末尾的 `/v1/messages`（Anthropic）或 `/chat/completions`（OpenAI/LiteLLM）路径片段
【原因】Anthropic SDK 和 LiteLLM 都会在 API 调用时自动追加对应路径，保留完整路径会导致双倍 URL 如 `/v1/messages/v1/messages`

【场景】AI（Planner / Coordinator）分配子任务给 Agent
【规则】Prompt 中必须明确要求"distribute work across different agents"，禁止设计为"display only"
【原因】不明确的 Prompt 会导致 LLM 把所有任务合并到一个 Agent 执行，产生不合理的串行耗时

【场景】SSE 流中长时间的同步 I/O 操作（如文件上传、数据库查询）
【规则】禁止在异步事件循环中直接调用同步操作 — 必须用 `asyncio.get_event_loop().run_in_executor()` 委托给线程池
【原因】同步 I/O 会阻塞事件循环，导致其他请求（包括 iframe 加载）无法被处理，浏览器显示"连接拒绝"

【场景】前端与后端的服务端口配置
【规则】Vite 代理、后端启动命令、前端网络请求的目标端口必须三者一致
【原因】端口不一致会导致连接拒绝，难以排查（看起来是后端问题，实际是路由映射错误）

【场景】预览服务的路由映射
【规则】路由路径不能重复堆叠 — `/preview/{id}` 挂载到 `/preview` 前缀下后，不要再在路由内部加 `/preview` 前缀
【原因】路由重复会导致实际访问路径变成 `/preview/preview/{id}`，前端请求的 `/preview/{id}` 无法匹配

### 偏好类规则（重复强调 ≥2 次）

【场景】定义新 API 端点或 Schema 时
【规则】必须遵循 `{ code: number, data: T | null, message: string }` 统一响应格式
【原因】所有 JSON 响应由 `ResponseWrapperMiddleware` 自动包装，前端 axios interceptor 也依赖此结构

【场景】Schema 字段定义
【规则】必须使用 Pydantic `alias_generator=to_camel`：Python 代码用 `snake_case`，JSON 输出自动转 `camelCase`
【原因】前后端字段名对齐约定（`agent_ids` → `agentIds`），贯串项目始终

【场景】实现列表类查询
【规则】必须使用 `{ list: T[], total, page, pageSize }` 分页格式
【原因】项目统一分页契约，前端所有列表组件按此结构解析

【场景】修改 SSE 协议时
【规则】必须保持 7 种事件类型不变（message_start/token/artifact/agent_status/thinking/message_end/error）
【原因】前端 `sse.ts` 按事件类型分发，任何增删改都需要同步修改前端和协议文档

【场景】开始新功能开发时
【规则】必须先写 Plan（`vibeCodingPlan/`），待确认后实现，完成后写 Summary（`vibeCodingSummary/`）
【原因】项目采用 Vibe Coding 工作流：Plan → Review → Implement → Summarize

【场景】涉及新增接口或字段
【规则】必须在 `docs/ai-collab/` 或 `docs/AgentHub 响应格式与前后端对齐约定.md` 中同步记录约定
【原因】前后端分离开发，接口文档是协作方的唯一契约

【场景】实现完成后
【规则】必须通过 3 项验证：import 检查、`/docs` 可查看端点、curl 测试响应格式正确
【原因】从前端联调到后端部署需要确保接口可用性和结构完整性

【场景】拆分后端开发任务时
【规则】必须区分后端 A（业务 API/数据层/Context Assembler/Artifact）和后端 B（ADK 集成/SSE/Orchestrator）
【原因】20 天计划中 A/B 两个角色各有独立管线，分工明确才能并行推进

【场景】状态管理选型
【规则】必须分层：Zustand 管客户端状态、TanStack Query 管服务端状态、SSE 管实时流式数据
【原因】避免状态来源混乱，减少 useEffect 和手动同步的 BUG 风险

### 边界类规则（曾撤销或发现错误）

【场景】前端的硬编码常量列表（模型选择下拉、能力标签选项等）
【规则】禁止维护硬编码列表 — 用自由输入框（Input + Tag）代替，数据从后端动态获取
【原因】`MODELS_BY_PROVIDER` 和 `CAPABILITY_OPTIONS` 已全部移除，硬编码导致跨步 BUG 和灵活性不足

【场景】Settings 页的 LLM 配置模块
【规则】禁止在前端保留 LLM 全局配置 UI — 每个 Agent 的 API Key/base_url 在 Agent 创建表单中管理
【原因】`LLMConfigSection.tsx`（170 行）从未被后端消费，是死 UI，已删除

【场景】Agent 模型名校验
【规则】禁止对模型名做前缀校验（如要求 `anthropic` provider 的模型以 `claude-` 开头）
【原因】用户知道自己的端点支持什么模型，强制前缀校验没有意义

【场景】`tool_config` 格式
【规则】必须使用 `{ tools: [{type: "builtin", name: "read_file"}] }` 对象数组格式，不再使用字符串数组格式
【原因】后端的 `tool_loader.py` 虽向后兼容字符串数组，但新代码应统一为对象数组格式

---

## Skills

### Agent 对话故障诊断

当 Agent 无法响应或返回空/错误时，参照 `docs/ai-collab/debug-agent-failure.md` 分步排查：
1. 检查后端日志中的错误类型（503/404/model_not_found/URL 双倍等）
2. 验证 base_url 路径格式（Anthropic 不加 `/v1/messages`，LiteLLM 不加 `/chat/completions`）
3. 确认模型名是否被代理提供商支持
