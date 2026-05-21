# AgentHub 后端开发 20 天实施计划（前端对齐版）

面向 20 天紧凑周期的快速迭代方案，后端部分由 2 名开发（后端 A、后端 B）协同完成。**本版已与 `AgentHub-架构设计前端.md` 的接口契约、数据格式、优先级和交互协议对齐。**

整体思路为**自底向上构建、API 契约先行、优先 P0 核心路径、群聊提前验证、后叠加 P1/P2 扩展**。

---

## 前后端对齐关键约定

以下约定贯穿全部 20 天开发，所有 API 实现必须遵守：

| # | 约定 | 说明 |
|---|------|------|
| 1 | 响应格式 | 统一 `{ code: number, data: T, message: string }` 包裹，通过 FastAPI 中间件实现 |
| 2 | 字段命名 | Python 侧 `snake_case`，序列化时通过 Pydantic `alias_generator` 转 `camelCase` |
| 3 | 分页格式 | 列表接口返回 `{ list: T[], total: number, page: number, pageSize: number }` |
| 4 | 日期格式 | ISO 8601（`2026-05-20T10:00:00Z`） |
| 5 | 消息内联产物 | `GET /messages` 响应中每条 message 直接包含 `artifacts[]` 数组，不做二次查询 |
| 6 | 消息 sender_name | 查询时 JOIN `users`/`agents` 表，返回 `sender_name` 字段 |
| 7 | SSE 协议 | 6 种事件（message_start / token / artifact / agent_status / message_end / error），格式见前端文档 5.6 节 |
| 8 | 会话 agentIds | 会话 API 返回 `agentIds: string[]`（从 participants 表聚合），前端不感知 participants 表 |

---

## 总体目标与时间线

| 阶段 | 时间 | 核心目标 | 后端 A 侧重 | 后端 B 侧重 |
|------|------|----------|------------|------------|
| 1 | Day 1-3 | 基础设施 + API 契约对齐 | DB 建表、响应中间件、camelCase、CRUD | 环境搭建、Mock SSE、Agent 种子数据 |
| 2 | Day 4-8 | 完整串联单聊体验（前端 P0） | 消息内联产物、sender_name、DELETE 端点 | Adapter 对接 Claude、真实 SSE 流式 |
| 3 | Day 9-13 | 群聊 + Orchestrator 两阶段协议 | Meta-Agent（自建 Agent）、计划确认 API | Orchestrator 引擎（意图拆解 → 计划 → 执行） |
| 4 | Day 14-16 | 群聊完善 + Agent 管理 | Agent CRUD 完善、能力注册中心 | 并行调度（Celery）、失败降级、agent_status 推送 |
| 5 | Day 17-18 | P1 产物卡片 + 联调 | Diff 解析、预览 URL 生成 | 产物存储对接、前端联调 |
| 6 | Day 19-20 | 集成打磨 + Demo 准备 | 数据准备、场景编排 | 容错降级、超时控制、压测 |

---

## 第一阶段：基础设施 + API 契约对齐（Day 1 - Day 3）

*目标：所有持久化节点跑通，API 响应格式与前端完全一致，Mock SSE 可被前端消费。*

### Day 1：环境 + 核心表 + 响应中间件

**后端 A：**
- Docker Compose 拉起 PostgreSQL、Redis、MinIO
- FastAPI 骨架：CORS、全局异常处理、连接池
- **【关键】响应格式中间件**：实现 `{ code, data, message }` 统一包装
- **【关键】Pydantic camelCase 配置**：`alias_generator=to_camel`，所有 Schema 继承统一 BaseModel
- 建表（10 张核心表）：users, agents, conversations, conversation_participants, messages, message_mentions, message_pins, artifacts, orchestrator_tasks, orchestrator_subtasks

**后端 B：**
- Celery + Redis Broker 搭建
- Agent 种子数据脚本：（Claude Code、Codex、OpenCode 三条内置 Agent，含能力标签）
- 创建初始测试用户

### Day 2：基础 CRUD + 分页规范

