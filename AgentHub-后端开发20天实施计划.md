# AgentHub 后端开发 20 天实施计划（ADK 2.0 集成版）

面向 20 天紧凑周期的快速迭代方案，后端部分由 2 名开发（后端 A、后端 B）协同完成。**本版基于 Google ADK 2.0 技术验证结果重新分工：ADK 提供 Agent 引擎 + Workflow 编排 + 模型适配；自研层负责业务 API + SSE 协议转换 + 定制组件。**

整体思路为**自底向上构建、API 契约先行、ADK 核心先行验证、优先 P0 核心路径、群聊提前验证、后叠加 P1/P2 扩展**。

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

## 角色分工（ADK 2.0 验证版）

| 角色 | 核心职责 | 自研组件 | ADK 相关工作 |
|------|---------|---------|-------------|
| **后端 A** | 业务 API + 数据层 | Context Assembler、Artifact Service、CapabilityRegistry、SpecManager、Meta-Agent | 调用 ADK Session API 读取/写入上下文 |
| **后端 B** | ADK 集成 + 流式管道 + 编排 | ADK-to-SSE Translator、Orchestrator 两阶段协议、ExecutionTracer + DAGBuilder、MergeAggregator | LlmAgent 配置、Workflow Graph 构建、Runner 调用、Planner 集成、模型配置 |
| **前端** | UI 渲染 + 状态管理 | 聊天界面、SSE 客户端、卡片体系 | 消费 SSE 6事件协议 |

---

## 总体目标与时间线（ADK 集成版）

| 阶段 | 时间 | 核心目标 | 后端 A 侧重 (业务+自研组件) | 后端 B 侧重 (ADK+流式+编排) |
|------|------|----------|------------|------------|
| 1 | Day 1-3 | 基础设施 + API 契约 | DB 建表、响应中间件、camelCase、CRUD | ADK 环境搭建、Mock SSE、Agent 种子数据 |
| 2 | Day 4-8 | 单聊 ADK 集成 (P0 里程碑) | 消息内联产物、sender_name、Context Assembler | ADK LlmAgent + Runner + SSE Translator 全链路 |
| 3 | Day 9-13 | 群聊 + ADK Workflow (P0 里程碑) | 计划确认 API、CapabilityRegistry、Meta-Agent | ADK Planner + Workflow Graph + 两阶段协议 + DAG Tracer |
| 4 | Day 14-16 | 群聊完善 + 自研组件补齐 | SpecManager、MergeAggregator 接口 | ADK 容错降级、ExecutionTracer 完善、DAG API |
| 5 | Day 17-18 | P1 产物卡片 + 联调 | Diff/Preview/File Artifact + MinIO 集成 | ADK artifact_delta 映射、前端联调 |
| 6 | Day 19-20 | 集成打磨 + Demo | 种子数据、场景编排 | ADK 容错加固、SSE 重连、压测 |

### 自研组件交付时间表

| 自研组件 | 负责人 | 开始 | 完成 | 说明 |
|---------|--------|------|------|------|
| ADK-to-SSE Translator | 后端B | Day 4 | Day 6 | 最核心组件，Event→6事件SSE |
| Context Assembler | 后端A | Day 6 | Day 7 | 历史+Pin+Rules 组装 |
| Orchestrator 两阶段协议 | 后端B | Day 9 | Day 12 | 计划→确认→执行 |
| CapabilityRegistry | 后端A | Day 9 | Day 14 | Agent 能力注册+匹配 |
| Meta-Agent (Builder) | 后端A | Day 14 | Day 15 | 对话式创建 Agent |
| ExecutionTracer + DAGBuilder | 后端B | Day 11 | Day 16 | 执行轨迹→DAG JSON |
| SpecManager | 后端A | Day 14 | Day 15 | Spec CRUD + 注入 |
| MergeAggregator | 后端B | Day 13 | Day 16 | 结果聚合+仲裁 |

---

## 第一阶段：基础设施 + API 契约对齐（Day 1 - Day 3）

*目标：所有持久化节点跑通，API 响应格式与前端完全一致，Mock SSE 可被前端消费。*

### Day 1：环境 + 核心表 + 响应中间件

