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
| 6 | 消息 sender_name | 查询时 JOIN `users`/`agents` 表，返回 `sender_name` 字段；**前端类型为 `senderName?: string`（可选），后端 Schema 必须为 `Optional[str]`** |
| 7 | SSE 协议 | 6 种事件（message_start / token / artifact / agent_status / message_end / error），格式见前端文档 5.6 节；**artifact 对象字段使用 `artifactType`（camelCase），与 REST schema `ArtifactBrief.artifact_type` 序列化后一致** |
| 8 | 会话 agentIds | 会话 API 返回 `agentIds: string[]`（从 participants 表聚合），前端不感知 participants 表 |
| 9 | 查询参数命名 | 前端发送 camelCase 查询参数（如 `pageSize`），后端 Query 参数需添加 `alias` 支持（Pydantic `alias_generator` 仅对 body 生效） |
| 10 | avatar_url 非空 | 前端 `Agent.avatarUrl: string` 为非可选字段，后端 `AgentBase.avatar_url` 默认空字符串 `""`，确保永不为 null |
| 11 | sender_type / status 枚举 | 前端定义 `senderType: "user" \| "agent" \| "system" \| "orchestrator"`，`status: "pending" \| "streaming" \| "done" \| "failed"`，后端 `MessageResponse` 使用 `Literal` 类型校验 |
| 12 | 消息 mode 字段 | 前端 `SendMessageRequest.mode?: "auto_orchestrate" \| "auto_orchestrate_dag" \| "direct"`；`auto_orchestrate`=Coordinator 模式（LLM 动态调度），`auto_orchestrate_dag`=Static DAG 模式（Planner 生成依赖图执行），`direct`=单 Agent 直连 |

---

## 角色分工（ADK 2.0 验证版）

| 角色 | 核心职责 | 自研组件 | ADK 相关工作 |
|------|---------|---------|-------------|
| **后端 A** | 业务 API + 数据层 | Pin/Spec 注入 Callback、Artifact Service、CapabilityRegistry、SpecManager CRUD、Meta-Agent | 利用 ADK Session/Memory/Callback 管理上下文（历史消息、状态、跨会话记忆均由 ADK 原生覆盖） |
| **后端 B** | ADK 集成 + 流式管道 + 编排 | ADK-to-SSE Translator、Orchestrator 两阶段协议、ExecutionTracer Callback、MergeAggregator | LlmAgent 配置、Workflow Graph 构建、Runner 调用、Planner 集成、模型配置；ADK 原生提供 Session/State/Memory/retry/callback |
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
| ADK-to-SSE Translator | 后端B | Day 4 | Day 5 | 薄协议适配层，ADK Event → 6事件 SSE |
| Pin/Spec 注入 Callback | 后端A | Day 6 | Day 6 | ~50行，替代原 Context Assembler；ADK Session 自动管理历史 |
| Orchestrator 两阶段协议 | 后端B | Day 9 | Day 12 | 计划→确认→执行（DAG 模式），利用 ADK Planner + Workflow Graph + JoinNode |
| CoordinatorBuilder | 后端B | Day 11 | Day 12 | Coordinator 模式构建器，基于 ADK Collaborative Workflow（sub_agents + mode），LLM 动态调度子 Agent |
| ExecutionTracer Callback | 后端B | Day 11 | Day 11 | ~100行，after_agent_callback 收集计时；DAG 拓扑直接读 Workflow.edges |
| CapabilityRegistry | 后端A | Day 9 | Day 14 | Agent 能力注册+匹配，可借力 ADK AgentRouter |
| Meta-Agent (Builder) | 后端A | Day 14 | Day 15 | 对话式创建 Agent，本质是另一个 LlmAgent + DB 写入工具 |
| SpecManager CRUD | 后端A | Day 14 | Day 15 | Spec CRUD + 版本管理；注入由 ADK callback/InstructionProvider 完成 |
| MergeAggregator | 后端B | Day 13 | Day 16 | 结果聚合+仲裁，本质是 Orchestrator Agent instruction + 后处理 |

> **ADK 原生覆盖、不再需要自研的领域**：Session 历史管理、Session.state 上下文状态、MemoryService 跨会话记忆、retry_config 容错重试、Workflow Graph DAG 拓扑、Planner 任务拆解、模型配置（AnthropicLlm/LiteLLM）、Context Compaction 上下文压缩。