**后端 A：**
- `POST/GET/PATCH/DELETE /api/v1/conversations` — 返回格式含 `agentIds`（从 participants 聚合）
- 分页工具函数：统一返回 `{ list, total, page, pageSize }`
- 搜索支持：`keyword` 参数对 `title` 做 `ILIKE` 模糊匹配
- 排序：置顶优先 + `last_active_at` 倒序

**后端 B：**
- `GET /api/v1/agents` — 返回前端期望的 Agent 模型（`avatar`, `capabilities`, `tools` 等）
- `POST /api/v1/agents` — 创建自定义 Agent，落库
- `PATCH /api/v1/agents/{id}` — 更新 Agent

### Day 3：Mock SSE + 消息 API 骨架

**后端 A：**
- `POST /api/v1/conversations/{id}/messages` — 写入消息，支持 `mentions`（写入 `message_mentions` 表）
- `GET /api/v1/conversations/{id}/messages` — 游标分页，**【关键】JOIN artifacts 表，返回内联 `artifacts[]`**，JOIN users/agents 返回 `sender_name`

**后端 B：**
- **Mock SSE 端点**：`GET /api/v1/conversations/{id}/stream`，模拟完整 6 种事件序列（message_start → 3×token → artifact → message_end），让前端 `sse.ts` 可调试
- SSE 格式严格按照前端 5.6 节：`event: <name>\ndata: <json>\n\n`

**Day 3 检查点：**
- [ ] 前端 `GET /api/v1/conversations` 返回 `{ code, data: { list, total, page, pageSize }, message }`
- [ ] 前端 `GET /api/v1/agents` 返回 camelCase 的 Agent 数组
- [ ] 前端 SSE 连接可收到 Mock 事件并渲染消息气泡

---

## 第二阶段：完整串联 1v1 单聊（Day 4 - Day 8）

*目标：打通真实 LLM 的首字节（TTFB）、流式渲染与历史上下文。这是前端 P0 第一个里程碑。*

### Day 4-5：Adapter 层 + 第一个真实 Agent

**后端 B（主攻）：**
- 实现 Adapter 基类接口：`send_message()`, `stream_message()`, `cancel_run()`, `parse_artifact()`, `health_check()`
- **优先接入 Claude API**（Anthropic SDK），实现流式调用，返回 `AsyncIterator[chunk]`
- 将 LLM chunk 转为 SSE 事件通过 Redis Pub/Sub 广播

**后端 A：**
- `GET /api/v1/conversations/{id}/stream` — 从 Redis Pub/Sub 消费 Agent 流式输出，转为 SSE 推送给前端
- `POST /api/v1/messages/{id}/regenerate` — 重新触发 Agent 调用

### Day 6-7：上下文组装 + 内联产物

**后端 A：**
- **Context Assembler**：
  - 截取最近 N 条消息（可配置，默认 20）
  - 合并所有 pinned 消息
  - 格式化为 LLM 接受的 messages 列表
  - 注入对话绑定的 Rules/Spec（如有）
- **消息响应完善**：`GET /messages` 确保每条消息内联 `artifacts[]`，用 SQL JOIN 或 query 后组装

**后端 B：**
- Adapter `parse_artifact()` — 从 Agent 输出中解析代码块、文件等，写入 `artifacts` 表
- SSE `artifact` 事件 — Agent 产出代码时实时推送 artifact 事件给前端
- 接入第二个 Agent 平台（Codex 或 OpenCode）

### Day 8：单聊全链路联调

**后端 A + B 联合：**
- `DELETE /api/v1/conversations/{id}` — 软删除实现
- Pin/Unpin 消息端点确认
- 与前端联调单聊完整流程：创建会话 → 发送消息 → SSE 流式渲染 → 历史消息加载 → 重新生成

**Day 8 检查点（前端 P0 单聊就绪）：**
- [ ] 单聊模式下，用户发消息 → Agent 流式回复 → 消息气泡实时更新
- [ ] 消息历史加载正确，含内联 artifacts 和 sender_name
- [ ] 会话列表创建/搜索/切换正常
- [ ] 重新生成端点可用