**后端 A（业务基础设施）：**
- Docker Compose 拉起 PostgreSQL、Redis、MinIO
- FastAPI 骨架：CORS、全局异常处理、连接池
- **【关键】响应格式中间件**：实现 `{ code, data, message }` 统一包装
- **【关键】Pydantic camelCase 配置**：`alias_generator=to_camel`，所有 Schema 继承统一 BaseModel
- 建表（10 张核心表）

**后端 B（ADK 环境搭建）：**
- `pip install google-adk==2.0.0 anthropic openai` — 安装 ADK + 模型 SDK
- 验证导入：`from google.adk.agents import LlmAgent; from google.adk.workflow import Workflow`
- Agent 种子数据脚本：Claude Code（AnthropicLlm）、Codex（LiteLLM）、OpenCode（LiteLLM）三条内置 Agent
- 创建初始测试用户

### Day 2：基础 CRUD + 分页规范

**后端 A（会话 CRUD）：**
- `POST/GET/PATCH/DELETE /api/v1/conversations` — 返回格式含 `agentIds`
- 分页工具函数：`{ list, total, page, pageSize }`
- 搜索：`keyword` → `ILIKE`；排序：置顶优先 + `last_active_at` 倒序

**后端 B（[ADK] Agent CRUD + 模型配置验证）：**
- `GET /api/v1/agents` — 返回前端期望的 Agent 模型
- `POST /api/v1/agents`、`PATCH /api/v1/agents/{id}`
- **【ADK 验证】** 用 AnthropicLlm 创建一个 LlmAgent 并验证模型连通性：
  ```python
  agent = LlmAgent(name="test", model="claude-sonnet-4-6",
                   instruction="Reply with 'ADK OK'")
  ```

### Day 3：Mock SSE + 消息 API 骨架

**后端 A（消息 API）：**
- `POST /api/v1/conversations/{id}/messages` — 写入消息 + `mentions`
- `GET /api/v1/conversations/{id}/messages` — 游标分页，JOIN artifacts + users/agents

**后端 B（Mock SSE + ADK Runner 预研）：**
- **Mock SSE 端点**：`GET /api/v1/conversations/{id}/stream`，模拟完整 6 种事件序列
- **【ADK 预研】** 编写 `adk_runner_demo.py`：验证 `Runner.run_async()` → `AsyncGenerator[Event]` 的完整生命周期（partial token → turn_complete → usage_metadata）
- 确认 ADK Event 字段映射表与 SSE 6 事件的对应关系

**Day 3 检查点：**
- [ ] 前端可获取会话列表和 Agent 列表（camelCase 格式）
- [ ] 前端 SSE 连接可收到 Mock 事件并渲染消息气泡
- [ ] ADK Runner.run_async() 验证通过，Event 字段映射确认无误

---

## 第二阶段：完整串联 1v1 单聊（Day 4 - Day 8）

*目标：打通真实 LLM 的首字节（TTFB）、流式渲染与历史上下文。这是前端 P0 第一个里程碑。*

### Day 4-5：【ADK 核心】单聊 SSE 全链路

**后端 B（主攻 — ADK 集成 + SSE Translator）：**

**Day 4：ADK 配置 + Translator 骨架**
- 配置 `AnthropicLlm`（Claude）和 LiteLLM（Codex/OpenCode）模型：
  ```python
  from google.adk.models.anthropic_llm import AnthropicLlm
  claude = AnthropicLlm(model="claude-sonnet-4-6")
  ```
- 编写 **[自研] ADK-to-SSE Translator** (`backend/app/services/adapters/adk_to_sse.py`)：
  - `ADKToSSETranslator` 类：消费 `Runner.run_async()` 的 `AsyncGenerator[Event]`
  - 实现 6 种 SSE 事件的转换函数：`_to_message_start()`、`_to_token()`、`_to_artifact()`、`_to_agent_status()`、`_to_message_end()`、`_to_error()`
  - 处理 ADK Event 关键字段：`partial`（流式增量）、`turn_complete`（完成）、`actions.end_of_agent`（子 Agent 结束）、`error_code`（错误）
- 编写 `AgentHubRunner` 封装类，统一单聊/群聊的 ADK 调用入口

**Day 5：端到端打通**
- `GET /api/v1/conversations/{id}/stream` → Forwarder → ADK Runner → Translator → SSE 响应
- `POST /api/v1/messages/{id}/regenerate` → 重新触发 ADK 调用
- 验证：用户发消息 → ADK LlmAgent 调用 Claude → token 流 → SSE → 前端气泡