---

## 第一阶段：基础设施 + API 契约对齐（Day 1 - Day 3）

*目标：所有持久化节点跑通，API 响应格式与前端完全一致，Mock SSE 可被前端消费。*

### Day 1：环境 + 核心表 + 响应中间件

**后端 A（业务基础设施）：**
- Docker Compose 拉起 PostgreSQL、Redis、MinIO
- FastAPI 骨架：CORS、全局异常处理、连接池
- **【关键】响应格式中间件**：实现 `{ code, data, message }` 统一包装（`backend/app/core/middleware.py`，已完成）
- **【关键】Pydantic camelCase 配置**：`alias_generator=to_camel`，所有 Schema 继承统一 BaseModel（`backend/app/schemas/base.py`，已完成）
- 建表（10 张核心表）
- **注意**：`alias_generator=to_camel` 仅对 request/response body 生效，查询参数需单独添加 `alias`（如 `page_size: Query(..., alias="pageSize")`）

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
- **注意**：`GET /conversations` 的 `page_size` 查询参数需加 `alias="pageSize"`，因前端发送 `pageSize` 而非 `page_size`

**后端 B（[ADK] Agent CRUD + 模型配置验证）：**
- `GET /api/v1/agents` — 返回前端期望的 Agent 模型
- `POST /api/v1/agents`、`PATCH /api/v1/agents/{id}`
- **注意**：`AgentBase.avatar_url` 默认 `""`（非 Optional），与前端 `avatarUrl: string` 非可选对齐
- **【ADK 验证】** 用 AnthropicLlm 创建一个 LlmAgent 并验证模型连通性：
  ```python
  agent = LlmAgent(name="test", model="claude-sonnet-4-6",
                   instruction="Reply with 'ADK OK'")
  ```

### Day 3：Mock SSE + 消息 API 骨架

**后端 A（消息 API）：**
- `POST /api/v1/conversations/{id}/messages` — 写入消息 + `mentions`
- `GET /api/v1/conversations/{id}/messages` — 游标分页，JOIN artifacts + users/agents
- **Schema 约束**：`MessageResponse.sender_type` 使用 `Literal["user","agent","system","orchestrator"]`；`status` 使用 `Literal["pending","streaming","done","failed"]`；`sender_name` 为 `Optional[str]`（用户消息可能无 sender_name）

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

*目标：打通真实 LLM 的首字节（TTFB）、流式渲染与历史上下文。这是前端 P0 第一个里程碑。ADK 原生覆盖 Session 历史管理、State 上下文、Memory 跨会话记忆，自研部分聚焦于 SSE 协议转换和 Pin/Spec 注入。*

### Day 4-5：【ADK 核心】单聊 SSE 全链路

**后端 B（主攻 — ADK 集成 + SSE Translator）：**

**Day 4：ADK 配置 + Translator 骨架**
- 配置 `AnthropicLlm`（Claude）和 LiteLLM（Codex/OpenCode）模型（ADK 原生，一行代码）：
  ```python
  from google.adk.models.anthropic_llm import AnthropicLlm
  claude = AnthropicLlm(model="claude-sonnet-4-6")
  ```
- 编写 **[自研] ADK-to-SSE Translator** (`backend/app/services/adapters/adk_to_sse.py`)：
  - `ADKToSSETranslator` 类：消费 `Runner.run_async()` 的 `AsyncGenerator[Event]`
  - 实现 6 种 SSE 事件的转换函数：`_to_message_start()`、`_to_token()`、`_to_artifact()`、`_to_agent_status()`、`_to_message_end()`、`_to_error()`
  - 处理 ADK Event 关键字段：`partial`（流式增量）、`turn_complete`（完成）、`actions.end_of_agent`（子 Agent 结束）、`error_code`（错误）
- 编写 `AgentHubRunner` 薄封装类，统一单聊/群聊的 ADK 调用入口

**Day 5：端到端打通**
- `GET /api/v1/conversations/{id}/stream` → Forwarder → ADK Runner → Translator → SSE 响应
- `POST /api/v1/messages/{id}/regenerate` → 重新触发 ADK 调用
- 验证：用户发消息 → ADK LlmAgent 调用 Claude → token 流 → SSE → 前端气泡
- **注意**：ADK Session 自动管理历史消息（`Session.events`），无需手动拼装上下文