---

## 第三阶段：群聊 + Orchestrator 两阶段协议（Day 9 - Day 13）

*目标：实现前端文档第 6 节定义的"计划→确认→执行"两阶段交互协议。这是项目的核心亮点，也是最大的技术挑战。*

### 两阶段协议回顾（来自前端文档第 6 节）

```
① 用户发送群聊消息（mode: auto_orchestrate）
② Orchestrator 返回"计划消息"（sender_type: orchestrator）
   → 前端渲染 OrchestratorPlan 卡片（含子任务列表：agentId + instruction）
③ 用户确认/调整 → 前端发确认请求
④ Orchestrator 开始执行 → agent_status SSE 推送进度
⑤ 各 Agent 依次/并行流式输出 → 独立消息气泡
⑥ Orchestrator 聚合汇总
```

### Day 9-10：Orchestrator 计划生成

**后端 B（主攻）：**
- **意图拆解（Intent Parser）**：调用 LLM（如 Claude）解析用户消息，输出结构化子任务列表
- **任务规划（Task Planner）**：将子任务与 Agent 能力标签匹配，生成执行计划 JSON
- **计划消息存储与返回**：
  - `sender_type: "orchestrator"`，`content` 包含计划 JSON（子任务列表）
  - 消息中内联一个 `artifact_type: "plan"` 的 artifact，前端以此渲染 `OrchestratorPlan` 卡片
  - `orchestrator_tasks` 表写入记录，状态 `queued`

**后端 A：**
- **计划确认 API**：
  - `POST /api/v1/conversations/{id}/orchestrator/confirm` — 用户确认计划，触发执行
  - body: `{ task_id: "...", assignments: [{agentId, instruction}, ...] }` — 支持用户调整后的指派
- `orchestrator` 作为合法 `sender_type` 加入消息模型

### Day 11-12：Orchestrator 并行执行

**后端 B：**
- **Celery 任务派发**：确认后，将每个子任务作为独立 Celery task 入队
- **并行调用 Adapter**：每个子任务通过对应 Agent 的 Adapter 发起 LLM 调用
- **agent_status SSE 推送**：每个子任务状态变更（queued→running→done/failed）通过 SSE 实时推送
- **各 Agent 流式输出**：每个子 Agent 以独立 `message_start` → `token`* → `artifact`* → `message_end` 生命周期推送

**后端 A：**
- `orchestrator_subtasks` 状态机管理
- 子任务超时监控（默认 45s）
- 消息写入：每个子 Agent 完成后写入 `messages` 表

### Day 13：聚合输出 + 群聊联调

**后端 B：**
- **结果聚合（Result Aggregator）**：所有子任务完成后，生成汇总消息（`sender_type: "orchestrator"`），列出各 Agent 产出
- **冲突检测（Conflict Resolver）**：如多个 Agent 修改同一文件，检测冲突并标记
- **DAG 数据接口**：`GET /api/v1/orchestrator/tasks/{id}/dag` — 返回任务 DAG JSON（节点=子任务，边=依赖），前端可渲染可视化 DAG

**后端 A：**
- 群聊消息历史查询：支持按 sender 过滤
- 前后端联调群聊完整流程

**Day 13 检查点（前端 P0 群聊就绪）：**
- [ ] 群聊模式：用户 @ 多 Agent → Orchestrator 返回计划 → 确认 → 多 Agent 依次回复
- [ ] `agent_status` SSE 事件实时推送，前端 `AgentProgressBar` 可渲染
- [ ] 聚合消息正确汇总各 Agent 产出

---

## 第四阶段：群聊完善 + 降级容错（Day 14 - Day 16）

*目标：补齐群聊的异常路径和边界情况，确保 Demo 稳定性。*

### Day 14-15：失败降级 + 容错