**后端 A（Context Assembler）：**
- **[自研] Context Assembler** 初版 (`backend/app/services/context_assembler.py`)：
  - `assemble_context(conversation_id)`: 读取最近 N 条消息 + pinned 消息
  - 组装为 ADK `Content` 列表格式
  - 注入到 `runner.run_async(new_message=...)` 前的 `session.state`
- Pin/Unpin 消息端点

**Day 5 检查点（[ADK] 单聊里程碑）：**
- [ ] ADK AnthropicLlm 配置正确，Claude 模型可正常调用
- [ ] SSE Translator 输出符合前端 6 事件协议格式
- [ ] 用户发送消息 → Agent 流式回复 → 前端气泡实时更新（全链路通）

### Day 6-7：上下文完善 + Artifact 初版

**后端 A（Context Assembler 完善）：**
- Context Assembler 增强：
  - 截取最近 N 条消息 + pinned 列表合并
  - 注入 Spec/Skill/Rules（从 SpecManager 读取）
  - **[ADK]** 利用 ADK Session.state 存储上下文元数据
- 消息响应完善：`GET /messages` 确保内联 `artifacts[]` + `sender_name`

**后端 B（[ADK+自研] Artifact 事件流）：**
- 利用 ADK `EventActions.artifact_delta` + `custom_metadata` 机制推送产物
- SSE `artifact` 事件：在 Translator 中检测 `event.custom_metadata["artifact"]` → 转换为 artifact SSE 事件
- Artifact 落库：`artifacts` 表写入
- 验证不同模型（Claude/Codex）在 ADK 下的单聊输出一致性

### Day 8：单聊全链路联调

**后端 A + B 联合：**
- `DELETE /api/v1/conversations/{id}` — 软删除
- Pin/Unpin 消息端点确认
- 单聊完整流程联调：创建会话 → 发消息 → [ADK Runner] → [SSE Translator] → 流式渲染 → 历史加载 → 重生成

**Day 8 检查点（[ADK] P0 单聊就绪）：**
- [ ] 单聊模式：用户消息 → ADK LlmAgent → Claude/Codex → SSE 流式 → 气泡实时更新
- [ ] 消息历史含内联 artifacts + sender_name
- [ ] 会话列表 CRUD 正常
- [ ] Context Assembler 正确传递历史上下文

---

## 第三阶段：群聊 + ADK Native 排演引擎（Day 9 - Day 13）

*目标：实现前端文档第 6 节定义的"计划→确认→执行"两阶段交互协议，借助 Google ADK 的 Orchestration 简化工作量。*

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

### Day 9-10：【ADK 核心】Planner + Workflow + 两阶段协议

**后端 B（主攻 — [ADK] Planner + [自研] 计划生成）：**

**Day 9：Planner 集成 + Plan Schema**
- **[ADK]** 调用 `BuiltInPlanner`：将用户意图拆解为步骤列表
- **[自研]** 将 ADK Planner 输出转为标准 Plan JSON：
  ```json
  { "subtasks": [{ "agentId": "...", "agentName": "...", "instruction": "..." }] }
  ```
- **[ADK]** 根据 Plan JSON 动态构建 Workflow Graph：
  - 可并行子任务 → `Node(parallel_worker=True)`
  - 有依赖子任务 → `Edge(from_node=A, to_node=B)`
  - 设置 `Workflow(max_concurrency=2)`
- **[自研]** 计划消息存储：`sender_type="orchestrator"`，`artifact_type="plan"`

**Day 10：两阶段协议 API**
- **[自研]** `POST /api/v1/conversations/{id}/orchestrator/confirm`：
  - 接收前端确认/调整后的 Plan JSON
  - 更新 Workflow Graph（如有调整）
  - 设置 `state_delta={"plan_confirmed": True}` 触发执行阶段
- **[ADK]** 利用 ADK `state_delta` 机制实现 Phase 1 → Phase 2 的状态传递

**后端 A（CapabilityRegistry + 计划 API）：**
- **[自研] Agent CapabilityRegistry** 初版：
  - 管理 Agent 能力标签（从 `agents.capabilities` JSONB 读取）
  - `match_agents(required_capability: str) → List[Agent]` 查询接口
  - 注入 ADK Planner instruction 作为路由提示