**后端 A（Pin/Spec 注入 Callback）：**
- **[自研] Pin + Spec 注入 Callback** (`backend/app/services/pin_spec_injector.py`)：
  - 实现为一个 `before_agent_callback` 函数（~50 行），在每个 Agent 执行前：
    1. 从 DB 读取当前会话的 Pinned 消息
    2. 从 DB 读取适用的 Spec/Rules
    3. 注入到 `LlmRequest.config.system_instruction` 中
  - ADK Session.events 自动提供完整历史消息，**无需手动拼装**
  - ADK Session.state + MemoryService 提供会话状态和跨会话记忆，**无需自研**
- Pin/Unpin 消息端点

**Day 5 检查点（[ADK] 单聊里程碑）：**
- [ ] ADK AnthropicLlm 配置正确，Claude 模型可正常调用
- [ ] SSE Translator 输出符合前端 6 事件协议格式
- [ ] 用户发送消息 → Agent 流式回复 → 前端气泡实时更新（全链路通）
- [ ] ADK Session 自动管理上下文，历史消息正确传递

### Day 6-7：上下文完善 + Artifact 初版

**后端 A（Pin/Spec 注入完善）：**
- Pin/Spec 注入 Callback 增强：
  - 截取最近 N 条消息 + pinned 列表合并（消息历史由 ADK Session 自动管理，仅需额外处理 Pin）
  - Spec/Rules 从 SpecManager 读取并注入（注入机制使用 ADK `before_agent_callback`）
  - 利用 ADK `Session.state` + `{key}` 模板存储上下文元数据（**ADK 原生**）
- 消息响应完善：`GET /messages` 确保内联 `artifacts[]` + `sender_name`

**后端 B（[ADK+自研] Artifact 事件流）：**
- 利用 ADK `EventActions.artifact_delta` + `custom_metadata` 机制推送产物（**ADK 原生提供 artifact pipeline**）
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

**Day 9：Planner 集成 + Plan Schema（DAG 化）**
- **[ADK]** 调用 `BuiltInPlanner`：将用户意图拆解为步骤列表（**ADK 原生，一行 import**）
- **[自研]** Planner Prompt 升级：要求 LLM 分析任务依赖关系，输出带 `dependsOn` 的 DAG Plan：
  ```json
  {
    "subtasks": [
      {
        "subtaskId": "s1",
        "agentId": "...",
        "agentName": "...",
        "instruction": "...",
        "dependsOn": [],
        "mode": "single_turn",
        "outputKey": "result_s1"
      },
      {
        "subtaskId": "s2",
        "dependsOn": ["s1"],
        ...
      }
    ]
  }
  ```
- **[自研]** SubTaskPlan schema 升级 (`schemas/orchestrator.py`)：新增 `depends_on`、`mode`、`output_key` 字段
- **[ADK]** 根据 Plan DAG 动态构建 Workflow Graph（**ADK 原生 API**）：
  - 无依赖子任务 → `Edge(from_node=START, to_node=agent)`
  - 单依赖子任务 → `Edge(from_node=A, to_node=B)`
  - 多依赖子任务 → `JoinNode` 汇聚 → `Edge(from_node=join, to_node=agent)`
  - 多个终端节点 → 最终 `JoinNode` 聚合
  - 设置 `max_concurrency` 控制并行度
- **[自研]** 计划消息存储：`sender_type="orchestrator"`，`artifact_type="plan"`

**Day 10：两阶段协议 API + 数据库迁移**
- **[自研]** `POST /api/v1/conversations/{id}/messages`（`mode="confirm_plan"`）：
  - 接收前端确认/调整后的 Plan JSON（含 dependsOn/mode/outputKey，兼容 camelCase 和 snake_case）
  - 构建 `OrchestratorPlan` 对象验证 schema，调用 WorkflowBuilder 预构建图（验证拓扑）
  - 更新 `OrchestratorTask.status = "confirmed"` 进入执行阶段
  - 阶段状态机：`planning → awaiting_confirmation → confirmed → completed`
- **[自研]** 数据库迁移：`orchestrator_subtasks` 表新增 `depends_on`(JSONB)、`mode`(VARCHAR)、`execution_order`(INTEGER) 列
- **[自研]** 利用 `OrchestratorTask.status` 状态机实现 Phase 1 → Phase 2 的状态传递，stream 端点根据 status + `orchestrateMode` 参数决定进入 Coordinator 或 Static DAG 执行分支