**后端 B：**
- **超时控制**：单 Agent 超时（45s）→ 标记 failed → `agent_status` 推送失败 → Orchestrator 降级处理
- **部分成功（partial_success）**：部分子任务失败时，聚合成功的部分，`orchestrator_tasks.status = "partial_success"`
- **重试机制**：失败子任务可选自动重试一次（换 Agent 重试）

**后端 A：**
- **Agent 能力注册中心**：完善 `agents.capabilities` 字段，Orchestrator 基于能力标签匹配路由
- **Meta-Agent 完善**：
  - 识别"创建 Agent"类消息 → 触发内置 Builder Agent
  - 通过 Tool Calling 自动生成 System Prompt → 能力标签归类 → 配置落库
  - 创建完成后返回 Agent 卡片消息

### Day 16：Orchestrator 可视化 + 前端联调

**后端 B：**
- DAG 数据接口完善：`GET /api/v1/orchestrator/tasks/{id}/dag`
  - 返回节点列表（agentId, instruction, status, latency_ms, retry_count）
  - 返回边列表（依赖关系）
  - 前端可用于渲染任务执行 DAG 图

**后端 A：**
- 与前端联调群聊异常路径：超时降级、部分成功、重试
- Agent 状态管理 API 完善

---

## 第五阶段：P1 产物卡片 + 前后端集中联调（Day 17 - Day 18）

*目标：支持前端 P1 优先级的产物卡片（Code、Diff、Preview、File），与前端集中联调。*

### Day 17：产物卡片支持

**后端 B：**
- **Diff 解析引擎**：从 Agent 输出中通过正则/Function Calling 提取代码变更，转为标准 Diff JSON
  - artifact type `diff`：`{ fileName, language, oldCode, newCode }`
- **代码 artifact**：artifact type `code`：`{ fileName, language, code }`

**后端 A：**
- **Preview artifact**：artifact type `preview`：`{ url, title, previewType }`
  - 网页类产物通过 MinIO 托管静态文件，返回可访问 URL
- **File artifact**：artifact type `file`：`{ fileName, fileUrl, fileType, fileSize }`
- 文件上传端点：`POST /api/v1/upload` → MinIO → 返回 `storage_key` + 访问 URL

### Day 18：集中联调

**后端 A + B + 前端：**
- 逐条走通前端 P0+P1 全链路：
  - 单聊代码生成 → CodeCard 渲染
  - 群聊多 Agent 协作 → 多消息气泡 + 各 Agent artifacts
  - Diff 应用 + 预览卡片
  - @mention 自动补全（后端需提供 Agent 搜索建议 API 或前端从已有 Agent 列表过滤）
- 修复联调中发现的接口格式不一致问题
- 统一确认所有 API 的 camelCase 序列化正确

---

## 第六阶段：集成打磨与 Demo 准备（Day 19 - Day 20）

*目标：保障 Demo 录制稳定，编排展示场景。*

### Day 19：容错加固 + 场景编排

**后端 B：**
- **全局超时与限流**：单 Agent 45s，全局 Celery task 软超时 120s
- **SSE 断线重连**：后端侧记录最后 event_id，重连时可从断点续传（简化版：仅重发最后 message_end）
- **错误事件完善**：AGENT_TIMEOUT / AGENT_UNAVAILABLE / RATE_LIMITED 等错误码

**后端 A：**
- 数据库种子数据准备：预置 Demo 场景的会话、历史消息、产物
- 环境变量与配置管理：Agent API Key、模型选择、超时参数等

### Day 20：Demo 联排 + Plan B 降级验证

**全员：**
- **Demo 剧本走查**（2 条推荐路线）：
  1. 单聊代码生成：用户 → Claude Code → 生成 React 组件 → CodeCard 展示 + 预览
  2. 群聊多 Agent：用户 → @Claude + @Codex → Orchestrator 计划 → 确认 → 并行执行 → 聚合
  3. 自定义 Agent：对话式创建 → 新 Agent 出现在列表 → 单聊测试
- **Plan B 降级验证**：确认以下降级方案可正常工作（见风险策略）
- Demo 视频录制支持