- `orchestrator` sender_type 加入消息模型

### Day 11-12：【ADK 核心】Workflow 并发执行 + SSE 直推

**后端 B（主攻 — [ADK] Workflow 执行 + [自研] 状态映射）：**

**Day 11：Workflow 执行**
- **[ADK]** 将确认后的 Plan → 构建 Workflow Graph → `runner.run_async()` 执行
- **[自研]** ExecutionTracer 初版：在 `after_agent_callback` 中收集：
  - agent_name, start_time, end_time, status, branch
- **[自研]** agent_status SSE 事件映射：
  - `actions.transfer_to_agent` → agent_status(status="running")
  - `actions.end_of_agent` → agent_status(status="done")
  - `Event.branch` → subtask_id

**Day 12：并发流式合并**
- **[ADK+自研]** 多 Agent 并发流式输出：
  - ADK Workflow 并行执行各 Node
  - Translator 按 `Event.branch` 区分不同 Agent 的 token 流
  - 合并推送到同一 SSE 连接（携带不同 sender_id）
- 如果并发 Demultiplexing 混乱 → Plan B2（串行推流）

**后端 A：**
- `orchestrator_subtasks` 表：基于 ADK 执行历史更新（日志记录，非状态驱动）
- 消息/artifacts 流式写入的并发控制

### Day 13：聚合输出 + 群聊联调

**后端 B（[自研] MergeAggregator + DAG 数据接口）：**
- **[自研] MergeAggregator** 初版：
  - 从 ADK Orchestrator Agent 的输出提取聚合摘要
  - 汇总消息写入 messages 表（sender_type="orchestrator"）
- **[自研] DAG 数据接口** 骨架：`GET /api/v1/orchestrator/tasks/{id}/dag`
  - 从 Workflow Graph edges + ExecutionTracer 收集的数据生成 DAG JSON

**后端 A：**
- 群聊消息历史查询：支持按 sender 过滤
- 前后端联调群聊完整流程

**Day 13 检查点（[ADK] P0 群聊就绪）：**
- [ ] 群聊：@多 Agent → [ADK Planner] 拆解 → [自研] 计划卡片 → 确认 → [ADK Workflow] 执行
- [ ] agent_status SSE 事件实时推送，前端 AgentProgressBar 可渲染
- [ ] 多 Agent 输出正确合并，sender 区分清晰

---

## 第四阶段：群聊完善 + 降级容错（Day 14 - Day 16）

*目标：补齐群聊的异常路径和边界情况，确保 Demo 稳定性。*

### Day 14-15：自研组件补齐 + 容错降级

**后端 B（[ADK] 容错 + [自研] 组件完善）：**

**Day 14：ADK 容错机制**
- **[ADK]** `retry_config` 配置：节点失败自动重试 3 次
- **[ADK]** `on_model_error_callback`：捕获 ADK 超时/报错 → SSE `error` 事件
- **[自研]** 错误码映射：AGENT_TIMEOUT / AGENT_UNAVAILABLE / RATE_LIMITED
- SSE `error` 事件完善：`{ code, message, retryable }` 格式

**Day 15：ExecutionTracer + DAGBuilder 完善**
- **[自研]** ExecutionTracer 完善：
  - 收集每个 Node 的 latency_ms、retry_count、status
  - 从 Workflow Graph edges 提取拓扑依赖
- **[自研]** `GET /api/v1/orchestrator/tasks/{id}/dag` 端点完善：
  - 返回 nodes（agentId, instruction, status, latency_ms, retry_count）
  - 返回 edges（from_node, to_node, route 条件）

**后端 A（[自研] CapabilityRegistry + Meta-Agent + SpecManager）：**

**Day 14：CapabilityRegistry 完善**
- **[自研]** Agent 能力标签 CRUD API
- Context Assembler 集成：读取标签 → 注入 ADK instruction

**Day 15：Meta-Agent + SpecManager**
- **[自研] Meta-Agent (Builder Agent)**：
  - 识别"创建 Agent"意图 → 触发多轮对话流程
  - 基于 ADK LlmAgent 实现 Builder：收集需求 → 生成 System Prompt → 能力归类 → 落库
  - 创建完成后返回 Agent 卡片消息