**后端 A（CapabilityRegistry + 计划 API）：**
- **[自研] Agent CapabilityRegistry** 初版：
  - 管理 Agent 能力标签（从 `agents.capabilities` JSONB 读取）
  - `match_agents(required_capability: str) → List[Agent]` 查询接口
  - 可借力 ADK `RoutedAgent`（实验性）实现简单路由；LLM-driven routing 通过 agent `description` 字段自动选择
- `orchestrator` sender_type 加入消息模型

### Day 11-12：【ADK 核心】双模式执行引擎 + SSE 直推

**后端 B（主攻 — [ADK] Static DAG 执行 + [ADK] Coordinator 模式 + [自研] 状态映射）：**

**Day 11：Workflow DAG 执行 + CoordinatorBuilder + ExecutionTracer**
- **[ADK]** Static DAG 模式：确认后的 DAG Plan → WorkflowBuilder 构建 Workflow Graph → `runner.run_async()` 执行（**ADK 原生**）
  - WorkflowBuilder 根据 `depends_on` 生成正确的 Edge + JoinNode 拓扑
  - `max_concurrency` 控制并行度
- **[ADK]** Coordinator 模式（**新增，ADK 2.0 Collaborative Workflow**）：
  - `CoordinatorBuilder` (`services/adk/coordinator_builder.py`)：从 DB Agent 列表动态构建 Coordinator + sub_agents
  - sub_agents 使用 `mode="task"` 或 `mode="single_turn"`，自动返回 Coordinator
  - Coordinator LLM 自动理解意图 → `request_task_<agent_name>` 调度子 Agent
  - 适用于复杂交互任务和用户自定义 Agent 动态注册
- **[自研]** ExecutionTracer Callback（~100行）：在 `after_agent_callback` 中收集：
  - agent_name, start_time, end_time, status
  - DAG 拓扑直接读取 `Workflow.edges`（**Graph 本身就是 DAG，无需自研 DAGBuilder**）
- **[自研]** agent_status SSE 事件映射（Translator 的一部分）：
  - `actions.transfer_to_agent` → agent_status(status="running")
  - `actions.end_of_agent` → agent_status(status="done")
  - `Event.branch` → subtask_id

**Day 12：并发流式合并 + 双模式 SSE 统一**
- **[ADK+自研]** 多 Agent 并发流式输出（两种模式共用同一 SSE 管道）：
  - Static DAG：ADK Workflow 并行执行各 Node，`max_concurrency` 控制
  - Coordinator：LLM 动态 `request_task` 触发子 Agent，ADK 自动管理分支
  - Translator 按 `Event.branch` 区分不同 Agent 的 token 流
  - 合并推送到同一 SSE 连接（携带不同 sender_id）
- 如果并发 Demultiplexing 混乱 → Plan B2（退化为 `max_concurrency=1` 串行）

**后端 A：**
- `orchestrator_subtasks` 表：基于 ADK 执行历史更新（日志记录，非状态驱动）
- 消息/artifacts 流式写入的并发控制

### Day 13：聚合输出 + 群聊联调

**后端 B（[自研] MergeAggregator + DAG 数据接口）：**
- **[自研] MergeAggregator** 初版：
  - 从 ADK Orchestrator Agent 的输出提取聚合摘要
  - 汇总消息写入 messages 表（sender_type="orchestrator"）
- **[自研] DAG 数据接口** 骨架：`GET /api/v1/orchestrator/tasks/{id}/dag`
  - 从 `Workflow.edges`（**ADK 原生 DAG 拓扑**）+ ExecutionTracer Callback 收集的计时数据生成 DAG JSON
  - 原有 DAGBuilder 自研组件取消，替代为从 Workflow Graph 直接读取拓扑

**后端 A：**
- 群聊消息历史查询：支持按 sender 过滤
- 前后端联调群聊完整流程

**Day 13 检查点（P0 群聊就绪）：**
- [ ] 群聊：@多 Agent → Planner 拆解为 DAG Plan → 计划卡片（含依赖关系可视化）→ 确认 → Workflow DAG 执行
- [ ] Coordinator 模式可用：Coordinator LLM 自动调度子 Agent，适用于交互式复杂任务
- [ ] agent_status SSE 事件实时推送，前端 AgentProgressBar 可渲染
- [ ] 多 Agent 输出正确合并，sender 区分清晰
- [ ] 任务按 `dependsOn` 依赖顺序执行，JoinNode 正确汇聚