---

## 风险规避与"救火策略"（Plan B）

如果中途受阻必须做出取舍：

### Plan B1：Celery → asyncio.gather（Day 12 触发条件）
若 Day 12 时 Celery 并行调度仍不稳定，立即退回单进程 `asyncio.gather(...)` 并行执行所有 Adapter 调用。代价是失去任务持久化和独立重试能力，但能保证 Demo 中"多个 Agent 同时回复"的体验。

### Plan B2：两阶段协议 → 单阶段自动执行（Day 10 触发条件）
若 Orchestrator 计划→确认→执行的两阶段交互联调困难，降级为：用户发消息 → Orchestrator 自动拆解并直接执行（不等待确认）。代价是失去"用户确认计划"的交互亮点，但保留多 Agent 协作核心流程。

### Plan B3：删除 P2 全部内容
若进度落后超过 2 天，砍掉：
- DeployStatusCard（部署状态卡片）
- Docker 沙箱（代码直接静态展示，不做执行验证）
- 对话式 Agent 创建（降级为仅表单创建）

### Plan B4：前端自过滤 @mention
若来不及做 Agent 搜索建议 API，前端直接从 `useAgents()` 缓存中过滤匹配，后端不需要额外端点。

---

## 与原版计划的关键变化对照

| 变化点 | 原版计划 | 调整后计划 | 原因 |
|--------|---------|-----------|------|
| API 响应格式 | 无统一约定 | Day 1 就建立 `{code,data,message}` 中间件 | 前端文档 5.1 节明确要求 |
| 字段命名 | snake_case | snake_case 存储 + camelCase 序列化 | 前端全量 camelCase |
| 消息内联产物 | 单独查询 | Day 3 起消息响应必含 `artifacts[]` | 前端文档 5.3 节"不做二次查询" |
| sender_name | 无 | Day 3 起 JOIN 返回 | 前端 MessageList 渲染需要 |
| DELETE 会话 | 无 | Day 8 新增 | 前端 hooks 已预留调用 |
| 群聊协议 | 单阶段自动执行 | 两阶段：计划→确认→执行 | 前端文档第 6 节完整定义 |
| 群聊排期 | Day 9-14 | **Day 9-13**（提前 1 天） | 群聊是前端 P0，必须更早可用 |
| 产物卡片 | Day 15-18 才做 | Day 17-18 做 P1 卡片 | 单聊阶段 Agent 就有产物，不应推到后期 |
| 联调缓冲 | 无独立时间 | Day 18 专门联调 + Day 19-20 打磨 | 原计划无联调缓冲 |
| 场景编排 | 无 | Day 19-20 Demo 剧本走查 | 交付物包含 Demo 视频 |
| Plan B | 3 条 | 4 条（新增"两阶段降级"） | Orchestrator 协议新增风险点 |

---

## 每日前后端依赖关系速查

| 前端需要 | 后端最早可用 | 阶段 |
|----------|-------------|------|
| 会话列表（含 agentIds、camelCase） | Day 2 | 阶段 1 |
| Agent 列表（camelCase） | Day 2 | 阶段 1 |
| Mock SSE（6 种事件） | Day 3 | 阶段 1 |
| 单聊 SSE 流式回复 | Day 6 | 阶段 2 |
| 消息历史（内联 artifacts + sender_name） | Day 7 | 阶段 2 |
| DELETE 会话 | Day 8 | 阶段 2 |
| 群聊 Orchestrator 计划返回 | Day 10 | 阶段 3 |
| 群聊确认 API | Day 10 | 阶段 3 |
| agent_status SSE 推送 | Day 11 | 阶段 3 |
| 多 Agent 并行流式输出 | Day 12 | 阶段 3 |
| Orchestrator DAG 数据 | Day 16 | 阶段 4 |
| Code/Diff/Preview/File 卡片 artifact | Day 17 | 阶段 5 |
| 文件上传 | Day 17 | 阶段 5 |
| 降级/容错/错误事件 | Day 19 | 阶段 6 |