- **[自研] SpecManager**：
  - Spec/Rules CRUD API
  - Context Assembler 集成：在调用 ADK 前注入 Spec 到 `global_instruction`

### Day 16：Orchestrator 可视化 + 群聊异常路径联调

**后端 B：**
- **[自研]** MergeAggregator 完善：冲突检测 + 仲裁解释文本生成
- DAG 数据接口最终联调

**后端 A：**
- 群聊异常路径联调：超时降级、部分成功、重试
- Agent 状态管理 API 完善

---

## 第五阶段：P1 产物卡片 + 前后端集中联调（Day 17 - Day 18）

*目标：支持前端 P1 优先级的产物卡片（Code、Diff、Preview、File），与前端集中联调。*

### Day 17：P1 产物卡片支持

**后端 B（[ADK+自研] 产物映射）：**
- **[ADK]** 利用 `EventActions.artifact_delta` 机制推送产物二进制
- **[自研]** Diff 解析：从 Agent 输出提取代码变更 → artifact type `diff`
- **[自研]** Code artifact：artifact type `code`
- ADK `custom_metadata` 规范：Agent 输出中包含 artifact 数据时，在 `custom_metadata["artifact"]` 中附带结构化 JSON

**后端 A（[自研] Preview + File Artifact）：**
- **[自研]** Preview artifact：`{ url, title, previewType }`，MinIO 托管静态文件
- **[自研]** File artifact：`{ fileName, fileUrl, fileType, fileSize }`
- 文件上传端点：`POST /api/v1/upload` → MinIO → storage_key + URL

### Day 18：集中联调

**后端 A + B + 前端：**
- P0+P1 全链路走通：
  - 单聊代码生成 → [ADK LlmAgent] → [SSE Translator] → CodeCard 渲染
  - 群聊多 Agent → [ADK Workflow] → 多消息气泡 + 各 Agent artifacts
  - Diff 应用 + 预览卡片
  - @mention 自动补全（前端过滤或 Agent 搜索建议 API）
- 所有 API camelCase 序列化确认

---

## 第六阶段：集成打磨与 Demo 准备（Day 19 - Day 20）

*目标：保障 Demo 录制稳定，编排展示场景。*

### Day 19：容错加固 + Demo 场景编排

**后端 B（[ADK] 容错 + SSE 可靠性）：**
- **[ADK]** 全局超时配置：`Workflow(max_concurrency=N, timeout=120.0)`
- **[ADK]** SSE 断线重连：记录最后 event_id，重连时基于 ADK Session 恢复断点
- **[自研]** 错误事件完善：映射 ADK `error_code` 到 AgentHub 错误码体系