---

## 第四阶段：群聊完善 + 降级容错（Day 14 - Day 16）

*目标：补齐群聊的异常路径和边界情况，确保 Demo 稳定性。ADK 原生提供 retry_config、error callbacks、Session 持久化，自研聚焦于错误码映射和 DAG 端点完善。*

### Day 14-15：自研组件补齐 + 容错降级

**后端 B（[ADK] 容错 + [自研] 组件完善）：**

**Day 14：ADK 容错机制**
- **[ADK]** `retry_config` 配置：节点失败自动重试 3 次（**ADK 原生**）
- **[ADK]** `on_model_error_callback`：捕获 ADK 超时/报错 → SSE `error` 事件（**ADK 原生 callback 类型**）
- **[自研]** 错误码映射：AGENT_TIMEOUT / AGENT_UNAVAILABLE / RATE_LIMITED（轻量映射表）
- SSE `error` 事件完善：`{ code, message, retryable }` 格式

**Day 15：ExecutionTracer + DAGBuilder 完善**
- **[自研]** ExecutionTracer Callback 完善：
  - 在 `after_agent_callback` 中收集每个 Node 的 latency_ms、retry_count、status
  - DAG 拓扑直接读取 `Workflow.edges`（无需自研 DAGBuilder）
- **[自研]** `GET /api/v1/orchestrator/tasks/{id}/dag` 端点完善：
  - 返回 nodes（agentId, instruction, status, latency_ms, retry_count）
  - 返回 edges（from_node, to_node, route 条件）— 直接从 Workflow.edges 读取

**后端 A（[自研] CapabilityRegistry + Meta-Agent + SpecManager CRUD）：**

**Day 14：CapabilityRegistry 完善**
- **[自研]** Agent 能力标签 CRUD API
- Pin/Spec 注入 Callback 集成：读取标签 → 注入 ADK instruction

**Day 15：Meta-Agent + SpecManager CRUD**
- **[自研] Meta-Agent (Builder Agent)**：
  - 本质是另一个 `LlmAgent`（**ADK 原生**）+ 写入 agents 表的 Tool
  - 识别"创建 Agent"意图 → 触发多轮对话流程
  - 基于 ADK LlmAgent 实现 Builder：收集需求 → 生成 System Prompt → 能力归类 → 落库
  - 创建完成后返回 Agent 卡片消息
- **[自研] SpecManager CRUD**：
  - Spec/Rules CRUD API（**需自研，AgentHub 业务逻辑**）
  - 版本管理
  - 注入部分由 Pin/Spec 注入 Callback 完成（利用 ADK `before_agent_callback`，**不再需要独立的注入引擎**）

### Day 16：Orchestrator 可视化 + 群聊异常路径联调

**后端 B：**
- MergeAggregator 完善：冲突检测 + 仲裁解释文本生成
- DAG 数据接口最终联调

**后端 A：**
- 群聊异常路径联调：超时降级、部分成功、重试
- Agent 状态管理 API 完善

---

## 第五阶段：P1 产物卡片 + 前后端集中联调（Day 17 - Day 18）

*目标：支持前端 P1 优先级的产物卡片（Code、Diff、Preview、File），与前端集中联调。*

### Day 17：P1 产物卡片支持

**后端 B（[ADK+自研] 产物映射）：**
- **[ADK]** 利用 `EventActions.artifact_delta` 机制推送产物（**ADK 原生 artifact pipeline**）
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
- **[ADK]** 全局超时配置：`Workflow(max_concurrency=N, timeout=120.0)`（**ADK 原生参数**）
- **[ADK]** SSE 断线重连：记录最后 event_id，重连时基于 ADK Session 恢复断点（**ADK Session 持久化 + Resume 机制原生支持**）
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
若自研的两阶段协议遇阻，退回到 **Auto-Solve**：跳过计划审批，直接使用 Coordinator 模式自动执行并在群聊中产出结果气泡。Planner 输出仅作为 DAG 可视化数据源。

### Plan B2：降级 SSE 为串行通道 (Day 12 触发)
若多 Agent 并发 token 流在 SSE 通道中 Demultiplexing 混乱，退回到 `max_concurrency=1` 串行执行（Static DAG 模式）或 Coordinator 模式顺序调用子 Agent，各 Agent 依次输出。

### Plan B2.5：Coordinator 模式降级 (Day 12 触发)
若 Coordinator 模式（LLM 动态调度）路由准确性不达标，降级为 Static DAG 模式：Planner 预生成依赖图 → WorkflowBuilder 构建确定性 Graph 执行。

### Plan B3：ADK 模型回退 (Day 5 触发)
若 AnthropicLlm 配置遇阻，改用 ADK LiteLLM 通用接口调用 Claude（LiteLLM 支持 100+ 模型，兼容性好）。

### Plan B4：ADK Session 回退 (Day 4 触发)
若 `DatabaseSessionService`（PostgreSQL backend）配置遇阻，先使用 `InMemorySessionService` 完成功能验证，后续再切换到持久化后端。

### Plan B5：删除 P2 全部内容
若进度落后超过 2 天，砍掉 DeployStatusCard、Docker 沙箱、对话式 Agent 创建（降级为仅表单创建）。

### Plan B6：前端自过滤 @mention
Agent 搜索建议 API 来不及做 → 前端从 `useAgents()` 缓存中过滤匹配。

---

## 与原版计划的关键变化对照

| 变化点 | 原版计划 | 调整后计划 (ADK 2.0 集成版) | 原因 |
|--------|---------|-----------|------|
| 核心引擎驱动 | 手写 Orchestrator + Celery | ADK 2.0 Workflow Graph + Planner | ADK 2.0 废弃 ParallelAgent，Graph 原生产生 DAG |
| 模型适配 | 自研适配器逐一对接 | ADK AnthropicLlm + LiteLLM (100+ 模型) | ADK 直接内置，零适配代码 |
| 多 Agent 编排 | 自研状态机流转 | ADK Workflow Graph (Node/Edge/JoinNode/max_concurrency) + Coordinator 模式 (Collaborative Workflow) | Graph DAG + Coordinator LLM 动态调度双模式，覆盖静态流水线和交互式协作 |
| 流式输出 | 自研 SSE Generator | ADK Runner.run_async() → AsyncGenerator[Event] → 自研 Translator 转 SSE | ADK 提供完整 Event 模型，自研仅做协议转换 |
| 上下文管理 | 自研 Context Assembler（历史+Pin+Rules+State） | **退化为 Pin/Spec 注入 Callback（~50行）+ ADK Session/State/Memory 原生管理** | ADK Session.events 自动历史、State 自动管理、MemoryService 跨会话记忆 |
| DAG 执行轨迹 | 自研 ExecutionTracer + DAGBuilder（收集+构建拓扑） | **退化为 after_agent_callback 计时器 + 直接读 Workflow.edges 拓扑（~100行）** | ADK Workflow Graph 本身就是 DAG，edges 已定义完整拓扑 |
| Spec 注入 | 自研注入引擎 | **ADK before_agent_callback + InstructionProvider 原生注入点** | ADK callback 可拦截并修改 LlmRequest，注入机制完全覆盖 |
| 会话持久化 | 自研 Session 管理 | ADK SessionService (InMemory/Database/VertexAI backend) | ADK 提供多种后端，DatabaseSessionService 直接支持 PostgreSQL |
| 容错与重试 | Python 层级重试 | ADK retry_config + error callbacks（**ADK 原生**） | 标准框架，更可靠 |
| 上下文压缩 | 自研 | ADK Context Compaction（**ADK 原生**） | 长对话自动压缩 |
| API 响应格式 | 无统一约定 | Day 1 建立 `{code,data,message}` 中间件 | 前端文档要求 |
| 字段命名 | snake_case | snake_case 存储 + camelCase 序列化 | 前端全量 camelCase |
| 消息内联产物 | 单独查询 | Day 3 起消息响应含 `artifacts[]` | 前端要求 |
| 后端 B 角色 | ADK 集成 + 5 个自研组件 | ADK 集成 + **3 个自研组件** (Translator/两阶段协议/MergeAggregator) — ExecutionTracer 退化为 callback | 2 个组件被 ADK 原生覆盖或大幅缩减 |
| 后端 A 角色 | 业务 API + 5 个自研组件 | 业务 API + **3 个自研组件** (CapabilityRegistry/SpecManager CRUD/MetaAgent) — Context Assembler 退化为 callback | 2 个组件被 ADK 原生覆盖或大幅缩减 |