**后端 A：**
- 数据库种子数据：预置 3 条 Demo 路线的会话、历史消息、产物
- 环境变量管理：`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、模型选择、超时参数

### Day 20：Demo 联排 + Plan B 降级验证

**全员：**
- **Demo 剧本走查**（3 条路线）：
  1. 单聊代码生成：用户 → [ADK LlmAgent + AnthropicLlm(Claude)] → 生成 React 组件 → CodeCard + 预览
  2. 群聊多 Agent：@Claude + @Codex → [ADK Planner] 拆解 → [自研] 计划卡片 → 确认 → [ADK Workflow] 并行执行 → [自研] MergeAggregator 汇总
  3. 自定义 Agent：[自研 Meta-Agent] 对话式创建 → Agent 出现在列表 → 单聊测试
- **Plan B 降级验证**：Auto-Solve / 串行推流 / 砍 P2 内容
- Demo 视频录制

---

## 风险规避与"救火策略"（Plan B）

如果中途受阻必须做出取舍：

### Plan B1：取消两阶段等待 (Day 10 触发)
若自研的两阶段协议遇阻，退回到 **Auto-Solve**：跳过计划审批，直接让 [ADK Workflow] 自动执行并在群聊中产出结果气泡。Planner 输出仅作为 DAG 可视化数据源。

### Plan B2：降级 ADK SSE 为串行通道 (Day 12 触发)
若多 Agent 并发 token 流在 SSE 通道中 Demultiplexing 混乱，退回到 `Workflow(max_concurrency=1)` 串行执行，各 Agent 依次输出。

### Plan B3：ADK 模型回退 (Day 5 触发)
若 AnthropicLlm 配置遇阻，改用 ADK LiteLLM 通用接口调用 Claude（LiteLLM 支持 100+ 模型，兼容性好）。

### Plan B4：删除 P2 全部内容
若进度落后超过 2 天，砍掉 DeployStatusCard、Docker 沙箱、对话式 Agent 创建（降级为仅表单创建）。

### Plan B5：前端自过滤 @mention
Agent 搜索建议 API 来不及做 → 前端从 `useAgents()` 缓存中过滤匹配。

---

## 与原版计划的关键变化对照

| 变化点 | 原版计划 | 调整后计划 (ADK 2.0 集成版) | 原因 |
|--------|---------|-----------|------|
| 核心引擎驱动 | 手写 Orchestrator + Celery | ADK 2.0 Workflow Graph + Planner | ADK 2.0 废弃 ParallelAgent，Graph 原生产生 DAG |
| 模型适配 | 自研适配器逐一对接 | ADK AnthropicLlm + LiteLLM (100+ 模型) | ADK 直接内置，零适配代码 |
| 多 Agent 编排 | 自研状态机流转 | ADK Workflow (Node/Edge/JoinNode/max_concurrency) | Graph-based 编排更灵活，天然支持可视化 |
| 流式输出 | 自研 SSE Generator | ADK Runner.run_async() → AsyncGenerator[Event] → 自研 Translator 转 SSE | ADK 提供完整 Event 模型，自研仅做协议转换 |
| API 响应格式 | 无统一约定 | Day 1 建立 `{code,data,message}` 中间件 | 前端文档要求 |
| 字段命名 | snake_case | snake_case 存储 + camelCase 序列化 | 前端全量 camelCase |
| 消息内联产物 | 单独查询 | Day 3 起消息响应含 `artifacts[]` | 前端要求 |
| 容错与重试 | Python 层级重试 | ADK retry_config + error callbacks | 标准框架，更可靠 |
| 会话持久化 | 自研 Session 管理 | ADK SessionService (SQLite/PostgreSQL backend) | ADK 提供多种后端 |
| 后端 B 角色 | ADK 集成 + 包装 | ADK 集成 + 5 个自研组件 (Translator/两阶段协议/ExecutionTracer/DAGBuilder/MergeAggregator) | 明确自研组件清单 |
| 后端 A 角色 | 业务 API + CRUD | 业务 API + 5 个自研组件 (ContextAssembler/ArtifactService/CapabilityRegistry/SpecManager/MetaAgent) | 明确自研组件清单 |

---

## ADK 集成关键 API 速查

| ADK API | 用于 AgentHub 的 | 文档位置 |
|---------|-----------------|---------|
| `LlmAgent(name, model, instruction, tools, sub_agents)` | 单聊/群聊 Agent 定义 | `google.adk.agents` |
| `AnthropicLlm(model="claude-sonnet-4-6")` | Claude 模型配置 | `google.adk.models.anthropic_llm` |
| `Runner.run_async(user_id, session_id, new_message)` | 触发 Agent 执行，返回 Event 流 | `google.adk.runners` |
| `Workflow(name, edges, max_concurrency)` | 多 Agent 编排拓扑 | `google.adk.workflow` |
| `Node(name, agent, parallel_worker)` | Workflow 中的 Agent 节点 | `google.adk.workflow` |
| `Edge(from_node, to_node, route)` | Workflow 中的有向边 | `google.adk.workflow` |
| `Event(author, content, partial, turn_complete, actions, branch, ...)` | 流式事件模型 (SSE 转换源) | `google.adk.events` |
| `EventActions(state_delta, artifact_delta, transfer_to_agent, end_of_agent)` | 事件流控动作 | `google.adk.events` |
| `Session(id, state, events)` | 会话上下文 + 历史 | `google.adk.sessions` |
| `before_agent_callback / after_agent_callback` | DAG 执行轨迹拦截点 | `LlmAgent` 参数 |
| `BuiltInPlanner / PlanReActPlanner` | 任务拆解规划 | `google.adk.planners` |
| `RunConfig(streaming_mode=StreamingMode.SSE)` | SSE 流式模式配置 | `google.adk.agents.run_config` |

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