### 自研代码量估算变化

| 组件 | 原估算 | 修正后 | 变化 |
|------|--------|--------|------|
| ADK-to-SSE Translator | ~150行 | ~150行 | 不变 |
| Context Assembler | ~300行 | **~50行** (Pin/Spec Callback) | -83% |
| ExecutionTracer + DAGBuilder | ~500行 | **~100行** (Callback + 读 Workflow.edges) | -80% |
| SpecManager 注入部分 | ~200行 | **~20行** (ADK callback 注入) | -90% |
| CapabilityRegistry | ~200行 | ~200行 | 不变 |
| MergeAggregator | ~150行 | ~150行 | 不变 |
| AgentHubRunner | ~100行 | ~100行 | 不变 |
| CoordinatorBuilder | — | **~120行** | 新增 |
| WorkflowBuilder (DAG化) | — | **~80行** (原~30行星型) | 重写 |
| **总计** | **~1600行** | **~970行** | **-39%** |

---

## ADK 集成关键 API 速查

| ADK API | 用于 AgentHub 的 | 文档位置 |
|---------|-----------------|---------|
| `LlmAgent(name, model, instruction, tools, sub_agents)` | 单聊/群聊 Agent 定义 | `google.adk.agents` |
| `AnthropicLlm(model="claude-sonnet-4-6")` | Claude 模型配置 | `google.adk.models.anthropic_llm` |
| `LiteLlm(model="openai/gpt-5")` | Codex/OpenCode 模型配置 | `google.adk.models.litellm` |
| `Runner.run_async(user_id, session_id, new_message)` | 触发 Agent 执行，返回 Event 流 | `google.adk.runners` |
| `Workflow(name, edges, max_concurrency)` | 多 Agent 编排拓扑（**本身就是 DAG**） | `google.adk.workflow` |
| `Edge(from_node, to_node, route)` | Workflow 中的有向边（**即 DAG 拓扑**） | `google.adk.workflow` |
| `Event(author, content, partial, turn_complete, actions, branch, ...)` | 流式事件模型 (SSE 转换源) | `google.adk.events` |
| `EventActions(state_delta, artifact_delta, transfer_to_agent, end_of_agent)` | 事件流控动作 | `google.adk.events` |
| `Session(id, state, events)` | 会话上下文 + 历史（**events 自动管理**） | `google.adk.sessions` |
| `SessionService` / `DatabaseSessionService` | 会话持久化（**支持 PostgreSQL**） | `google.adk.sessions` |
| `MemoryService` / `InMemoryMemoryService` | 跨会话长期记忆（**搜索 + 注入**） | `google.adk.memory` |
| `Session.state` / `{key}` 模板 | 会话状态 + 指令模板注入（**ADK 原生**） | `google.adk.sessions.state` |
| `before_agent_callback / after_agent_callback` | 上下文注入 + 执行轨迹拦截点 | `LlmAgent` 参数 |
| `before_model_callback / after_model_callback` | 模型请求/响应拦截（**Spec 注入 + Guardrail**） | `LlmAgent` 参数 |
| `before_agent_callback → return Content` | 跳过 Agent 执行、直接返回（**缓存/权限控制**） | Callback 返回值机制 |
| `before_model_callback → return LlmResponse` | 跳过 LLM 调用（**缓存命中/策略拦截**） | Callback 返回值机制 |
| `CallbackContext.state / ToolContext.state` | Callback/Tool 中安全修改状态 | ADK Context 对象 |
| `InstructionProvider` | 动态生成 Agent instruction（**可访问 state**） | `google.adk.agents.readonly_context` |
| `BuiltInPlanner / PlanReActPlanner` | 任务拆解规划 | `google.adk.planners` |
| `RunConfig(streaming_mode=StreamingMode.SSE)` | SSE 流式模式配置 | `google.adk.agents.run_config` |
| `retry_config` | 失败自动重试（**ADK 原生**） | `LlmAgent` 参数 |
| `Context Compaction` | 长对话自动压缩（**ADK 原生**） | `google.adk.context` |
| `RoutedAgent` (实验性) | 多 Agent 路由选择（**可借力实现简单路由**） | `google.adk.agents.routing` |
| `load_memory` / `preload_memory` | 内置记忆检索工具 | `google.adk.tools` |
| `ContainerCodeExecutor` | 代码执行沙箱 | `google.adk.tools` |

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


